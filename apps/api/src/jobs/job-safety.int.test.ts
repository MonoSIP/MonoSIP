import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { missedCalls, queues, recordings } from "../db/schema.js";
import {
  restoreSettings,
  setSettings,
  snapshotSettings,
} from "../test/jobs-harness.js";
import { startRetentionJob } from "./retention.js";
import { startArchiveJob } from "./archive.js";
import { startOpusConvertJob } from "./opus-convert.js";
import { startQueueCallbackJob } from "./queue-callback.js";

/**
 * Crash-safety of the background job starters.
 *
 * Every `start*Job` fires its work immediately and then again on an interval.
 * That work is fire-and-forget: nothing awaits the returned promise, so a
 * rejection with no handler attached becomes an *unhandled rejection*, which
 * Node treats as fatal and which therefore takes the whole API down (live calls
 * included) — over a transient DB hiccup or an unreachable Asterisk.
 *
 * These tests make each job's work reject on purpose and assert that the
 * starter handled it: the rejection must surface as a logged warning, and must
 * NOT escape as an unhandled rejection.
 */

vi.mock("../lib/ami.js", () => ({
  fetchQueueWaiting: vi.fn(async () => 0),
  fetchQueueAvailableAgents: vi.fn(async () => 1),
  fetchTrunkEndpointStatus: vi.fn(async () => ({ status: "registered", latencyMs: 5 })),
}));

vi.mock("node:child_process", () => ({
  spawn: vi.fn((cmd: string) => {
    // opus-convert shells out to ffmpeg. Throwing synchronously from spawn
    // rejects the promise runFfmpeg() wraps it in.
    if (cmd === "ffmpeg") throw new Error("ffmpeg exploded");
    return { stderr: { on: vi.fn() }, on: vi.fn() };
  }),
}));

let settingsSnapshot: unknown;
const seededQueues: string[] = [];
const seededMissed: string[] = [];
const seededRecordings: string[] = [];

/** Rejections that escaped every handler — each one would have killed the API. */
let unhandled: unknown[] = [];
/** Warnings the starters logged while handling a failure. */
let warnings: string[] = [];

function onUnhandled(reason: unknown) {
  unhandled.push(reason);
}

beforeEach(async () => {
  settingsSnapshot = await snapshotSettings();
  unhandled = [];
  warnings = [];
  process.on("unhandledRejection", onUnhandled);
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  });
});

afterEach(async () => {
  process.off("unhandledRejection", onUnhandled);
  for (const id of seededQueues) await db.delete(queues).where(eq(queues.id, id));
  for (const id of seededMissed) await db.delete(missedCalls).where(eq(missedCalls.id, id));
  for (const id of seededRecordings) await db.delete(recordings).where(eq(recordings.id, id));
  seededQueues.length = 0;
  seededMissed.length = 0;
  seededRecordings.length = 0;
  await restoreSettings(settingsSnapshot);
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db.$client.end();
});

/** Wait until the starter has dealt with the failure (logged or escaped). */
async function waitForOutcome(settled: () => boolean, ms = 5000): Promise<void> {
  const start = Date.now();
  while (!settled()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting for the job to settle");
    await new Promise((r) => setTimeout(r, 10));
  }
  // Give an escaping rejection a turn to be reported as unhandled.
  await new Promise((r) => setTimeout(r, 20));
}

async function seedWavRecording(): Promise<void> {
  // convertWavToOpus only shells out to ffmpeg for a pending .wav row, so the
  // loop has to have something to work on for the failure to happen at all.
  const [row] = await db
    .insert(recordings)
    .values({ callId: "crash-wav", filePath: "/tmp/crash-wav.wav", duration: 1, sizeBytes: 44 })
    .returning();
  seededRecordings.push(row.id);
}

async function seedCallbackQueue(): Promise<void> {
  const [q] = await db
    .insert(queues)
    .values({ name: "q100", number: "100", callbackEnabled: true })
    .returning();
  seededQueues.push(q.id);
  const [m] = await db
    .insert(missedCalls)
    .values({
      number: "1000",
      target: "qcb:100",
      status: "pending",
      callbackCallId: "place:1",
    })
    .returning();
  seededMissed.push(m.id);
}

describe("job starters never leak an unhandled rejection", () => {
  it("startRetentionJob handles a failing run", async () => {
    // Unparseable settings make SettingsSchema.parse throw inside the job.
    await setSettings({ recordingRetentionMonths: "not-a-number" });

    const timer = startRetentionJob(6 * 3600_000);
    await waitForOutcome(() => warnings.length > 0 || unhandled.length > 0);
    clearInterval(timer);

    expect(unhandled).toEqual([]);
    expect(warnings.some((w) => w.includes("[retention]"))).toBe(true);
  });

  it("startArchiveJob handles a failing run", async () => {
    await setSettings({ recordingRetentionMonths: "not-a-number" });

    const timer = startArchiveJob(12 * 3600_000);
    await waitForOutcome(() => warnings.length > 0 || unhandled.length > 0);
    clearInterval(timer);

    expect(unhandled).toEqual([]);
    expect(warnings.some((w) => w.includes("[archive]"))).toBe(true);
  });

  it("startOpusConvertJob handles a failing run", async () => {
    await seedWavRecording();

    const timer = startOpusConvertJob(3600_000);
    await waitForOutcome(() => warnings.length > 0 || unhandled.length > 0);
    clearInterval(timer);

    expect(unhandled).toEqual([]);
    expect(warnings.some((w) => w.includes("[opus]"))).toBe(true);
  });

  it("startQueueCallbackJob handles a failing run", async () => {
    await seedCallbackQueue();
    const { fetchQueueWaiting } = await import("../lib/ami.js");
    vi.mocked(fetchQueueWaiting).mockRejectedValue(new Error("AMI unreachable"));

    const timer = startQueueCallbackJob(15_000);
    await waitForOutcome(() => warnings.length > 0 || unhandled.length > 0);
    clearInterval(timer);

    expect(unhandled).toEqual([]);
    expect(warnings.some((w) => w.includes("[qcb]"))).toBe(true);
  });
});
