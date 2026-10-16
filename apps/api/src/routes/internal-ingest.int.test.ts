import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { cdr, extensions, missedCalls, recordings, voicemails } from "../db/schema.js";
import {
  buildApp,
  cleanupActors,
  closeDb,
  seedActors,
  type Fixtures,
} from "../test/helpers.js";
import { config } from "../config.js";

/**
 * Happy-path coverage for the dialplan -> API ingestion hooks.
 *
 * These are the routes the Asterisk dialplan curls after a call ends. They are
 * guarded by the shared `X-DSip-Internal` secret rather than a session, so the
 * contract under test is: correct secret => the call is ingested correctly;
 * bad/missing secret => 401 (already covered in admin-resources.int.test.ts).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const REC_DIR = path.join(repoRoot, ".temp_files", "runtime", "recordings");
const TONE = path.join(repoRoot, ".temp_files", "fixtures", "tone-8k-mono.wav");
/** 1.5s tone — long enough that a WAV-derived duration is a whole >=1 second. */
const TONE_LONG = path.join(repoRoot, ".temp_files", "fixtures", "tone-8k-mono-1s.wav");

let app: FastifyInstance;
let fx: Fixtures;
const callIds: string[] = [];
const writtenFiles: string[] = [];
/** Caller numbers inserted into missed_calls, drained in afterEach. */
const missedNumbers: string[] = [];

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
  mkdirSync(REC_DIR, { recursive: true });
});

afterEach(async () => {
  for (const number of missedNumbers) {
    await db.delete(missedCalls).where(eq(missedCalls.number, number));
  }
  missedNumbers.length = 0;
  for (const callId of callIds) {
    await db.delete(voicemails).where(eq(voicemails.filePath, callId));
    await db.delete(cdr).where(eq(cdr.callId, callId));
    await db.delete(recordings).where(eq(recordings.callId, callId));
  }
  callIds.length = 0;
  for (const f of writtenFiles) if (existsSync(f)) writeFileSync(f, "");
  writtenFiles.length = 0;
  await cleanupActors(fx);
});

/** Header carrying the configured shared secret. */
const SECRET = () => ({ "x-dsip-internal": config.internalApiSecret });

const postInternal = (path_: string, payload: unknown) =>
  app.inject({ method: "POST", url: path_, headers: SECRET(), payload });

let n = 0;
const callId = () => `int-${Date.now()}-${n++}`;

/** Write a real audio file into the scratch recordings dir. */
function stageAudio(name: string, source = TONE): string {
  const p = path.join(REC_DIR, name);
  writeFileSync(p, readFileSync(source));
  writtenFiles.push(p);
  return p;
}

// -------------------------------------------------------------- CDR ingest

describe("POST /api/v1/internal/cdr", () => {
  it("creates a CDR row for an answered internal call", async () => {
    const id = callId();
    callIds.push(id);

    const res = await postInternal("/api/v1/internal/cdr", {
      callId: id,
      caller: "101",
      callee: "102",
      disposition: "ANSWER",
      billsec: 42,
      duration: 45,
    });
    expect(res.statusCode).toBe(200);

    const [row] = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(row).toBeDefined();
    // Asterisk DIALSTATUS "ANSWER" is normalised to the CDR vocabulary.
    expect(row?.disposition).toBe("ANSWERED");
    expect(row?.billsec).toBe(42);
    expect(row?.direction).toBe("internal");
  });

  it.each([
    ["BUSY", "BUSY"],
    ["CONGESTION", "FAILED"],
    ["CHANUNAVAIL", "FAILED"],
    ["NOANSWER", "NOANSWER"],
    ["TIMEOUT", "NOANSWER"],
    ["CANCEL", "NOANSWER"],
  ])("maps DIALSTATUS %s to %s", async (dialStatus, expected) => {
    const id = callId();
    callIds.push(id);

    await postInternal("/api/v1/internal/cdr", {
      callId: id,
      disposition: dialStatus,
      billsec: 0,
    });

    const [row] = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(row?.disposition).toBe(expected);
  });

  it("is idempotent: a second POST updates the same call rather than duplicating", async () => {
    const id = callId();
    callIds.push(id);

    await postInternal("/api/v1/internal/cdr", { callId: id, disposition: "NOANSWER", billsec: 0 });
    await postInternal("/api/v1/internal/cdr", { callId: id, disposition: "ANSWER", billsec: 30 });

    const rows = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.disposition).toBe("ANSWERED");
    expect(rows[0]?.billsec).toBe(30);
  });

  it("stores queue and answering-extension attribution", async () => {
    const id = callId();
    callIds.push(id);

    await postInternal("/api/v1/internal/cdr", {
      callId: id,
      disposition: "ANSWER",
      billsec: 12,
      queueNumber: "100",
      extension: "10-2",
    });

    const [row] = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(row?.queueNumber).toBe("100");
    // Non-digits are stripped from the answering extension.
    expect(row?.extensionNumber).toBe("102");
  });

  it("parses QoS fields sent as Asterisk strings", async () => {
    const id = callId();
    callIds.push(id);

    await postInternal("/api/v1/internal/cdr", {
      callId: id,
      disposition: "ANSWER",
      billsec: 5,
      mos: "4.20",
      jitter: "12ms",
      packetLoss: "0.5%",
    });

    const [row] = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(row?.mos).toBeCloseTo(4.2, 5);
    expect(row?.jitter).toBeCloseTo(12, 5);
    expect(row?.packetLoss).toBeCloseTo(0.5, 5);
  });

  it("rejects a missing callId", async () => {
    const res = await postInternal("/api/v1/internal/cdr", { disposition: "ANSWER" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a negative billsec", async () => {
    const res = await postInternal("/api/v1/internal/cdr", { callId: callId(), billsec: -1 });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown direction", async () => {
    const res = await postInternal("/api/v1/internal/cdr", {
      callId: callId(),
      direction: "sideways",
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a valid-but-wrong secret", async () => {
    const id = callId();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/internal/cdr",
      headers: { "x-dsip-internal": "wrong" },
      payload: { callId: id },
    });
    expect(res.statusCode).toBe(401);
    expect(await db.select().from(cdr).where(eq(cdr.callId, id))).toHaveLength(0);
  });
});

// ------------------------------------------------------- recording ingest

describe("POST /api/v1/internal/recording", () => {
  it("registers a recording and links it to the CDR row", async () => {
    const id = callId();
    callIds.push(id);
    await postInternal("/api/v1/internal/cdr", { callId: id, disposition: "ANSWER", billsec: 20 });

    const file = stageAudio("int-rec.wav");
    const res = await postInternal("/api/v1/internal/recording", {
      callId: id,
      file,
      extension: "101",
      duration: 20,
    });
    expect(res.statusCode).toBe(200);

    const [rec] = await db.select().from(recordings).where(eq(recordings.callId, id));
    expect(rec).toBeDefined();
    expect(rec?.filePath).toBe(file);
    expect(rec?.duration).toBe(20);

    const [row] = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(row?.recordingId).toBe(rec?.id);
  });

  it("derives duration from the WAV when none is supplied", async () => {
    const id = callId();
    callIds.push(id);
    const file = stageAudio("int-rec-dur.wav", TONE_LONG);

    await postInternal("/api/v1/internal/recording", { callId: id, file });
    const [rec] = await db.select().from(recordings).where(eq(recordings.callId, id));
    // The 1.5s fixture parses to a whole >=1 second, so the row is kept.
    expect(rec?.duration).toBeGreaterThanOrEqual(1);
    expect(rec?.sizeBytes).toBeGreaterThan(0);
  });

  it("is idempotent: re-registering updates the existing row", async () => {
    const id = callId();
    callIds.push(id);
    const file = stageAudio("int-rec-upd.wav");

    await postInternal("/api/v1/internal/recording", { callId: id, file, duration: 10 });
    await postInternal("/api/v1/internal/recording", { callId: id, file, duration: 25 });

    const rows = await db.select().from(recordings).where(eq(recordings.callId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.duration).toBe(25);
  });

  it("discards a recording with no talk time and reports why", async () => {
    const id = callId();
    callIds.push(id);
    const file = stageAudio("int-rec-zero.wav");

    const res = await postInternal("/api/v1/internal/recording", { callId: id, file, duration: 0 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, discarded: true, reason: "zero_duration" });
    expect(await db.select().from(recordings).where(eq(recordings.callId, id))).toHaveLength(0);
  });

  it("400s when the spooled file does not exist", async () => {
    const id = callId();
    callIds.push(id);
    const res = await postInternal("/api/v1/internal/recording", {
      callId: id,
      file: path.join(REC_DIR, "definitely-not-here.wav"),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "recording file missing" });
  });

  it("rejects a missing callId or file", async () => {
    expect((await postInternal("/api/v1/internal/recording", { file: "x" })).statusCode).toBe(400);
    expect((await postInternal("/api/v1/internal/recording", { callId: callId() })).statusCode).toBe(400);
  });
});

// -------------------------------------------------------- voicemail ingest

describe("POST /api/v1/internal/voicemail", () => {
  it("files a voicemail against the target extension", async () => {
    const [ext] = await db
      .select({ number: extensions.number })
      .from(extensions)
      .where(eq(extensions.id, fx.extensionId));

    const file = stageAudio("int-vm.wav");
    const res = await postInternal("/api/v1/internal/voicemail", {
      extension: ext!.number,
      caller: "1000",
      file,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; id: string };

    const [vm] = await db.select().from(voicemails).where(eq(voicemails.id, body.id));
    expect(vm?.extensionId).toBe(fx.extensionId);
    expect(vm?.caller).toBe("1000");
    expect(vm?.read).toBe(false);

    await db.delete(voicemails).where(eq(voicemails.id, body.id));
  });

  it("defaults the caller to unknown", async () => {
    const [ext] = await db
      .select({ number: extensions.number })
      .from(extensions)
      .where(eq(extensions.id, fx.extensionId));

    const file = stageAudio("int-vm-nocaller.wav");
    const res = await postInternal("/api/v1/internal/voicemail", {
      extension: ext!.number,
      file,
    });
    const [vm] = await db.select().from(voicemails).where(eq(voicemails.id, (res.json() as { id: string }).id));
    expect(vm?.caller).toBe("unknown");
    await db.delete(voicemails).where(eq(voicemails.id, (res.json() as { id: string }).id));
  });

  it("404s an unknown extension number", async () => {
    const file = stageAudio("int-vm-noext.wav");
    const res = await postInternal("/api/v1/internal/voicemail", {
      extension: "777777",
      file,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "extension not found" });
  });

  it("400s when the voicemail file is missing on disk", async () => {
    const [ext] = await db
      .select({ number: extensions.number })
      .from(extensions)
      .where(eq(extensions.id, fx.extensionId));

    const res = await postInternal("/api/v1/internal/voicemail", {
      extension: ext!.number,
      file: path.join(REC_DIR, "no-such-vm.wav"),
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a body missing required fields", async () => {
    expect((await postInternal("/api/v1/internal/voicemail", { extension: "101" })).statusCode).toBe(400);
  });
});

// ------------------------------------------------------------------ DND

describe("POST /api/v1/internal/dnd", () => {
  async function ownNumber(): Promise<string> {
    const [ext] = await db
      .select({ number: extensions.number })
      .from(extensions)
      .where(eq(extensions.id, fx.extensionId));
    return ext!.number;
  }

  it("sets DND on the target extension", async () => {
    const number = await ownNumber();
    const res = await postInternal("/api/v1/internal/dnd", { extension: number, dnd: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, extension: number, dnd: true });

    const [row] = await db.select().from(extensions).where(eq(extensions.id, fx.extensionId));
    expect(row?.dnd).toBe(true);
  });

  it("clears DND again (round-trip)", async () => {
    const number = await ownNumber();
    await postInternal("/api/v1/internal/dnd", { extension: number, dnd: true });
    const res = await postInternal("/api/v1/internal/dnd", { extension: number, dnd: false });
    expect(res.statusCode).toBe(200);

    const [row] = await db.select().from(extensions).where(eq(extensions.id, fx.extensionId));
    expect(row?.dnd).toBe(false);
  });

  it("404s an unknown extension", async () => {
    const res = await postInternal("/api/v1/internal/dnd", {
      extension: "555555",
      dnd: true,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "extension not found" });
  });

  it("rejects a non-boolean dnd and a missing extension", async () => {
    expect(
      (await postInternal("/api/v1/internal/dnd", { extension: "101", dnd: "yes" })).statusCode,
    ).toBe(400);
    expect((await postInternal("/api/v1/internal/dnd", { dnd: true })).statusCode).toBe(400);
  });

  it("401s a wrong secret and leaves the flag untouched", async () => {
    const number = await ownNumber();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/internal/dnd",
      headers: { "x-dsip-internal": "wrong" },
      payload: { extension: number, dnd: true },
    });
    expect(res.statusCode).toBe(401);
    const [row] = await db.select().from(extensions).where(eq(extensions.id, fx.extensionId));
    expect(row?.dnd).toBe(false);
  });
});

// -------------------------------------------------------------- missed calls

describe("POST /api/v1/internal/missed", () => {
  let caller = "";
  beforeEach(() => {
    caller = `1000${Date.now()}`.slice(0, 15);
    missedNumbers.push(caller);
  });

  it("records a pending missed call", async () => {
    const res = await postInternal("/api/v1/internal/missed", {
      caller,
      target: "101",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; id: string };

    const [row] = await db.select().from(missedCalls).where(eq(missedCalls.id, body.id));
    expect(row?.number).toBe(caller);
    expect(row?.target).toBe("101");
    expect(row?.status).toBe("pending");
  });

  it("records one row per missed event", async () => {
    await postInternal("/api/v1/internal/missed", { caller, target: "101" });
    await postInternal("/api/v1/internal/missed", { caller, target: "102" });

    const rows = await db.select().from(missedCalls).where(eq(missedCalls.number, caller));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.target).sort()).toEqual(["101", "102"]);
  });

  it("rejects a body missing caller or target", async () => {
    expect((await postInternal("/api/v1/internal/missed", { caller })).statusCode).toBe(400);
    expect((await postInternal("/api/v1/internal/missed", { target: "101" })).statusCode).toBe(400);
  });

  it("401s a wrong secret and writes nothing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/internal/missed",
      headers: { "x-dsip-internal": "wrong" },
      payload: { caller, target: "101" },
    });
    expect(res.statusCode).toBe(401);
    expect(await db.select().from(missedCalls).where(eq(missedCalls.number, caller))).toHaveLength(0);
  });
});

// ----------------------------------------------------------- queue callback

describe("POST /api/v1/internal/queue-callback", () => {
  let number = "";
  beforeEach(() => {
    number = `2000${Date.now()}`.slice(0, 15);
    missedNumbers.push(number);
  });

  it("queues a callback tagged with the queue number and place", async () => {
    const res = await postInternal("/api/v1/internal/queue-callback", {
      queue: "100",
      number,
      place: 2,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; id: string; place: number | null };
    expect(body.place).toBe(2);

    const [row] = await db.select().from(missedCalls).where(eq(missedCalls.id, body.id));
    expect(row?.number).toBe(number);
    // The queue is carried in the target column as `qcb:<queue>`.
    expect(row?.target).toBe("qcb:100");
    expect(row?.status).toBe("pending");
    // Place is parked in callbackCallId until the callback actually dials.
    expect(row?.callbackCallId).toBe("place:2");
  });

  it("dedupes a repeat callback for the same number and queue", async () => {
    const first = await postInternal("/api/v1/internal/queue-callback", {
      queue: "100",
      number,
      place: 1,
    });
    const second = await postInternal("/api/v1/internal/queue-callback", {
      queue: "100",
      number,
      place: 1,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect((second.json() as { deduped?: boolean }).deduped).toBe(true);
    expect((second.json() as { id: string }).id).toBe((first.json() as { id: string }).id);

    const rows = await db.select().from(missedCalls).where(eq(missedCalls.number, number));
    expect(rows).toHaveLength(1);
  });

  it("does not dedupe across different queues", async () => {
    await postInternal("/api/v1/internal/queue-callback", { queue: "100", number });
    await postInternal("/api/v1/internal/queue-callback", { queue: "200", number });

    const rows = await db.select().from(missedCalls).where(eq(missedCalls.number, number));
    expect(rows).toHaveLength(2);
  });

  it("omits the place marker when place is absent or below 1", async () => {
    const res = await postInternal("/api/v1/internal/queue-callback", { queue: "100", number });
    expect(res.json()).toMatchObject({ place: null });
    const [row] = await db
      .select()
      .from(missedCalls)
      .where(eq(missedCalls.id, (res.json() as { id: string }).id));
    expect(row?.callbackCallId ?? null).toBeNull();
  });

  it("coerces a string place from the dialplan", async () => {
    const res = await postInternal("/api/v1/internal/queue-callback", {
      queue: "100",
      number,
      place: "3",
    });
    expect(res.json()).toMatchObject({ place: 3 });
    const [row] = await db
      .select()
      .from(missedCalls)
      .where(eq(missedCalls.id, (res.json() as { id: string }).id));
    expect(row?.callbackCallId).toBe("place:3");
  });

  it("rejects a non-numeric place and a missing number", async () => {
    expect(
      (await postInternal("/api/v1/internal/queue-callback", { queue: "100", number, place: "abc" }))
        .statusCode,
    ).toBe(400);
    expect(
      (await postInternal("/api/v1/internal/queue-callback", { queue: "100" })).statusCode,
    ).toBe(400);
  });

  it("401s a wrong secret and writes nothing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/internal/queue-callback",
      headers: { "x-dsip-internal": "wrong" },
      payload: { queue: "100", number },
    });
    expect(res.statusCode).toBe(401);
    expect(await db.select().from(missedCalls).where(eq(missedCalls.number, number))).toHaveLength(0);
  });
});