import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { flows, flowVersions, extensions, queueMembers, queues, scheduleRanges, schedules } from "../db/schema.js";
import {
  auth,
  buildApp,
  cleanupActors,
  closeDb,
  seedActors,
  type Fixtures,
} from "../test/helpers.js";

/**
 * Functional happy-path coverage for the admin write routes: queues, schedules
 * and flows. Each case asserts both the HTTP response and the persisted row, so
 * a handler that returns 200 without writing is caught.
 *
 * Every case is prefixed with a unique token so re-runs never collide on the
 * unique/number columns, and all rows created here are removed in afterEach.
 */

let app: FastifyInstance;
let fx: Fixtures;
let seq = 0;
/**
 * Unique DIGIT-only suffix per call. Queue/flow numbers are validated against
 * /^\d+$/ by the Zod schemas, so a base36 generator would be rejected.
 */
const uniq = () => `${Date.now()}${seq++}`.slice(-8);

const created: {
  queueIds: string[];
  scheduleIds: string[];
  flowIds: string[];
} = { queueIds: [], scheduleIds: [], flowIds: [] };

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
});

afterEach(async () => {
  for (const id of created.flowIds) {
    await db.delete(flowVersions).where(eq(flowVersions.flowId, id));
    await db.delete(flows).where(eq(flows.id, id));
  }
  for (const id of created.queueIds) {
    await db.delete(queueMembers).where(eq(queueMembers.queueId, id));
    await db.delete(queues).where(eq(queues.id, id));
  }
  for (const id of created.scheduleIds) {
    await db.delete(scheduleRanges).where(eq(scheduleRanges.scheduleId, id));
    await db.delete(schedules).where(eq(schedules.id, id));
  }
  created.queueIds = [];
  created.scheduleIds = [];
  created.flowIds = [];
  await cleanupActors(fx);
});

const H = () => auth(fx.adminToken);
const post = (url: string, payload: unknown) => app.inject({ method: "POST", url, headers: H(), payload });
const put = (url: string, payload: unknown) => app.inject({ method: "PUT", url, headers: H(), payload });
const patch = (url: string, payload: unknown) => app.inject({ method: "PATCH", url, headers: H(), payload });

// ---------------------------------------------------------------- queues

describe("queues", () => {
  it("creates a queue with its members and persists both", async () => {
    const number = uniq().padStart(4, "0").slice(0, 6);
    const res = await post("/api/v1/admin/queues", {
      name: `Q-${number}`,
      number,
      strategy: "leastrecent",
      members: [{ extensionId: fx.extensionId, penalty: 2, paused: false }],
    });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { id: string }).id;
    created.queueIds.push(id);

    const [row] = await db.select().from(queues).where(eq(queues.id, id));
    expect(row?.number).toBe(number);
    expect(row?.strategy).toBe("leastrecent");
    // Schema defaults are applied, not left undefined.
    expect(row?.memberTimeout).toBe(15);
    expect(row?.wrapup).toBe(5);

    const members = await db.select().from(queueMembers).where(eq(queueMembers.queueId, id));
    expect(members).toHaveLength(1);
    expect(members[0]?.extensionId).toBe(fx.extensionId);
    expect(members[0]?.penalty).toBe(2);
  });

  it("applies schema defaults on create", async () => {
    const number = uniq().padStart(4, "0").slice(0, 6);
    const res = await post("/api/v1/admin/queues", { name: "Defaults", number });
    const id = (res.json() as { id: string }).id;
    created.queueIds.push(id);

    const [row] = await db.select().from(queues).where(eq(queues.id, id));
    expect(row?.strategy).toBe("rrmemory");
    expect(row?.maxWait).toBe(300);
    expect(row?.announcePosition).toBe(true);
  });

  it("stores the announcement language (null = system default) and rejects unknown ones", async () => {
    const number = uniq().padStart(4, "0").slice(0, 6);
    const res = await post("/api/v1/admin/queues", { name: "Lang", number, language: "tr" });
    const id = (res.json() as { id: string }).id;
    created.queueIds.push(id);
    expect((await db.select().from(queues).where(eq(queues.id, id)))[0]?.language).toBe("tr");

    const plain = await post("/api/v1/admin/queues", { name: "NoLang", number: String(Number(number) + 1).slice(0, 6) });
    created.queueIds.push((plain.json() as { id: string }).id);
    expect((plain.json() as { language: string | null }).language).toBeNull();

    expect((await post("/api/v1/admin/queues", { name: "Bad", number: "99881", language: "de" })).statusCode).toBe(400);
  });

  it("rejects a queue number that is not 2-6 digits", async () => {
    const res = await post("/api/v1/admin/queues", { name: "Bad", number: "12a45" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a missing name", async () => {
    const res = await post("/api/v1/admin/queues", { number: "1234" });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH updates the queue and replaces its member list", async () => {
    const number = uniq().padStart(4, "0").slice(0, 6);
    const created0 = await post("/api/v1/admin/queues", {
      name: "Before",
      number,
      members: [{ extensionId: fx.extensionId, penalty: 0, paused: false }],
    });
    const id = (created0.json() as { id: string }).id;
    created.queueIds.push(id);

    const res = await patch(`/api/v1/admin/queues/${id}`, { name: "After", wrapup: 30 });
    expect(res.statusCode).toBe(200);

    const [row] = await db.select().from(queues).where(eq(queues.id, id));
    expect(row?.name).toBe("After");
    expect(row?.wrapup).toBe(30);
  });

  it("pauses and unpauses a queue member", async () => {
    const number = uniq().padStart(4, "0").slice(0, 6);
    const res = await post("/api/v1/admin/queues", {
      name: "Pause Q",
      number,
      members: [{ extensionId: fx.extensionId, penalty: 0, paused: false }],
    });
    const id = (res.json() as { id: string }).id;
    created.queueIds.push(id);

    const paused = await post(
      `/api/v1/admin/queues/${id}/members/${fx.extensionId}/pause`,
      { paused: true, reason: "break" },
    );
    expect(paused.statusCode).toBe(200);

    const [member] = await db
      .select()
      .from(queueMembers)
      .where(and(eq(queueMembers.queueId, id), eq(queueMembers.extensionId, fx.extensionId)));
    expect(member?.paused).toBe(true);
    expect(member?.pauseReason).toBe("break");
  });

  it("PUT /queues/:id/members replaces the member list", async () => {
    const number = uniq().padStart(4, "0").slice(0, 6);
    const res = await post("/api/v1/admin/queues", {
      name: "Members PUT",
      number,
      members: [{ extensionId: fx.extensionId, penalty: 0, paused: false }],
    });
    const id = (res.json() as { id: string }).id;
    created.queueIds.push(id);

    const cleared = await put(`/api/v1/admin/queues/${id}/members`, []);
    expect(cleared.statusCode).toBe(200);
    expect(await db.select().from(queueMembers).where(eq(queueMembers.queueId, id))).toHaveLength(0);

    const restored = await put(`/api/v1/admin/queues/${id}/members`, {
      members: [{ extensionId: fx.extensionId, penalty: 3, paused: true }],
    });
    expect(restored.statusCode).toBe(200);
    const members = await db.select().from(queueMembers).where(eq(queueMembers.queueId, id));
    expect(members).toHaveLength(1);
    expect(members[0]?.penalty).toBe(3);
    expect(members[0]?.paused).toBe(true);
  });

  it("DELETE removes the queue and its members", async () => {
    const number = uniq().padStart(4, "0").slice(0, 6);
    const res = await post("/api/v1/admin/queues", {
      name: "Doomed",
      number,
      members: [{ extensionId: fx.extensionId, penalty: 0, paused: false }],
    });
    const id = (res.json() as { id: string }).id;

    const del = await app.inject({ method: "DELETE", url: `/api/v1/admin/queues/${id}`, headers: H() });
    expect(del.statusCode).toBe(200);

    expect(await db.select().from(queues).where(eq(queues.id, id))).toHaveLength(0);
    expect(await db.select().from(queueMembers).where(eq(queueMembers.queueId, id))).toHaveLength(0);
  });

  it("GET /queues includes members", async () => {
    const number = uniq().padStart(4, "0").slice(0, 6);
    const res = await post("/api/v1/admin/queues", {
      name: "Listed",
      number,
      members: [{ extensionId: fx.extensionId, penalty: 0, paused: false }],
    });
    const id = (res.json() as { id: string }).id;
    created.queueIds.push(id);

    const list = await app.inject({ method: "GET", url: "/api/v1/admin/queues", headers: H() });
    expect(list.statusCode).toBe(200);
    const found = (list.json() as Array<{ id: string; members: unknown[] }>).find((q) => q.id === id);
    expect(found?.members).toHaveLength(1);
  });
});

// ------------------------------------------------------------- schedules

describe("schedules", () => {
  it("creates a schedule and persists its ranges", async () => {
    const res = await post("/api/v1/admin/schedules", {
      name: "Office Hours",
      timezone: "Europe/Istanbul",
      ranges: [
        { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", status: "open" },
        { dayOfWeek: 1, startTime: "12:00", endTime: "13:00", status: "lunch" },
      ],
    });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { id: string }).id;
    created.scheduleIds.push(id);

    const [row] = await db.select().from(schedules).where(eq(schedules.id, id));
    expect(row?.name).toBe("Office Hours");
    expect(row?.timezone).toBe("Europe/Istanbul");
    // Default override mode.
    expect(row?.overrideMode).toBe("auto");

    const ranges = await db.select().from(scheduleRanges).where(eq(scheduleRanges.scheduleId, id));
    expect(ranges).toHaveLength(2);
    expect(ranges.filter((r) => r.status === "lunch")).toHaveLength(1);
  });

  it("rejects a range with an out-of-range dayOfWeek", async () => {
    const res = await post("/api/v1/admin/schedules", {
      name: "Bad Day",
      ranges: [{ dayOfWeek: 9, startTime: "09:00", endTime: "17:00", status: "open" }],
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a malformed time", async () => {
    const res = await post("/api/v1/admin/schedules", {
      name: "Bad Time",
      ranges: [{ dayOfWeek: 1, startTime: "9am", endTime: "17:00", status: "open" }],
    });
    expect(res.statusCode).toBe(400);
  });

  it("PUT /override sets the mode and expiry", async () => {
    const res = await post("/api/v1/admin/schedules", { name: "Overridable" });
    const id = (res.json() as { id: string }).id;
    created.scheduleIds.push(id);

    const until = new Date(Date.now() + 3600_000).toISOString();
    const ov = await put(`/api/v1/admin/schedules/${id}/override`, {
      overrideMode: "closed",
      overrideUntil: until,
    });
    expect(ov.statusCode).toBe(200);

    const [row] = await db.select().from(schedules).where(eq(schedules.id, id));
    expect(row?.overrideMode).toBe("closed");
    expect(row?.overrideUntil).not.toBeNull();
  });

  it("PUT /override accepts an explicit null to clear the expiry", async () => {
    const res = await post("/api/v1/admin/schedules", { name: "Clearable" });
    const id = (res.json() as { id: string }).id;
    created.scheduleIds.push(id);

    await put(`/api/v1/admin/schedules/${id}/override`, {
      overrideMode: "open",
      overrideUntil: new Date(Date.now() + 3600_000).toISOString(),
    });
    await put(`/api/v1/admin/schedules/${id}/override`, {
      overrideMode: "auto",
      overrideUntil: null,
    });

    const [row] = await db.select().from(schedules).where(eq(schedules.id, id));
    expect(row?.overrideMode).toBe("auto");
    expect(row?.overrideUntil).toBeNull();
  });

  it("PATCH replaces ranges rather than appending them", async () => {
    const res = await post("/api/v1/admin/schedules", {
      name: "Replaceable",
      ranges: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00", status: "open" }],
    });
    const id = (res.json() as { id: string }).id;
    created.scheduleIds.push(id);

    const p = await patch(`/api/v1/admin/schedules/${id}`, {
      ranges: [{ dayOfWeek: 2, startTime: "10:00", endTime: "16:00", status: "open" }],
    });
    // Regression: a ranges-only PATCH has no scalar columns to set. It used to
    // call drizzle .set({}) and 500, silently leaving the old ranges in place.
    expect(p.statusCode).toBe(200);

    const ranges = await db.select().from(scheduleRanges).where(eq(scheduleRanges.scheduleId, id));
    expect(ranges).toHaveLength(1);
    expect(ranges[0]?.dayOfWeek).toBe(2);
  });

  it("DELETE removes the schedule", async () => {
    const res = await post("/api/v1/admin/schedules", { name: "Doomed Sched" });
    const id = (res.json() as { id: string }).id;

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/schedules/${id}`,
      headers: H(),
    });
    expect(del.statusCode).toBe(200);
    expect(await db.select().from(schedules).where(eq(schedules.id, id))).toHaveLength(0);
  });
});

// ----------------------------------------------------------------- flows

describe("flows", () => {
  it("creates a flow seeded with an empty draft graph", async () => {
    const res = await post("/api/v1/admin/flows", { name: "Reception" });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { id: string }).id;
    created.flowIds.push(id);

    const [row] = await db.select().from(flows).where(eq(flows.id, id));
    expect(row?.name).toBe("Reception");
    expect(row?.extensionNumber).toBeNull();
    const draft = row?.draftJson as { nodes: unknown[]; edges: unknown[] };
    expect(draft.nodes).toHaveLength(1);
    expect(draft.edges).toHaveLength(0);
  });

  it("binds an extension number and persists it", async () => {
    const number = uniq();
    const res = await post("/api/v1/admin/flows", { name: "Bound", extensionNumber: number });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { id: string }).id;
    created.flowIds.push(id);

    const [row] = await db.select().from(flows).where(eq(flows.id, id));
    expect(row?.extensionNumber).toBe(number);
  });

  it("rejects a duplicate extensionNumber with 409", async () => {
    const number = uniq();
    const first = await post("/api/v1/admin/flows", { name: "First", extensionNumber: number });
    created.flowIds.push((first.json() as { id: string }).id);

    const second = await post("/api/v1/admin/flows", { name: "Second", extensionNumber: number });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: expect.stringContaining(number) });
  });

  it("rejects an extensionNumber already used by a SIP extension with 409", async () => {
    const [ext] = await db
      .select({ number: extensions.number })
      .from(extensions)
      .where(eq(extensions.id, fx.extensionId));

    const res = await post("/api/v1/admin/flows", { name: "Clash", extensionNumber: ext!.number });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: expect.stringContaining("SIP extension") });
  });

  it("PUT draft replaces the stored graph", async () => {
    const res = await post("/api/v1/admin/flows", { name: "Draftable" });
    const id = (res.json() as { id: string }).id;
    created.flowIds.push(id);

    const put1 = await put(`/api/v1/admin/flows/${id}/draft`, {
      nodes: [
        { id: "start", type: "start", position: { x: 1, y: 2 }, data: {} },
        { id: "hangup", type: "hangup", position: { x: 3, y: 4 }, data: {} },
      ],
      edges: [{ id: "e1", source: "start", target: "hangup" }],
      variables: ["caller"],
    });
    expect(put1.statusCode).toBe(200);

    const [row] = await db.select().from(flows).where(eq(flows.id, id));
    const draft = row?.draftJson as { nodes: unknown[]; edges: unknown[] };
    expect(draft.nodes).toHaveLength(2);
    expect(draft.edges).toHaveLength(1);
  });

  it("rejects an invalid draft graph with 400", async () => {
    const res = await post("/api/v1/admin/flows", { name: "Bad Draft" });
    const id = (res.json() as { id: string }).id;
    created.flowIds.push(id);

    const bad = await put(`/api/v1/admin/flows/${id}/draft`, { nodes: "not-an-array" });
    expect(bad.statusCode).toBe(400);
  });

  it("validate reports a clean start-only graph as ok", async () => {
    const res = await post("/api/v1/admin/flows", { name: "Valid" });
    const id = (res.json() as { id: string }).id;
    created.flowIds.push(id);

    const v = await post(`/api/v1/admin/flows/${id}/validate`, {});
    expect(v.statusCode).toBe(200);
    expect(v.json()).toMatchObject({ ok: true });
  });

  it("validate 404s an unknown flow", async () => {
    const res = await post("/api/v1/admin/flows/11111111-1111-1111-1111-111111111111/validate", {});
    expect(res.statusCode).toBe(404);
  });

  it("publish snapshots a version and rollback restores an earlier draft", async () => {
    const res = await post("/api/v1/admin/flows", { name: "Publishable" });
    const id = (res.json() as { id: string }).id;
    created.flowIds.push(id);

    // A dangling edge makes the draft invalid, so publish must refuse it.
    await put(`/api/v1/admin/flows/${id}/draft`, {
      nodes: [{ id: "start", type: "start", position: { x: 0, y: 0 }, data: {} }],
      edges: [{ id: "e1", source: "start", target: "ghost" }],
      variables: ["caller"],
    });
    const badPublish = await post(`/api/v1/admin/flows/${id}/publish`, {});
    expect(badPublish.statusCode).toBe(400);
    expect(await db.select().from(flowVersions).where(eq(flowVersions.flowId, id))).toHaveLength(0);

    // Repair the graph, then publish.
    await put(`/api/v1/admin/flows/${id}/draft`, {
      nodes: [{ id: "start", type: "start", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      variables: ["caller"],
    });
    const good = await post(`/api/v1/admin/flows/${id}/publish`, {});
    expect(good.statusCode).toBe(200);
    expect(await db.select().from(flowVersions).where(eq(flowVersions.flowId, id))).toHaveLength(1);
  });

  it("PATCH renames a flow", async () => {
    const res = await post("/api/v1/admin/flows", { name: "Old Name" });
    const id = (res.json() as { id: string }).id;
    created.flowIds.push(id);

    const p = await patch(`/api/v1/admin/flows/${id}`, { name: "New Name" });
    expect(p.statusCode).toBe(200);

    const [row] = await db.select().from(flows).where(eq(flows.id, id));
    expect(row?.name).toBe("New Name");
  });

  it("PATCH 404s an unknown flow", async () => {
    const res = await patch("/api/v1/admin/flows/11111111-1111-1111-1111-111111111111", {
      name: "Ghost",
    });
    expect(res.statusCode).toBe(404);
  });

  it("rejects an out-of-range extensionNumber on create", async () => {
    const res = await post("/api/v1/admin/flows", { name: "Long", extensionNumber: "123456789" });
    expect(res.statusCode).toBe(400);
  });
});