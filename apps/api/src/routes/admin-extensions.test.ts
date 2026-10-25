import { beforeEach, describe, expect, it, vi } from "vitest";

// Boundaries only: DB access, the request's admin session, audit writes and
// the Asterisk config writer. The import route's own parsing/validation logic
// runs for real.
vi.mock("../db/client.js", async () => {
  const schema = await import("../db/schema.js");
  const state = { extensions: [] as Array<Record<string, unknown>> };
  const chainFor = (table: unknown) => {
    const rows = table === schema.extensions ? state.extensions : ([] as unknown[]);
    const chain: Record<string, unknown> = {
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (res: (v: unknown[]) => void, rej?: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  };
  return {
    db: {
      select: () => ({ from: (table: unknown) => chainFor(table) }),
      insert: () => ({
        values: async (values: unknown) => {
          inserted.push(values as Record<string, unknown>);
        },
      }),
      update: () => ({
        set: () => ({ where: async () => undefined }),
      }),
      delete: () => ({ where: async () => undefined }),
    },
    pool: {},
    __extState: state,
  };
});

const inserted: Array<Record<string, unknown>> = [];

vi.mock("../lib/auth.js", () => ({
  requireAdmin: async () => ({ type: "admin", id: "admin-1", email: "admin@example.com" }),
}));

vi.mock("../lib/audit.js", () => ({
  writeAudit: async () => undefined,
}));

vi.mock("../asterisk/config-writer.js", () => ({
  writeAsteriskConfig: async () => undefined,
  tryReloadAsterisk: async () => true,
}));

import { adminExtensionRoutes } from "./admin-extensions.js";

type Handler = (req: unknown, reply: unknown) => Promise<unknown>;

let importHandler: Handler | undefined;
let exportHandler: Handler | undefined;

const { __extState } = (await import("../db/client.js")) as unknown as {
  __extState: { extensions: Array<Record<string, unknown>> };
};

function headerReply() {
  const reply: {
    code: (n: number) => unknown;
    send: (b: unknown) => unknown;
    header: () => unknown;
    status?: number;
  } = {
    code(n: number) {
      reply.status = n;
      return reply;
    },
    send(b: unknown) {
      reply.body = b;
      return reply;
    },
    header() {
      return reply;
    },
  };
  return reply;
}

beforeEach(async () => {
  inserted.length = 0;
  __extState.extensions = [];
  if (importHandler && exportHandler) return;
  const posts: Array<[string, Handler]> = [];
  const gets: Array<[string, Handler]> = [];
  const fakeApp = {
    get: (path: string, handler: Handler) => {
      gets.push([path, handler]);
    },
    post: (path: string, handler: Handler) => {
      posts.push([path, handler]);
    },
    put: () => undefined,
    patch: () => undefined,
    delete: () => undefined,
  };
  await adminExtensionRoutes(fakeApp as never);
  const found = posts.find(([p]) => p === "/api/v1/admin/extensions/import");
  if (!found) throw new Error("import route not registered");
  importHandler = found[1];
  const exportFound = gets.find(([p]) => p === "/api/v1/admin/extensions/export");
  if (!exportFound) throw new Error("export route not registered");
  exportHandler = exportFound[1];
});

function runImport(csv: string): Promise<{ created: number; updated: number; rejected?: number }> {
  return importHandler!({ body: { csv }, ip: "127.0.0.1" }, {}) as Promise<{
    created: number;
    updated: number;
    rejected?: number;
  }>;
}

const HEADER = "number,name\n";

describe("POST /api/v1/admin/extensions/import", () => {
  it("rejects rows whose number violates the create-path schema", async () => {
    // ExtensionCreateSchema enforces number /^\d{2,6}$/; the import path must
    // apply the same contract, otherwise invalid numbers silently enter the
    // extensions table and flow into the generated pjsip/dialplan configs.
    const res = await runImport(
      HEADER + ["abc,Bad Alpha", "1234567,Seven Digits", "1,One Digit", "201,Good Row"].map((r) => r).join("\n"),
    );
    const numbers = inserted.map((v) => v.number);
    expect(numbers, `invalid numbers must not be inserted (got ${numbers.join(",")})`).toEqual([
      "201",
    ]);
    expect(res.created).toBe(1);
    expect(res.rejected).toBe(3);
    expect(res.credentials).toHaveLength(1);
  });

  it("rejects names longer than the create-path schema allows", async () => {
    const res = await runImport(HEADER + `301,${"x".repeat(101)}`);
    expect(inserted).toHaveLength(0);
    expect(res.created).toBe(0);
    expect(res.rejected).toBe(1);
  });

  it("imports a valid row with paired portal + SIP credentials", async () => {
    const res = await runImport(HEADER + "201,Good Row");
    expect(res.created).toBe(1);
    expect(res.credentials).toHaveLength(1);
    const row = inserted[0]!;
    expect(row.number).toBe("201");
    expect(row.name).toBe("Good Row");
    expect(typeof row.portalPasswordHash).toBe("string");
    expect(typeof row.sipSecretEnc).toBe("string");
    expect(row.portalPasswordHash).not.toBe(row.sipSecretEnc);
  });
});

describe("GET /api/v1/admin/extensions/export", () => {
  it("escapes commas, quotes and formula-leading characters in the CSV", async () => {
    __extState.extensions.push({
      id: "e1",
      number: "201",
      name: 'Doe, John "=cmd"',
      email: null,
      dnd: false,
      portalEnabled: true,
    });
    const reply = headerReply();
    const csv = (await exportHandler!({ query: {} }, reply)) as string;
    expect(csv).toContain('"Doe, John ""=cmd"""');
  });

  it("keeps benign rows unchanged (control)", async () => {
    __extState.extensions.push({
      id: "e1",
      number: "201",
      name: "Good Row",
      email: "g@example.com",
      dnd: false,
      portalEnabled: true,
    });
    const reply = headerReply();
    const csv = (await exportHandler!({ query: {} }, reply)) as string;
    expect(csv.split("\n")[1]).toContain("201,Good Row,g@example.com,false,true");
  });
});
