import { beforeEach, describe, expect, it, vi } from "vitest";

// Boundary mocks only: the DB (per-table results so the rollback handler's
// lookups behave realistically), the admin session, audit writes, and the
// Asterisk config writer. The rollback route's own logic runs for real.
vi.mock("../db/client.js", async () => {
  const schema = await import("../db/schema.js");
  const state: {
    flows: Array<Record<string, unknown>>;
    flowVersions: Array<Record<string, unknown>>;
    appliedFlowsUpdates: Array<Record<string, unknown>>;
    cdr: Array<Record<string, unknown>>;
  } = {
    flows: [],
    flowVersions: [],
    appliedFlowsUpdates: [],
    cdr: [],
  };
  const chainFor = (table: unknown) => {
    const rows =
      table === schema.flows
        ? state.flows
        : table === schema.flowVersions
          ? state.flowVersions
          : table === schema.cdr
            ? state.cdr
            : ([] as unknown[]);
    const chain: Record<string, unknown> = {
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      innerJoin: () => chain,
      set: (v: Record<string, unknown>) => {
        state.appliedFlowsUpdates.push(v);
        return chain;
      },
      values: () => chain,
      returning: async () => [],
      then: (res: (v: unknown[]) => void, rej?: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  };
  return {
    db: {
      select: () => ({ from: (table: unknown) => chainFor(table) }),
      insert: () => ({ values: () => chainFor(undefined) }),
      update: () => ({ set: (v: Record<string, unknown>) => chainFor(undefined).set(v) }),
      delete: () => ({ where: () => chainFor(undefined) }),
    },
    pool: {},
    __state: state,
  };
});

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

import { beforeEach, describe, expect, it } from "vitest";

const { __state } = (await import("../db/client.js")) as unknown as {
  __state: {
    flows: Array<Record<string, unknown>>;
    flowVersions: Array<Record<string, unknown>>;
    appliedFlowsUpdates: Array<Record<string, unknown>>;
  };
};

import { adminResourceRoutes } from "./admin-resources.js";

type Handler = (req: unknown, reply: unknown) => Promise<unknown>;

function fakeReply() {
  const reply: {
    code: (n: number) => unknown;
    send: (b: unknown) => unknown;
    header: () => unknown;
    status?: number;
    body?: unknown;
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

let rollback: Handler | undefined;
let cdrExport: Handler | undefined;

beforeEach(async () => {
  __state.flows = [];
  __state.flowVersions = [];
  __state.appliedFlowsUpdates = [];
  __state.cdr = [];
  if (rollback && cdrExport) return;
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
  await adminResourceRoutes(fakeApp as never);
  const found = posts.find(([p]) => p === "/api/v1/admin/flows/:id/rollback");
  if (!found) throw new Error("rollback route not registered");
  rollback = found[1];
  const exportFound = gets.find(([p]) => p === "/api/v1/admin/cdr/export");
  if (!exportFound) throw new Error("cdr export route not registered");
  cdrExport = exportFound[1];
});

const FLOW_A_DRAFT = { nodes: [{ id: "s", type: "start" }], edges: [] };
const FLOW_B_JSON = { nodes: [{ id: "b-start", type: "start" }], edges: [], fromFlowB: true };
const FLOW_A_VERSION_JSON = { nodes: [], edges: [], own: true };

// The fake db resolves the FIRST row of the looked-up table (it does not
// interpret SQL where-clauses), so each test seeds exactly the rows whose
// first-row semantics match the lookup being exercised.
function seed(opts: { versions: Array<{ id: string; flowId: string; json: unknown }> }) {
  __state.flows.push({
    id: "flow-a",
    name: "Flow A",
    draftJson: FLOW_A_DRAFT,
    publishedVersionId: null,
  });
  for (const v of opts.versions) {
    __state.flowVersions.push({ id: v.id, flowId: v.flowId, version: 1, json: v.json });
  }
}

describe("POST /api/v1/admin/flows/:id/rollback", () => {
  it("refuses a version that belongs to another flow", async () => {
    seed({
      versions: [
        { id: "b0000000-0000-4000-8000-00000000000b", flowId: "flow-b", json: FLOW_B_JSON },
        { id: "a0000000-0000-4000-8000-00000000000a", flowId: "flow-a", json: FLOW_A_VERSION_JSON },
      ],
    });
    const reply = fakeReply();
    await rollback!(
      { params: { id: "flow-a" }, body: { versionId: "b0000000-0000-4000-8000-00000000000b" }, ip: "127.0.0.1" },
      reply,
    );
    // The versions list is scoped to the flow; rollback must not reach into
    // another flow's version chain (cross-flow IVR contamination).
    expect(reply.status, `foreign versionId must be rejected with 404 (got ${reply.status})`).toBe(404);
    expect(__state.appliedFlowsUpdates, "no draft/published update may be applied").toHaveLength(0);
  });

  it("rolls back to the flow's own version (control)", async () => {
    seed({ versions: [{ id: "a0000000-0000-4000-8000-00000000000a", flowId: "flow-a", json: FLOW_A_VERSION_JSON }] });
    const reply = fakeReply();
    const res = (await rollback!(
      { params: { id: "flow-a" }, body: { versionId: "a0000000-0000-4000-8000-00000000000a" }, ip: "127.0.0.1" },
      reply,
    )) as { ok?: boolean };
    expect(res?.ok).toBe(true);
    expect(__state.appliedFlowsUpdates).toHaveLength(1);
    const applied = __state.appliedFlowsUpdates[0]!;
    expect(applied.publishedVersionId).toBe("a0000000-0000-4000-8000-00000000000a");
    expect(applied.draftJson).toEqual(FLOW_A_VERSION_JSON);
  });

  it("404s for an unknown versionId (control)", async () => {
    seed({ versions: [] });
    const reply = fakeReply();
    await rollback!(
      {
        params: { id: "flow-a" },
        body: { versionId: "00000000-0000-4000-8000-000000000000" },
        ip: "127.0.0.1",
      },
      reply,
    );
    expect(reply.status).toBe(404);
    expect(__state.appliedFlowsUpdates).toHaveLength(0);
  });
});

describe("GET /api/v1/admin/cdr/export", () => {
  it("neutralizes formula-leading caller data in the CSV", async () => {
    // PSTN caller ID is attacker-controlled: `=…` in a cell becomes a live
    // spreadsheet formula (CWE-1236) when an admin opens the export.
    __state.cdr.push({
      callId: "1750000000.1",
      startedAt: new Date("2026-10-25T10:00:00Z"),
      direction: "inbound",
      caller: "=1+1",
      callee: "05321112233",
      disposition: "ANSWERED",
      duration: 10,
      billsec: 8,
      dndFlag: false,
    });
    const body = (await cdrExport!({ query: {} }, fakeReply())) as string;
    // Caller is the 4th field; the formula-leading cell must carry the
    // neutralizing apostrophe (a raw "=1+1" cell would execute in Excel).
    expect(body.split("\n")[1]).toContain(",'=1+1,");
  });

  it("quotes commas and embedded quotes so rows keep their shape", async () => {
    __state.cdr.push({
      callId: "1750000000.2",
      startedAt: new Date("2026-10-25T10:05:00Z"),
      direction: "inbound",
      caller: '0"5,32',
      callee: "05321112233",
      disposition: "ANSWERED",
      duration: 10,
      billsec: 8,
      dndFlag: false,
    });
    const body = (await cdrExport!({ query: {} }, fakeReply())) as string;
    const line = body.split("\n")[1]!;
    // Exactly one data line despite the comma/quote in the caller cell.
    expect(body.trim().split("\n")).toHaveLength(2);
    expect(line).toContain('"0""5,32"');
  });

  it("keeps benign rows unchanged (control)", async () => {
    __state.cdr.push({
      callId: "1750000000.3",
      startedAt: new Date("2026-10-25T10:10:00Z"),
      direction: "outbound",
      caller: "201",
      callee: "05321112233",
      disposition: "ANSWERED",
      duration: 30,
      billsec: 25,
      dndFlag: false,
    });
    const body = (await cdrExport!({ query: {} }, fakeReply())) as string;
    expect(body.split("\n")[1]).toContain(",201,05321112233,");
  });
});
