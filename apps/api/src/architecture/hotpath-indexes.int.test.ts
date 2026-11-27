/**
 * Hot-path index audit with EXPLAIN on monosip_test (throwaway Postgres).
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { cdr, recordings } from "../db/schema.js";
import { closeDb } from "../test/helpers.js";

const callIds: string[] = [];
let n = 0;
const cid = () => `arch-idx-${Date.now()}-${n++}`;

afterAll(async () => {
  await closeDb();
});

afterEach(async () => {
  for (const id of callIds) {
    await db.delete(recordings).where(eq(recordings.callId, id));
    await db.delete(cdr).where(eq(cdr.callId, id));
  }
  callIds.length = 0;
});

async function explain(query: string): Promise<string> {
  const r = await db.execute(sql.raw(`EXPLAIN (FORMAT TEXT) ${query}`));
  const rows = (r as { rows?: Array<Record<string, string>> }).rows
    ?? (r as unknown as Array<Record<string, string>>);
  return (Array.isArray(rows) ? rows : [])
    .map((row) => Object.values(row)[0] ?? "")
    .join("\n");
}

describe("hot-path indexes — EXPLAIN", () => {
  it("cdr by call_id has cdr_call_id_uidx (unique)", async () => {
    const id = cid();
    callIds.push(id);
    await db.insert(cdr).values({
      callId: id,
      startedAt: new Date(),
      direction: "internal",
      disposition: "NOANSWER",
    });
    // Tiny tables often seq-scan even with a unique index — assert the catalog.
    const idx = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'cdr' AND indexname = 'cdr_call_id_uidx'
    `);
    const rows = (idx as { rows?: Array<{ indexname: string }> }).rows
      ?? (idx as unknown as Array<{ indexname: string }>);
    expect((Array.isArray(rows) ? rows : []).length).toBe(1);

    const plan = await explain(
      `SELECT * FROM cdr WHERE call_id = '${id.replace(/'/g, "")}'`,
    );
    expect(plan.length).toBeGreaterThan(10);
  });


  it("cdr order by started_at uses cdr_started_idx (or sequential on tiny table)", async () => {
    const plan = await explain(
      `SELECT * FROM cdr ORDER BY started_at DESC LIMIT 50`,
    );
    // On empty/tiny tables planner may seq-scan; accept either, record evidence.
    expect(plan.length).toBeGreaterThan(10);
    // Prefer index when present in catalog:
    const idx = await db.execute(sql`
      SELECT indexname FROM pg_indexes WHERE tablename = 'cdr' AND indexname = 'cdr_started_idx'
    `);
    const rows = (idx as { rows?: Array<{ indexname: string }> }).rows
      ?? (idx as unknown as Array<{ indexname: string }>);
    expect((Array.isArray(rows) ? rows : []).length).toBe(1);
  });

  it("recordings_call_id_idx exists after migration 0020", async () => {
    const id = cid();
    callIds.push(id);
    for (let i = 0; i < 40; i++) {
      const c = `${id}-${i}`;
      callIds.push(c);
      await db.insert(recordings).values({
        callId: c,
        filePath: `/tmp/arch-${c}.wav`,
        duration: 5,
        sizeBytes: 1000,
      });
    }
    const catalog = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'recordings' AND indexname = 'recordings_call_id_idx'
    `);
    const catRows = (catalog as { rows?: unknown[] }).rows
      ?? (catalog as unknown as unknown[]);
    expect(Array.isArray(catRows) ? catRows.length : 0).toBe(1);

    const plan = await explain(
      `SELECT * FROM recordings WHERE call_id = '${id}-0'`,
    );
    // Empty/tiny tables may still seq-scan; catalog proves the index.
    expect(plan.toLowerCase()).toMatch(/index|bitmap|seq scan/);
  });

  it("call_events call_id indexes exist after migration 0020", async () => {
    const catalog = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'call_events' AND indexname IN (
        'call_events_call_id_idx', 'call_events_call_id_at_idx'
      )
    `);
    const rows = (catalog as { rows?: unknown[] }).rows
      ?? (catalog as unknown as unknown[]);
    expect(Array.isArray(rows) ? rows.length : 0).toBeGreaterThanOrEqual(2);
  });

  it("sessions.token unique index exists (auth hot path)", async () => {
    const catalog = await db.execute(sql`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'sessions' AND indexdef ILIKE '%token%'
    `);
    const rows = (catalog as { rows?: Array<{ indexdef: string }> }).rows
      ?? (catalog as unknown as Array<{ indexdef: string }>);
    const defs = (Array.isArray(rows) ? rows : []).map((r) => r.indexdef.toLowerCase());
    expect(defs.some((d) => d.includes("unique") && d.includes("token"))).toBe(true);
  });
});
