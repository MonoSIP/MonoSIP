import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  apiKeys,
  blacklist,
  holidays,
  inboundRoutes,
  outboundRoutes,
  ringGroupMembers,
  ringGroups,
  trunks,
} from "../db/schema.js";
import {
  auth,
  buildApp,
  cleanupActors,
  closeDb,
  seedActors,
  type Fixtures,
} from "../test/helpers.js";

/**
 * Functional happy-path coverage for the remaining admin write routes: trunks,
 * inbound/outbound dialplan routes, blacklist, ring groups, holidays and API
 * keys. Each case asserts the HTTP response AND the persisted row.
 */

let app: FastifyInstance;
let fx: Fixtures;
let seq = 0;
/** Unique digit-only suffix — number fields are validated with /^\d+$/. */
const uniq = () => `${Date.now()}${seq++}`.slice(-8);
const num = (len: number) => uniq().slice(-len).padStart(len, "0");

const created: {
  trunkIds: string[];
  inboundIds: string[];
  outboundIds: string[];
  blacklistIds: string[];
  ringGroupIds: string[];
  holidayIds: string[];
  apiKeyIds: string[];
} = {
  trunkIds: [],
  inboundIds: [],
  outboundIds: [],
  blacklistIds: [],
  ringGroupIds: [],
  holidayIds: [],
  apiKeyIds: [],
};

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
  for (const id of created.trunkIds) await db.delete(trunks).where(eq(trunks.id, id));
  for (const id of created.inboundIds) await db.delete(inboundRoutes).where(eq(inboundRoutes.id, id));
  for (const id of created.outboundIds) await db.delete(outboundRoutes).where(eq(outboundRoutes.id, id));
  for (const id of created.blacklistIds) await db.delete(blacklist).where(eq(blacklist.id, id));
  for (const id of created.ringGroupIds) {
    await db.delete(ringGroupMembers).where(eq(ringGroupMembers.ringGroupId, id));
    await db.delete(ringGroups).where(eq(ringGroups.id, id));
  }
  for (const id of created.holidayIds) await db.delete(holidays).where(eq(holidays.id, id));
  for (const id of created.apiKeyIds) await db.delete(apiKeys).where(eq(apiKeys.id, id));
  for (const k of Object.keys(created) as Array<keyof typeof created>) created[k] = [];
  await cleanupActors(fx);
});

const H = () => auth(fx.adminToken);
const post = (url: string, payload: unknown) => app.inject({ method: "POST", url, headers: H(), payload });
const put = (url: string, payload: unknown) => app.inject({ method: "PUT", url, headers: H(), payload });
const patch = (url: string, payload: unknown) => app.inject({ method: "PATCH", url, headers: H(), payload });
const del = (url: string) => app.inject({ method: "DELETE", url, headers: H() });

// ----------------------------------------------------------------- trunks

describe("trunks", () => {
  async function createTrunk(over: Record<string, unknown> = {}) {
    const res = await post("/api/v1/admin/trunks", { name: "Carrier", host: "sip.example.net", ...over });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { id: string }).id;
    created.trunkIds.push(id);
    return id;
  }

  it("creates a trunk with schema defaults and never echoes the secret", async () => {
    const res = await post("/api/v1/admin/trunks", {
      name: "Carrier",
      host: "sip.example.net",
      secret: "super-secret",
    });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { id: string }).id;
    created.trunkIds.push(id);

    // The response must not leak the encrypted secret.
    expect((res.json() as Record<string, unknown>).secretEnc).toBeUndefined();

    const [row] = await db.select().from(trunks).where(eq(trunks.id, id));
    expect(row?.port).toBe(5060);
    expect(row?.transport).toBe("udp");
    expect(row?.authType).toBe("userpass");
    expect(row?.maxChannels).toBe(10);
    expect(row?.enabled).toBe(true);
    // Secret IS persisted, just not returned.
    expect(row?.secretEnc).toBeTruthy();
  });

  it("rejects a missing host", async () => {
    const res = await post("/api/v1/admin/trunks", { name: "No Host" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an out-of-range maxChannels", async () => {
    const res = await post("/api/v1/admin/trunks", {
      name: "Too Many",
      host: "h",
      maxChannels: 500,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown transport", async () => {
    const res = await post("/api/v1/admin/trunks", {
      name: "Bad Transport",
      host: "h",
      transport: "carrier-pigeon",
    });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH updates scalars and rotates the secret", async () => {
    const id = await createTrunk({ secret: "old-secret" });
    const res = await patch(`/api/v1/admin/trunks/${id}`, {
      name: "Renamed",
      maxChannels: 25,
      secret: "new-secret",
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as Record<string, unknown>).secretEnc).toBeUndefined();

    const [row] = await db.select().from(trunks).where(eq(trunks.id, id));
    expect(row?.name).toBe("Renamed");
    expect(row?.maxChannels).toBe(25);
    // Rotating must change the stored ciphertext.
    const [before] = await db.select().from(trunks).where(eq(trunks.id, id));
    expect(row?.secretEnc).toBeTruthy();
    expect(before?.secretEnc).toBe(row?.secretEnc);
  });

  it("PATCH with an empty body does not 500", async () => {
    const id = await createTrunk();
    // Regression guard: `patch` spread from an empty body is `{}`, and drizzle
    // throws "No values to set" on an empty .set().
    const res = await patch(`/api/v1/admin/trunks/${id}`, {});
    expect(res.statusCode).toBe(200);
  });

  it("DELETE removes the trunk", async () => {
    const id = await createTrunk();
    expect((await del(`/api/v1/admin/trunks/${id}`)).statusCode).toBe(200);
    expect(await db.select().from(trunks).where(eq(trunks.id, id))).toHaveLength(0);
  });

  it("GET /trunks/:id/status reports an id that exists", async () => {
    const id = await createTrunk();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/trunks/${id}/status`,
      headers: H(),
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { id: string }).id).toBe(id);
  });

  it("GET /trunks/:id/status 404s an unknown trunk", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/trunks/11111111-1111-1111-1111-111111111111/status",
      headers: H(),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ------------------------------------------------------------ dialplan routes

describe("inbound routes", () => {
  it("creates an inbound route and persists it with its priority", async () => {
    const res = await post("/api/v1/admin/routes/inbound", {
      did: "1000",
      callerPattern: "0%",
      priority: 10,
      destType: "extension",
      destId: fx.extensionId,
    });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { id: string }).id;
    created.inboundIds.push(id);

    const [row] = await db.select().from(inboundRoutes).where(eq(inboundRoutes.id, id));
    expect(row?.did).toBe("1000");
    expect(row?.priority).toBe(10);
    expect(row?.destType).toBe("extension");
  });

  it("defaults priority to 100 and accepts a null callerPattern", async () => {
    const res = await post("/api/v1/admin/routes/inbound", {
      did: "1001",
      callerPattern: null,
      destType: "hangup",
      destId: null,
    });
    const id = (res.json() as { id: string }).id;
    created.inboundIds.push(id);

    const [row] = await db.select().from(inboundRoutes).where(eq(inboundRoutes.id, id));
    expect(row?.priority).toBe(100);
    expect(row?.callerPattern).toBeNull();
  });

  it("rejects an unknown destType", async () => {
    const res = await post("/api/v1/admin/routes/inbound", {
      did: "1002",
      destType: "teleporter",
      destId: null,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a missing did", async () => {
    const res = await post("/api/v1/admin/routes/inbound", { destType: "hangup", destId: null });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE /routes/inbound/:id removes it", async () => {
    const res = await post("/api/v1/admin/routes/inbound", {
      did: "1003",
      destType: "hangup",
      destId: null,
    });
    const id = (res.json() as { id: string }).id;

    expect((await del(`/api/v1/admin/routes/inbound/${id}`)).statusCode).toBe(200);
    expect(await db.select().from(inboundRoutes).where(eq(inboundRoutes.id, id))).toHaveLength(0);
  });

  it("PATCH /routes/inbound/:id updates destination and priority", async () => {
    const res = await post("/api/v1/admin/routes/inbound", {
      did: "1004",
      destType: "hangup",
      destId: null,
      priority: 50,
    });
    const id = (res.json() as { id: string }).id;
    created.inboundIds.push(id);

    const upd = await patch(`/api/v1/admin/routes/inbound/${id}`, {
      destType: "extension",
      destId: fx.extensionId,
      priority: 5,
    });
    expect(upd.statusCode).toBe(200);
    expect((upd.json() as { priority: number }).priority).toBe(5);

    const [row] = await db.select().from(inboundRoutes).where(eq(inboundRoutes.id, id));
    expect(row?.destType).toBe("extension");
    expect(row?.destId).toBe(fx.extensionId);
    expect(row?.priority).toBe(5);
  });
});

describe("outbound routes", () => {
  async function createTrunk(): Promise<string> {
    const t = await post("/api/v1/admin/trunks", { name: "Out Trunk", host: "h.example.net" });
    const id = (t.json() as { id: string }).id;
    created.trunkIds.push(id);
    return id;
  }

  it("creates an outbound route bound to a trunk", async () => {
    const trunkId = await createTrunk();
    const res = await post("/api/v1/admin/routes/outbound", {
      name: "Domestic",
      pattern: "0X.",
      trunkIds: [trunkId],
    });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { id: string }).id;
    created.outboundIds.push(id);

    const [row] = await db.select().from(outboundRoutes).where(eq(outboundRoutes.id, id));
    expect(row?.name).toBe("Domestic");
    expect(row?.stripPrefix).toBe(0);
    expect(row?.requiredPermission).toBe("localFixed");
    expect(row?.enabled).toBe(true);
    expect(row?.trunkIds).toEqual([trunkId]);
  });

  it("rejects a route with no trunks", async () => {
    const res = await post("/api/v1/admin/routes/outbound", {
      name: "No Trunk",
      pattern: "0X.",
      trunkIds: [],
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a missing pattern", async () => {
    const trunkId = await createTrunk();
    const res = await post("/api/v1/admin/routes/outbound", {
      name: "No Pattern",
      trunkIds: [trunkId],
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown requiredPermission", async () => {
    const trunkId = await createTrunk();
    const res = await post("/api/v1/admin/routes/outbound", {
      name: "Bad Perm",
      pattern: "0X.",
      trunkIds: [trunkId],
      requiredPermission: "superuser",
    });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE /routes/outbound/:id removes it", async () => {
    const trunkId = await createTrunk();
    const res = await post("/api/v1/admin/routes/outbound", {
      name: "Doomed",
      pattern: "9X.",
      trunkIds: [trunkId],
    });
    const id = (res.json() as { id: string }).id;

    expect((await del(`/api/v1/admin/routes/outbound/${id}`)).statusCode).toBe(200);
    expect(await db.select().from(outboundRoutes).where(eq(outboundRoutes.id, id))).toHaveLength(0);
  });

  it("GET /routes/outbound lists the created route", async () => {
    const trunkId = await createTrunk();
    const res = await post("/api/v1/admin/routes/outbound", {
      name: "Listed",
      pattern: "8X.",
      trunkIds: [trunkId],
    });
    const id = (res.json() as { id: string }).id;
    created.outboundIds.push(id);

    const list = await app.inject({ method: "GET", url: "/api/v1/admin/routes/outbound", headers: H() });
    expect(list.statusCode).toBe(200);
    expect((list.json() as Array<{ id: string }>).some((r) => r.id === id)).toBe(true);
  });

  it("PATCH /routes/outbound/:id updates name, permission and enabled", async () => {
    const trunkId = await createTrunk();
    const res = await post("/api/v1/admin/routes/outbound", {
      name: "Before",
      pattern: "7X.",
      trunkIds: [trunkId],
    });
    const id = (res.json() as { id: string }).id;
    created.outboundIds.push(id);

    const upd = await patch(`/api/v1/admin/routes/outbound/${id}`, {
      name: "After",
      requiredPermission: "mobile",
      enabled: false,
    });
    expect(upd.statusCode).toBe(200);

    const [row] = await db.select().from(outboundRoutes).where(eq(outboundRoutes.id, id));
    expect(row?.name).toBe("After");
    expect(row?.requiredPermission).toBe("mobile");
    expect(row?.enabled).toBe(false);
  });
});

// --------------------------------------------------------------- blacklist

describe("blacklist", () => {
  it("creates an entry defaulting direction to inbound", async () => {
    const res = await post("/api/v1/admin/blacklist", { pattern: "900*" });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { id: string }).id;
    created.blacklistIds.push(id);

    const [row] = await db.select().from(blacklist).where(eq(blacklist.id, id));
    expect(row?.pattern).toBe("900*");
    expect(row?.direction).toBe("inbound");
  });

  it("accepts an explicit direction and note", async () => {
    const res = await post("/api/v1/admin/blacklist", {
      pattern: "+90531*",
      direction: "both",
      note: "abuse",
    });
    const id = (res.json() as { id: string }).id;
    created.blacklistIds.push(id);

    const [row] = await db.select().from(blacklist).where(eq(blacklist.id, id));
    expect(row?.direction).toBe("both");
    expect(row?.note).toBe("abuse");
  });

  it("rejects an empty pattern", async () => {
    const res = await post("/api/v1/admin/blacklist", { pattern: "" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown direction", async () => {
    const res = await post("/api/v1/admin/blacklist", { pattern: "1*", direction: "sideways" });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE removes the entry", async () => {
    const res = await post("/api/v1/admin/blacklist", { pattern: "777*" });
    const id = (res.json() as { id: string }).id;

    expect((await del(`/api/v1/admin/blacklist/${id}`)).statusCode).toBe(200);
    expect(await db.select().from(blacklist).where(eq(blacklist.id, id))).toHaveLength(0);
  });
});

// -------------------------------------------------------------- ring groups

describe("ring groups", () => {
  it("creates a group with ordered members", async () => {
    const res = await post("/api/v1/admin/ring-groups", {
      name: "Support",
      number: num(4),
      memberIds: [fx.extensionId],
    });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { id: string }).id;
    created.ringGroupIds.push(id);

    const [row] = await db.select().from(ringGroups).where(eq(ringGroups.id, id));
    expect(row?.strategy).toBe("ringall");
    expect(row?.ringSeconds).toBe(25);

    const members = await db.select().from(ringGroupMembers).where(eq(ringGroupMembers.ringGroupId, id));
    expect(members).toHaveLength(1);
    expect(members[0]?.sortOrder).toBe(0);
  });

  it("rejects a ringSeconds outside 5-120", async () => {
    const res = await post("/api/v1/admin/ring-groups", {
      name: "Too Long",
      number: num(4),
      ringSeconds: 999,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown strategy", async () => {
    const res = await post("/api/v1/admin/ring-groups", {
      name: "Bad Strategy",
      number: num(4),
      strategy: "chaos",
    });
    expect(res.statusCode).toBe(400);
  });

  it("a members-only PATCH replaces membership without 500ing", async () => {
    const res = await post("/api/v1/admin/ring-groups", {
      name: "Patchable",
      number: num(4),
      memberIds: [fx.extensionId],
    });
    const id = (res.json() as { id: string }).id;
    created.ringGroupIds.push(id);

    // Regression guard for the empty .set({}) class of bug.
    const p = await patch(`/api/v1/admin/ring-groups/${id}`, { memberIds: [] });
    expect(p.statusCode).toBe(200);

    const members = await db.select().from(ringGroupMembers).where(eq(ringGroupMembers.ringGroupId, id));
    expect(members).toHaveLength(0);
  });

  it("PATCH renames the group", async () => {
    const res = await post("/api/v1/admin/ring-groups", { name: "Before", number: num(4) });
    const id = (res.json() as { id: string }).id;
    created.ringGroupIds.push(id);

    expect((await patch(`/api/v1/admin/ring-groups/${id}`, { name: "After" })).statusCode).toBe(200);
    const [row] = await db.select().from(ringGroups).where(eq(ringGroups.id, id));
    expect(row?.name).toBe("After");
  });

  it("DELETE removes the group and its members", async () => {
    const res = await post("/api/v1/admin/ring-groups", {
      name: "Doomed",
      number: num(4),
      memberIds: [fx.extensionId],
    });
    const id = (res.json() as { id: string }).id;

    expect((await del(`/api/v1/admin/ring-groups/${id}`)).statusCode).toBe(200);
    expect(await db.select().from(ringGroups).where(eq(ringGroups.id, id))).toHaveLength(0);
    expect(
      await db.select().from(ringGroupMembers).where(eq(ringGroupMembers.ringGroupId, id)),
    ).toHaveLength(0);
  });

  it("GET /ring-groups exposes memberIds", async () => {
    const res = await post("/api/v1/admin/ring-groups", {
      name: "Listed",
      number: num(4),
      memberIds: [fx.extensionId],
    });
    const id = (res.json() as { id: string }).id;
    created.ringGroupIds.push(id);

    const list = await app.inject({ method: "GET", url: "/api/v1/admin/ring-groups", headers: H() });
    const found = (list.json() as Array<{ id: string; memberIds: string[] }>).find((g) => g.id === id);
    expect(found?.memberIds).toEqual([fx.extensionId]);
  });
});

// --------------------------------------------------------------- holidays

describe("holidays", () => {
  it("creates a holiday defaulting halfDay to false", async () => {
    const res = await post("/api/v1/admin/holidays", {
      date: "2026-01-01",
      name: "New Year",
    });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { id: string }).id;
    created.holidayIds.push(id);

    const [row] = await db.select().from(holidays).where(eq(holidays.id, id));
    expect(row?.date).toBe("2026-01-01");
    expect(row?.halfDay).toBe(false);
    expect(row?.scheduleId).toBeNull();
  });

  it("accepts a halfDay flag and a scheduleId", async () => {
    const sched = await post("/api/v1/admin/schedules", { name: "Holidays Sched" });
    const scheduleId = (sched.json() as { id: string }).id;

    const res = await post("/api/v1/admin/holidays", {
      date: "2026-04-23",
      name: "Ulusal Egemenlik",
      halfDay: true,
      scheduleId,
    });
    const id = (res.json() as { id: string }).id;
    created.holidayIds.push(id);

    const [row] = await db.select().from(holidays).where(eq(holidays.id, id));
    expect(row?.halfDay).toBe(true);
    expect(row?.scheduleId).toBe(scheduleId);

    // Clean up the schedule this holiday points at.
    const { scheduleRanges, schedules } = await import("../db/schema.js");
    await db.delete(scheduleRanges).where(eq(scheduleRanges.scheduleId, scheduleId));
    await db.delete(schedules).where(eq(schedules.id, scheduleId));
  });

  it("rejects a malformed date", async () => {
    const res = await post("/api/v1/admin/holidays", { date: "01-01-2026", name: "Bad" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a non-uuid scheduleId", async () => {
    const res = await post("/api/v1/admin/holidays", {
      date: "2026-05-01",
      name: "Bad Ref",
      scheduleId: "not-a-uuid",
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a missing name", async () => {
    const res = await post("/api/v1/admin/holidays", { date: "2026-05-01" });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE removes the holiday", async () => {
    const res = await post("/api/v1/admin/holidays", { date: "2026-06-01", name: "Doomed" });
    const id = (res.json() as { id: string }).id;

    expect((await del(`/api/v1/admin/holidays/${id}`)).statusCode).toBe(200);
    expect(await db.select().from(holidays).where(eq(holidays.id, id))).toHaveLength(0);
  });
});

// --------------------------------------------------------------- API keys

describe("API keys", () => {
  it("mints a key and a barrier, and returns the barrier exactly once", async () => {
    const res = await post("/api/v1/admin/api-keys", { name: "Integration" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; key: string; barrier: string; keyPrefix: string; permissions: string[] };
    created.apiKeyIds.push(body.id);

    expect(body.key.startsWith("monosip_")).toBe(true);
    expect(body.barrier.length).toBeGreaterThan(16);
    expect(body.keyPrefix).toBe(body.key.slice(0, 12));
    expect(body.permissions).toEqual(["cdr", "originate"]);

    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, body.id));
    expect(row?.keyId).toBe(body.key);
    expect(row?.barrierHash).toBeTruthy();
    expect(row?.barrierHash).not.toBe(body.barrier);
    expect(row?.keyHash).not.toBe(body.key);
  });

  it("honours explicit permissions", async () => {
    const res = await post("/api/v1/admin/api-keys", {
      name: "Read Only",
      permissions: ["cdr"],
    });
    const body = res.json() as { id: string; permissions: string[] };
    created.apiKeyIds.push(body.id);
    expect(body.permissions).toEqual(["cdr"]);
  });

  it("GET /api-keys never returns key hashes", async () => {
    const created0 = await post("/api/v1/admin/api-keys", { name: "Listed" });
    created.apiKeyIds.push((created0.json() as { id: string }).id);

    const list = await app.inject({ method: "GET", url: "/api/v1/admin/api-keys", headers: H() });
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain("keyHash");
    expect(list.body).not.toContain("barrierHash");
    const issued = created0.json() as { key: string; barrier: string };
    expect(list.body).toContain(issued.key);
    expect(list.body).not.toContain(issued.barrier);
  });

  it("PATCH updates the name and permissions", async () => {
    const res = await post("/api/v1/admin/api-keys", { name: "Before" });
    const id = (res.json() as { id: string }).id;
    created.apiKeyIds.push(id);

    const p = await patch(`/api/v1/admin/api-keys/${id}`, {
      name: "After",
      permissions: ["originate"],
    });
    expect(p.statusCode).toBe(200);

    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    expect(row?.name).toBe("After");
    expect(row?.permissions).toEqual(["originate"]);
  });

  it("PATCH with an empty body does not 500", async () => {
    const res = await post("/api/v1/admin/api-keys", { name: "Empty Patch" });
    const id = (res.json() as { id: string }).id;
    created.apiKeyIds.push(id);

    // Regression guard: name/permissions spread yields `{}`, and drizzle
    // throws "No values to set" on an empty .set().
    const p = await patch(`/api/v1/admin/api-keys/${id}`, {});
    expect(p.statusCode).toBe(200);
  });

  it("PATCH 404s an unknown key", async () => {
    const res = await patch("/api/v1/admin/api-keys/11111111-1111-1111-1111-111111111111", {
      name: "Ghost",
    });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE removes the key", async () => {
    const res = await post("/api/v1/admin/api-keys", { name: "Doomed" });
    const id = (res.json() as { id: string }).id;

    expect((await del(`/api/v1/admin/api-keys/${id}`)).statusCode).toBe(200);
    expect(await db.select().from(apiKeys).where(eq(apiKeys.id, id))).toHaveLength(0);
  });
});