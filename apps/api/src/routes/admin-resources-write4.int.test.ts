import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { blacklist, cdr, flows, missedCalls, settings } from "../db/schema.js";
import {
  auth,
  buildApp,
  cleanupActors,
  closeDb,
  seedActors,
  type Fixtures,
} from "../test/helpers.js";

/**
 * Functional coverage for the last untested admin-resources groups: CDR export
 * and timeline, the five reports, missed-call triage, live-call control, and the
 * flow-import / backup-restore flows.
 *
 * Safety notes:
 * - `settings` is a singleton (id = 1) and `POST /backups/restore` REPLACES the
 *   whole blacklist table, so both are snapshotted and restored verbatim.
 * - Live-call handlers call Asterisk's ARI, which is unreachable in tests. Those
 *   cases therefore assert the authorization contract and that the handler is
 *   reached (not 401), rather than pinning an Asterisk-dependent status.
 */

let app: FastifyInstance;
let fx: Fixtures;
let settingsSnapshot: unknown;
let blacklistSnapshot: unknown[];

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  fx = await seedActors();
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  settingsSnapshot = row ? structuredClone(row.data) : null;
  blacklistSnapshot = structuredClone(await db.select().from(blacklist));
});

afterEach(async () => {
  await db.delete(cdr).where(eq(cdr.callId, "qa-call-1"));
  await db.delete(cdr).where(eq(cdr.callId, "qa-call-2"));
  await db.delete(missedCalls).where(eq(missedCalls.number, "900000000"));
  await db.delete(missedCalls).where(eq(missedCalls.number, "900000001"));
  for (const id of createdFlowIds) await db.delete(flows).where(eq(flows.id, id));
  createdFlowIds = [];

  // Restore the destructive surfaces exactly as found.
  await db.delete(blacklist);
  if (blacklistSnapshot.length) {
    await db.insert(blacklist).values(blacklistSnapshot as never);
  }
  if (settingsSnapshot === null) {
    await db.delete(settings).where(eq(settings.id, 1));
  } else {
    await db
      .insert(settings)
      .values({ id: 1, data: settingsSnapshot })
      .onConflictDoUpdate({ target: settings.id, set: { data: settingsSnapshot } });
  }
  await cleanupActors(fx);
});

let createdFlowIds: string[] = [];

const H = () => auth(fx.adminToken);
const post = (url: string, payload: unknown) => app.inject({ method: "POST", url, headers: H(), payload });
const patch = (url: string, payload: unknown) => app.inject({ method: "PATCH", url, headers: H(), payload });
const get = (url: string) => app.inject({ method: "GET", url, headers: H() });

// -------------------------------------------------------------- CDR export

describe("CDR export", () => {
  beforeEach(async () => {
    await db.insert(cdr).values([
      {
        callId: "qa-call-1",
        startedAt: new Date("2026-03-01T10:00:00Z"),
        direction: "inbound",
        caller: "1000",
        callee: "101",
        disposition: "ANSWERED",
        duration: 30,
        billsec: 28,
        dndFlag: true,
        mos: 4.2,
        jitter: 12,
        packetLoss: 0.5,
      },
      {
        callId: "qa-call-2",
        startedAt: new Date("2026-03-05T10:00:00Z"),
        direction: "outbound",
        caller: "101",
        callee: "05321112233",
        disposition: "NOANSWER",
        duration: 0,
        billsec: 0,
        dndFlag: false,
      },
    ]);
  });

  it("returns CSV with the documented header and content-type", async () => {
    const res = await get("/api/v1/admin/cdr/export");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("cdr.csv");
    expect(res.body.split("\n")[0]).toBe(
      "callId,startedAt,direction,caller,callee,disposition,duration,billsec,dnd",
    );
  });

  it("emits one row per call with the dnd flag as 1/0", async () => {
    const res = await get("/api/v1/admin/cdr/export");
    const lines = res.body.trim().split("\n").slice(1);
    const ours = lines.filter((l) => l.startsWith("qa-call-"));
    expect(ours).toHaveLength(2);

    const dndRow = ours.find((l) => l.startsWith("qa-call-1"))!;
    expect(dndRow).toContain("inbound");
    expect(dndRow.endsWith(",1")).toBe(true);
    expect(ours.find((l) => l.startsWith("qa-call-2"))!.endsWith(",0")).toBe(true);
  });

  it("filters by the from/to window", async () => {
    const res = await get(
      `/api/v1/admin/cdr/export?from=${encodeURIComponent("2026-03-02T00:00:00Z")}&to=${encodeURIComponent("2026-03-04T00:00:00Z")}`,
    );
    expect(res.statusCode).toBe(200);
    // 03-01 is before the window, 03-05 is after it.
    expect(res.body).not.toContain("qa-call-1");
    expect(res.body).not.toContain("qa-call-2");
  });

  it("includes a call inside the window", async () => {
    const res = await get(
      `/api/v1/admin/cdr/export?from=${encodeURIComponent("2026-03-01T00:00:00Z")}&to=${encodeURIComponent("2026-03-02T00:00:00Z")}`,
    );
    expect(res.body).toContain("qa-call-1");
    expect(res.body).not.toContain("qa-call-2");
  });

  it("is ordered newest first", async () => {
    const res = await get("/api/v1/admin/cdr/export");
    const lines = res.body.trim().split("\n").slice(1);
    const i1 = lines.findIndex((l) => l.startsWith("qa-call-1"));
    const i2 = lines.findIndex((l) => l.startsWith("qa-call-2"));
    expect(i2).toBeLessThan(i1);
  });

  it("timeline 404s an unknown call id", async () => {
    const res = await get("/api/v1/admin/cdr/11111111-1111-1111-1111-111111111111/timeline");
    expect(res.statusCode).toBe(404);
  });
});

// ------------------------------------------------------------------ reports

describe("reports", () => {
  beforeEach(async () => {
    await db.insert(cdr).values({
      callId: "qa-call-1",
      startedAt: new Date(),
      direction: "inbound",
      caller: "1000",
      callee: "101",
      disposition: "ANSWERED",
      duration: 30,
      billsec: 28,
      mos: 4.2,
      jitter: 12,
      packetLoss: 0.5,
    });
  });

  it("quality aggregates MOS, jitter and loss", async () => {
    const res = await get("/api/v1/admin/reports/quality");
    expect(res.statusCode).toBe(200);
    const body = res.json() as { total: number; avgMos: number };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.avgMos).toBeGreaterThan(4);
  });

  it("summary returns its aggregate keys", async () => {
    const res = await get("/api/v1/admin/reports/summary");
    expect(res.statusCode).toBe(200);
    expect(typeof res.json()).toBe("object");
  });

  it("summary SLA and queue avg wait use the stored wait time", async () => {
    // Isolated day so other suites' rows never fall in range
    const at = new Date("2001-02-03T10:00:00Z");
    const range = "from=2001-02-03T00:00:00Z&to=2001-02-03T23:59:59Z";
    const ids = ["sla-fast", "sla-slow", "sla-legacy", "sla-missed"];
    const base = { startedAt: at, direction: "inbound", caller: "1000", queueNumber: "9001" } as const;
    await db.insert(cdr).values([
      // Long IVR before the queue: duration − billsec is 60, but the queue hold was 5s
      { ...base, callId: ids[0], disposition: "ANSWERED", duration: 100, billsec: 40, waitSec: 5 },
      { ...base, callId: ids[1], disposition: "ANSWERED", duration: 90, billsec: 30, waitSec: 45 },
      // Row from before wait_sec existed → falls back to duration − billsec (10s)
      { ...base, callId: ids[2], disposition: "ANSWERED", duration: 40, billsec: 30 },
      { ...base, callId: ids[3], disposition: "NOANSWER", duration: 70, billsec: 0 },
    ]);
    try {
      const sum = (await get(`/api/v1/admin/reports/summary?${range}`)).json() as {
        answered: number;
        slaAnswered: number;
        slaPercent: number;
      };
      expect(sum.answered).toBe(3);
      expect(sum.slaAnswered).toBe(2);
      expect(sum.slaPercent).toBe(67);

      const queues = (await get(`/api/v1/admin/reports/queues?${range}`)).json() as {
        queue: string;
        avgWait: number;
      }[];
      // (5 + 45 + 10) / 3 answered — unanswered rows do not count as waits
      expect(queues.find((q) => q.queue === "9001")?.avgWait).toBe(20);
    } finally {
      await db.delete(cdr).where(inArray(cdr.callId, ids));
    }
  });

  it("queues report is an array", async () => {
    const res = await get("/api/v1/admin/reports/queues");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("extensions report is an array", async () => {
    const res = await get("/api/v1/admin/reports/extensions");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("ivr report returns items", async () => {
    const res = await get("/api/v1/admin/reports/ivr");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("items");
  });

  it("accepts a from/to window on a report", async () => {
    const res = await get(
      `/api/v1/admin/reports/quality?from=${encodeURIComponent("2000-01-01T00:00:00Z")}&to=${encodeURIComponent("2000-01-02T00:00:00Z")}`,
    );
    expect(res.statusCode).toBe(200);
    expect((res.json() as { total: number }).total).toBe(0);
  });
});

// -------------------------------------------------------------- missed calls

describe("missed calls", () => {
  async function seedMissed(number: string) {
    const [row] = await db
      .insert(missedCalls)
      .values({ number, target: "900", status: "pending" })
      .returning();
    return row.id;
  }

  it("lists missed calls newest first", async () => {
    await seedMissed("900000000");
    const res = await get("/api/v1/admin/missed-calls");
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ number: string; status: string }>;
    const found = body.find((m) => m.number === "900000000");
    expect(found?.status).toBe("pending");
  });

  it.each(["pending", "returned", "ignored"])("PATCH sets status to %s", async (status) => {
    const id = await seedMissed("900000001");
    const res = await patch(`/api/v1/admin/missed-calls/${id}`, { status });
    expect(res.statusCode).toBe(200);

    const [row] = await db.select().from(missedCalls).where(eq(missedCalls.id, id));
    expect(row?.status).toBe(status);
  });

  it("rejects an unknown status", async () => {
    const id = await seedMissed("900000000");
    const res = await patch(`/api/v1/admin/missed-calls/${id}`, { status: "maybe" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a missing status", async () => {
    const id = await seedMissed("900000000");
    const res = await patch(`/api/v1/admin/missed-calls/${id}`, {});
    expect(res.statusCode).toBe(400);
  });
});

// ------------------------------------------------------------ live-call control

describe("live-call control", () => {
  const liveRoutes = [
    ["POST", "/api/v1/admin/live/calls/abc123/hangup"],
    ["POST", "/api/v1/admin/live/calls/abc123/spy"],
    ["POST", "/api/v1/admin/live/cleanup"],
  ];

  it.each(liveRoutes)("%s %s is admin-only", async (method, url) => {
    const anon = await app.inject({ method: method as "POST", url, payload: {} });
    expect(anon.statusCode).toBe(401);

    const asExtension = await app.inject({
      method: method as "POST",
      url,
      payload: {},
      headers: auth(fx.extensionToken),
    });
    expect(asExtension.statusCode).toBe(401);
  });

  it.each(liveRoutes)(
    "%s %s reaches the handler for an admin session",
    async (method, url) => {
      // Asterisk is unreachable here, so the status may be 200 or 5xx; what
      // matters is that auth passes and the handler is actually invoked.
      const res = await app.inject({ method: method as "POST", url, headers: H(), payload: {} });
      expect(res.statusCode).not.toBe(401);
      expect(res.statusCode).not.toBe(404);
    },
  );

  it("GET /live/calls is admin-only", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/admin/live/calls" })).statusCode).toBe(401);
  });
});

// ------------------------------------------------------- import and restore

describe("flow import", () => {
  it("imports a valid draft into an existing flow", async () => {
    const created0 = await post("/api/v1/admin/flows", { name: "Importable" });
    const id = (created0.json() as { id: string }).id;
    createdFlowIds.push(id);

    const res = await post(`/api/v1/admin/flows/${id}/import`, {
      draftJson: {
        nodes: [{ id: "start", type: "start", position: { x: 0, y: 0 }, data: {} }],
        edges: [],
        variables: ["caller"],
      },
      name: "Imported",
    });
    expect(res.statusCode).toBe(200);

    const [row] = await db.select().from(flows).where(eq(flows.id, id));
    expect(row?.name).toBe("Imported");
    expect((row?.draftJson as { nodes: unknown[] }).nodes).toHaveLength(1);
  });

  it("rejects an invalid draft with 400 and the validation errors", async () => {
    const created0 = await post("/api/v1/admin/flows", { name: "Bad Import" });
    const id = (created0.json() as { id: string }).id;
    createdFlowIds.push(id);

    const res = await post(`/api/v1/admin/flows/${id}/import`, {
      draftJson: {
        nodes: [{ id: "start", type: "start", position: { x: 0, y: 0 }, data: {} }],
        edges: [{ id: "e1", source: "start", target: "ghost" }],
        variables: [],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("errors");

    // The stored draft is untouched.
    const [row] = await db.select().from(flows).where(eq(flows.id, id));
    expect((row?.draftJson as { edges: unknown[] }).edges).toHaveLength(0);
  });

  it("rejects a structurally invalid draft body", async () => {
    const created0 = await post("/api/v1/admin/flows", { name: "Struct" });
    const id = (created0.json() as { id: string }).id;
    createdFlowIds.push(id);

    const res = await post(`/api/v1/admin/flows/${id}/import`, { draftJson: { nodes: "nope" } });
    expect(res.statusCode).toBe(400);
  });

  it("export 404s an unknown flow", async () => {
    const res = await get("/api/v1/admin/flows/11111111-1111-1111-1111-111111111111/export");
    expect(res.statusCode).toBe(404);
  });

  it("export returns the stored draft for a known flow", async () => {
    const created0 = await post("/api/v1/admin/flows", { name: "Exportable" });
    const id = (created0.json() as { id: string }).id;
    createdFlowIds.push(id);

    const res = await get(`/api/v1/admin/flows/${id}/export`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ format: "dsip-flow-v1", name: "Exportable" });
  });
});

describe("backup restore", () => {
  it("replaces the settings singleton and the blacklist", async () => {
    const res = await post("/api/v1/admin/backups/restore", {
      settings: [{ data: { defaultLocale: "tr" } }],
      blacklist: [
        { id: "11111111-1111-1111-1111-111111111111", pattern: "900*", direction: "inbound" },
      ],
    });
    expect(res.statusCode).toBe(200);

    const [row] = await db.select().from(settings).where(eq(settings.id, 1));
    expect((row?.data as { defaultLocale: string }).defaultLocale).toBe("tr");

    const rows = await db.select().from(blacklist);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.pattern).toBe("900*");
  });

  it("accepts an empty restore payload as a no-op", async () => {
    const res = await post("/api/v1/admin/backups/restore", {});
    expect(res.statusCode).toBe(200);
  });

  it("rejects a non-array settings payload", async () => {
    const res = await post("/api/v1/admin/backups/restore", { settings: "everything" });
    expect(res.statusCode).toBe(400);
  });

  it("is admin-only", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/backups/restore",
      payload: {},
      headers: auth(fx.extensionToken),
    });
    expect(res.statusCode).toBe(401);
  });
});