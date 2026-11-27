/**
 * CDR idempotency hardening — real Postgres (monosip_test).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { cdr } from "../db/schema.js";
import { cdrAnswered, cdrEnd, cdrIsOpen, cdrStart } from "../lib/cdr.js";
import { buildApp, closeDb } from "../test/helpers.js";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";

const callIds: string[] = [];
let n = 0;
const cid = () => `arch-cdr-${Date.now()}-${n++}`;

let app: FastifyInstance;
const SECRET = () => ({ "x-monosip-internal": config.internalApiSecret });

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

afterEach(async () => {
  for (const id of callIds) {
    await db.delete(cdr).where(eq(cdr.callId, id));
  }
  callIds.length = 0;
});

describe("CDR idempotency — Stasis cdrStart/cdrEnd", () => {
  it("first create: start → answer → end yields one row", async () => {
    const id = cid();
    callIds.push(id);
    await cdrStart({
      callId: id,
      direction: "inbound",
      caller: "905551110000",
      callee: "100",
      did: "100",
    });
    expect(cdrIsOpen(id)).toBe(true);
    await cdrAnswered(id);
    await cdrEnd(id, "ANSWERED", { billsec: 12, duration: 15 });
    expect(cdrIsOpen(id)).toBe(false);
    const rows = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.endedAt).toBeTruthy();
    expect(rows[0]?.billsec).toBe(12);
  });

  it("retry: second cdrStart same callId does not create another row", async () => {
    const id = cid();
    callIds.push(id);
    await cdrStart({
      callId: id,
      direction: "inbound",
      caller: "a",
      callee: "b",
    });
    await cdrStart({
      callId: id,
      direction: "inbound",
      caller: "a",
      callee: "b",
    });
    const rows = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(rows).toHaveLength(1);
    expect(cdrIsOpen(id)).toBe(true);
  });

  it("parallel cdrStart: exactly one row", async () => {
    const id = cid();
    callIds.push(id);
    await Promise.all([
      cdrStart({ callId: id, direction: "outbound", caller: "101", callee: "90555" }),
      cdrStart({ callId: id, direction: "outbound", caller: "101", callee: "90555" }),
      cdrStart({ callId: id, direction: "outbound", caller: "101", callee: "90555" }),
      cdrStart({ callId: id, direction: "outbound", caller: "101", callee: "90555" }),
    ]);
    const [{ n: count }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(cdr)
      .where(eq(cdr.callId, id));
    expect(count).toBe(1);
  });

  it("reconnect-style retry after end does not insert a second row", async () => {
    const id = cid();
    callIds.push(id);
    await cdrStart({
      callId: id,
      direction: "internal",
      caller: "101",
      callee: "IVR",
    });
    await cdrEnd(id, "ANSWERED", { billsec: 5, duration: 8 });
    expect(cdrIsOpen(id)).toBe(false);
    await cdrStart({
      callId: id,
      direction: "internal",
      caller: "101",
      callee: "IVR",
    });
    const rows = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.endedAt).toBeTruthy();
    expect(cdrIsOpen(id)).toBe(false);
  });

  it("cdrEnd retry without overrides does not wipe finished billsec", async () => {
    const id = cid();
    callIds.push(id);
    await cdrStart({
      callId: id,
      direction: "internal",
      caller: "101",
      callee: "102",
    });
    await cdrEnd(id, "ANSWERED", { billsec: 40, duration: 45 });
    const first = (await db.select().from(cdr).where(eq(cdr.callId, id)))[0]!;
    await cdrEnd(id, "NOANSWER");
    const second = (await db.select().from(cdr).where(eq(cdr.callId, id)))[0]!;
    expect(second.billsec).toBe(40);
    expect(second.disposition).toBe(first.disposition);
    expect(second.endedAt?.getTime()).toBe(first.endedAt?.getTime());
  });

  it("cdrEnd with overrides enriches billsec=0 finalize path", async () => {
    const id = cid();
    callIds.push(id);
    await cdrStart({
      callId: id,
      direction: "inbound",
      caller: "90555",
      callee: "100",
    });
    await cdrEnd(id, "NOANSWER", { billsec: 0, duration: 3 });
    // Dialplan posting richer numbers while mem closed (billsec still 0)
    await cdrEnd(id, "ANSWERED", { billsec: 22, duration: 30 });
    const [row] = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(row?.billsec).toBe(22);
    expect(row?.duration).toBe(30);
    expect(row?.disposition).toBe("ANSWERED");
  });

  it("cdrEnd override after finished billsec>0 does not rewrite", async () => {
    const id = cid();
    callIds.push(id);
    await cdrStart({
      callId: id,
      direction: "inbound",
      caller: "90555",
      callee: "100",
    });
    await cdrEnd(id, "ANSWERED", { billsec: 40, duration: 45 });
    await cdrEnd(id, "ANSWERED", { billsec: 99, duration: 100 });
    const [row] = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(row?.billsec).toBe(40);
    expect(row?.duration).toBe(45);
  });

  it("cdrAnswered updates exactly one row by primary key", async () => {
    const id = cid();
    callIds.push(id);
    await cdrStart({
      callId: id,
      direction: "outbound",
      caller: "101",
      callee: "900",
    });
    await cdrAnswered(id);
    await cdrAnswered(id);
    const rows = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.answeredAt).toBeTruthy();
    expect(rows[0]?.disposition).toBe("ANSWERED");
  });

  it("transfer-style same callId: single row updated across legs (not two CDRs)", async () => {
    // MonoSIP keeps ONE cdr per UNIQUEID across IVR→dialplan redirect.
    const id = cid();
    callIds.push(id);
    await cdrStart({
      callId: id,
      direction: "inbound",
      caller: "90555",
      callee: "100",
      did: "100",
    });
    // "Transfer / queue" finalize via dialplan ingest
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/internal/cdr",
      headers: SECRET(),
      payload: {
        callId: id,
        disposition: "ANSWER",
        billsec: 18,
        duration: 25,
        direction: "inbound",
        extension: "102",
        queueNumber: "900",
      },
    });
    expect(res.statusCode).toBe(200);
    const rows = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.billsec).toBe(18);
    expect(rows[0]?.extensionNumber).toBe("102");
    expect(rows[0]?.queueNumber).toBe("900");
  });

  it("distinct callIds remain independent (legitimate separate calls)", async () => {
    const a = cid();
    const b = cid();
    callIds.push(a, b);
    await cdrStart({ callId: a, direction: "internal", caller: "101", callee: "102" });
    await cdrStart({ callId: b, direction: "internal", caller: "103", callee: "104" });
    await cdrEnd(a, "ANSWERED", { billsec: 1, duration: 2 });
    await cdrEnd(b, "BUSY", { billsec: 0, duration: 1 });
    const rowsA = await db.select().from(cdr).where(eq(cdr.callId, a));
    const rowsB = await db.select().from(cdr).where(eq(cdr.callId, b));
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0]?.disposition).toBe("ANSWERED");
    expect(rowsB[0]?.disposition).toBe("BUSY");
  });
});

describe("CDR idempotency — dialplan POST /internal/cdr", () => {
  it("creates one row when none exists", async () => {
    const id = cid();
    callIds.push(id);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/internal/cdr",
      headers: SECRET(),
      payload: {
        callId: id,
        caller: "101",
        callee: "102",
        disposition: "ANSWER",
        billsec: 10,
        duration: 12,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(await db.select().from(cdr).where(eq(cdr.callId, id))).toHaveLength(1);
  });

  it("duplicate/retry POST updates same row", async () => {
    const id = cid();
    callIds.push(id);
    await app.inject({
      method: "POST",
      url: "/api/v1/internal/cdr",
      headers: SECRET(),
      payload: { callId: id, disposition: "NOANSWER", billsec: 0, duration: 5 },
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/internal/cdr",
      headers: SECRET(),
      payload: { callId: id, disposition: "ANSWER", billsec: 40, duration: 45 },
    });
    const rows = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.billsec).toBe(40);
  });

  it("auth failure writes nothing", async () => {
    const id = cid();
    callIds.push(id);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/internal/cdr",
      payload: { callId: id, disposition: "ANSWER", billsec: 1 },
    });
    expect(res.statusCode).toBe(401);
    expect(await db.select().from(cdr).where(eq(cdr.callId, id))).toHaveLength(0);
  });
});

describe("CDR schema — UNIQUE(call_id)", () => {
  it("catalog has unique index on call_id", async () => {
    const r = await db.execute(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'cdr' AND indexdef ILIKE '%call_id%'
    `);
    const rows = (r as { rows?: Array<{ indexname: string; indexdef: string }> }).rows
      ?? (r as unknown as Array<{ indexname: string; indexdef: string }>);
    const list = Array.isArray(rows) ? rows : [];
    const uniq = list.filter((x) => x.indexdef.toLowerCase().includes("unique"));
    expect(uniq.some((x) => x.indexname === "cdr_call_id_uidx")).toBe(true);
  });

  it("second raw INSERT with same call_id is rejected by Postgres", async () => {
    const id = cid();
    callIds.push(id);
    await db.insert(cdr).values({
      callId: id,
      startedAt: new Date(),
      direction: "internal",
      disposition: "NOANSWER",
    });
    await expect(
      db.insert(cdr).values({
        callId: id,
        startedAt: new Date(),
        direction: "internal",
        disposition: "NOANSWER",
      }),
    ).rejects.toThrow();
  });
});

describe("CDR idempotency — transaction rollback", () => {
  it("rolled-back insert leaves no row; retry can create", async () => {
    const id = cid();
    callIds.push(id);
    try {
      await db.transaction(async (tx) => {
        await tx.insert(cdr).values({
          callId: id,
          startedAt: new Date(),
          direction: "internal",
          disposition: "NOANSWER",
        });
        throw new Error("force rollback");
      });
    } catch {
      /* expected */
    }
    expect(await db.select().from(cdr).where(eq(cdr.callId, id))).toHaveLength(0);
    await cdrStart({
      callId: id,
      direction: "internal",
      caller: "101",
      callee: "102",
    });
    expect(await db.select().from(cdr).where(eq(cdr.callId, id))).toHaveLength(1);
  });
});
