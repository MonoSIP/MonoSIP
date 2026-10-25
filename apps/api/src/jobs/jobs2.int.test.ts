import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { cdr, extensions, missedCalls, queues, recordings, trunks } from "../db/schema.js";
import {
  NOW,
  captureInterval,
  restoreSettings,
  setSettings,
  settle,
  snapshotSettings,
} from "../test/jobs-harness.js";
import { fetchQueueAvailableAgents, fetchQueueWaiting, fetchTrunkEndpointStatus } from "../lib/ami.js";
import { sendSmtpMail } from "../lib/smtp.js";
import { convertWavToOpus, startOpusConvertJob } from "../jobs/opus-convert.js";
import { processQueueCallbacks, startQueueCallbackJob } from "../jobs/queue-callback.js";
import { startTrunkMonitorJob } from "../jobs/trunk-monitor.js";
import { runNightlyBackup, startNightlyBackupJob } from "../jobs/nightly-backup.js";
import { sendSummaryReport, startSummaryEmailJob } from "../jobs/summary-email.js";

vi.mock("../lib/ami.js", () => ({
  fetchQueueWaiting: vi.fn(async () => 0),
  fetchQueueAvailableAgents: vi.fn(async () => 1),
  fetchTrunkEndpointStatus: vi.fn(async () => ({ status: "registered", latencyMs: 5 })),
}));

vi.mock("../lib/smtp.js", () => ({ sendSmtpMail: vi.fn(async () => undefined) }));

vi.mock("node:child_process", async () => {
  const fs = await import("node:fs");
  return {
    spawn: vi.fn((cmd: string, args: string[]) => {
      const handlers: Record<string, Array<(v: unknown) => void>> = {};
      const proc = {
        stderr: { on: vi.fn() },
        on(ev: string, fn: (v: unknown) => void) {
          (handlers[ev] ??= []).push(fn);
        },
      };
      setTimeout(() => {
        if (cmd === "ffmpeg") {
          const out = args[args.length - 1]!;
          fs.writeFileSync(out, "fake-ogg-bytes");
          handlers.close?.forEach((f) => f(0));
        } else {
          handlers.error?.forEach((f) => f(new Error("ENOENT")));
        }
      }, 0);
      return proc;
    }),
  };
});

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const WORK = path.join(repoRoot, ".temp_files", "runtime", "jobs2");
const FIXTURE = path.join(repoRoot, ".temp_files", "fixtures", "tone-8k-mono-1s.wav");

let settingsSnapshot: unknown;
const seededRecordings: string[] = [];
const seededQueues: string[] = [];
const seededTrunks: string[] = [];
const seededMissed: string[] = [];
const seededExtensions: string[] = [];
const seededCdrs: string[] = [];

function writeWav(name: string): string {
  const p = path.join(WORK, name);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, readFileSync(FIXTURE));
  return p;
}

beforeAll(() => mkdirSync(WORK, { recursive: true }));
afterAll(async () => {
  if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
  await db.$client.end();
});

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date", "setInterval", "clearInterval"] });
  settingsSnapshot = await snapshotSettings();
  vi.mocked(fetchQueueWaiting).mockResolvedValue(0);
  vi.mocked(fetchQueueAvailableAgents).mockResolvedValue(1);
  vi.mocked(fetchTrunkEndpointStatus).mockResolvedValue({ status: "registered", latencyMs: 5 });
  vi.mocked(sendSmtpMail).mockResolvedValue(undefined);
});

afterEach(async () => {
  vi.useRealTimers();
  for (const id of seededRecordings) await db.delete(recordings).where(eq(recordings.id, id));
  for (const id of seededQueues) await db.delete(queues).where(eq(queues.id, id));
  for (const id of seededTrunks) await db.delete(trunks).where(eq(trunks.id, id));
  for (const id of seededMissed) await db.delete(missedCalls).where(eq(missedCalls.id, id));
  for (const id of seededExtensions) await db.delete(extensions).where(eq(extensions.id, id));
  for (const id of seededCdrs) await db.delete(cdr).where(eq(cdr.id, id));
  for (const k of [seededRecordings, seededQueues, seededTrunks, seededMissed, seededExtensions, seededCdrs]) {
    k.length = 0;
  }
  if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  await restoreSettings(settingsSnapshot);
  vi.clearAllMocks();
});

async function seedQueue(number: string, callbackEnabled: boolean) {
  const [row] = await db
    .insert(queues)
    .values({ name: `q${number}`, number, callbackEnabled })
    .returning();
  seededQueues.push(row.id);
  return row;
}

async function seedCallback(number: string, target: string, place: number | null, status = "pending") {
  const [row] = await db
    .insert(missedCalls)
    .values({
      number,
      target,
      status,
      callbackCallId: place == null ? null : `place:${place}`,
    })
    .returning();
  seededMissed.push(row.id);
  return row;
}

async function seedTrunk(name: string) {
  const [row] = await db
    .insert(trunks)
    .values({ name, host: "h.test", port: 5060, enabled: true, secret: "s", codecs: [] })
    .returning();
  seededTrunks.push(row.id);
  return row;
}

async function seedRecordingRow(callId: string, filePath: string, archived = false) {
  const [row] = await db
    .insert(recordings)
    .values({ callId, filePath, duration: 1, sizeBytes: 24044, archived })
    .returning();
  seededRecordings.push(row.id);
  return row;
}

// ------------------------------------------------------------ opus-convert

describe("convertWavToOpus", () => {
  it("converts a pending WAV, repoints the row and removes the source", async () => {
    const file = writeWav("a.wav");
    const row = await seedRecordingRow("opus-1", file);

    expect(await convertWavToOpus()).toBe(1);

    const [after] = await db.select().from(recordings).where(eq(recordings.id, row.id));
    expect(after?.filePath).toBe(path.join(WORK, "a.ogg"));
    expect(existsSync(path.join(WORK, "a.ogg"))).toBe(true);
    expect(existsSync(file)).toBe(false);
  });

  it("skips already-archived recordings", async () => {
    await seedRecordingRow("opus-2", writeWav("b.wav"), true);
    expect(await convertWavToOpus()).toBe(0);
    expect(existsSync(path.join(WORK, "b.wav"))).toBe(true);
  });

  it("skips recordings that are already .ogg", async () => {
    await seedRecordingRow("opus-3", writeWav("c.ogg"));
    expect(await convertWavToOpus()).toBe(0);
  });

  it("honours the batch limit", async () => {
    for (let i = 0; i < 3; i++) await seedRecordingRow(`opus-lim-${i}`, writeWav(`lim${i}.wav`));
    expect(await convertWavToOpus(2)).toBe(2);
  });

  it("leaves the row untouched when ffmpeg is unavailable", async () => {
    const file = writeWav("d.wav");
    const row = await seedRecordingRow("opus-4", file);
    // Emulate a missing ffmpeg binary: the child emits 'error', never 'close'.
    vi.mocked(spawn).mockImplementationOnce((() => {
      const handlers: Record<string, Array<(v: unknown) => void>> = {};
      setTimeout(() => handlers.error?.forEach((f) => f(new Error("ENOENT"))), 0);
      return {
        stderr: { on: vi.fn() },
        on(ev: string, fn: (v: unknown) => void) {
          (handlers[ev] ??= []).push(fn);
        },
      };
    }) as never);

    expect(await convertWavToOpus()).toBe(0);
    const [after] = await db.select().from(recordings).where(eq(recordings.id, row.id));
    expect(after?.filePath).toBe(file);
  });
});

describe("startOpusConvertJob", () => {
  it("registers the hourly interval and the callback converts", async () => {
    await seedRecordingRow("opus-tick", writeWav("tick.wav"));
    const cap = captureInterval();
    const timer = startOpusConvertJob(3600_000);
    cap.restore();

    expect(cap.period()).toBe(3600_000);
    const again = await seedRecordingRow("opus-tick-2", writeWav("tick2.wav"));
    cap.tick()();
    const done = await settle(async () => {
      const [r] = await db.select().from(recordings).where(eq(recordings.id, again.id));
      return r?.filePath.endsWith(".ogg") === true;
    });
    expect(done).toBe(true);
    clearInterval(timer);
  });
});

// ---------------------------------------------------------- queue-callback

describe("processQueueCallbacks", () => {
  it("ignores rows that are not queue callbacks", async () => {
    await seedCallback("1000", "101", 1);
    expect(await processQueueCallbacks()).toBe(0);
  });

  it("marks the row failed when the queue has callbacks disabled", async () => {
    await seedQueue("100", false);
    const row = await seedCallback("1000", "qcb:100", 1);

    await processQueueCallbacks();

    const [after] = await db.select().from(missedCalls).where(eq(missedCalls.id, row.id));
    expect(after?.status).toBe("failed");
  });

  it("does not dial while every agent is busy", async () => {
    await seedQueue("100", true);
    const row = await seedCallback("1000", "qcb:100", 1);
    vi.mocked(fetchQueueAvailableAgents).mockResolvedValue(0);

    expect(await processQueueCallbacks()).toBe(0);
    const [after] = await db.select().from(missedCalls).where(eq(missedCalls.id, row.id));
    expect(after?.status).toBe("pending");
  });

  it("does not dial while the caller still holds their place", async () => {
    await seedQueue("100", true);
    const row = await seedCallback("1000", "qcb:100", 3);
    // 5 people waiting is still >= place 3, so the callback waits.
    vi.mocked(fetchQueueWaiting).mockResolvedValue(5);

    expect(await processQueueCallbacks()).toBe(0);
    const [after] = await db.select().from(missedCalls).where(eq(missedCalls.id, row.id));
    expect(after?.status).toBe("pending");
    expect(after?.callbackCallId).toBe("place:3");
  });

  it("origmates once the queue drops below the saved place", async () => {
    await seedQueue("100", true);
    const row = await seedCallback("1000", "qcb:100", 2);
    vi.mocked(fetchQueueWaiting).mockResolvedValue(1);
    vi.mocked(fetchQueueAvailableAgents).mockResolvedValue(1);

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "PJSIP/1000-0001" }), { status: 200 }));

    expect(await processQueueCallbacks()).toBe(1);
    const [after] = await db.select().from(missedCalls).where(eq(missedCalls.id, row.id));
    expect(after?.status).toBe("returned");
    expect(after?.callbackCallId).toBe("PJSIP/1000-0001");
    fetchSpy.mockRestore();
  });

  it("claims only one callback per queue per pass", async () => {
    await seedQueue("100", true);
    const a = await seedCallback("1000", "qcb:100", 1);
    await seedCallback("1001", "qcb:100", 2);
    vi.mocked(fetchQueueAvailableAgents).mockResolvedValue(1);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "PJSIP/1000-0002" }), { status: 200 }));

    await processQueueCallbacks();
    fetchSpy.mockRestore();

    const [afterA] = await db.select().from(missedCalls).where(eq(missedCalls.id, a.id));
    const all = await db.select().from(missedCalls);
    const stillPending = all.filter((r) => r.number === "1001" && r.status === "pending");
    // The winner is marked; the second caller for the same queue is untouched.
    expect(afterA?.status).toBe("returned");
    expect(stillPending).toHaveLength(1);
  });

  it("does not crash when the queue no longer exists", async () => {
    const row = await seedCallback("1000", "qcb:999", 1);
    await expect(processQueueCallbacks()).resolves.toBe(0);
    const [after] = await db.select().from(missedCalls).where(eq(missedCalls.id, row.id));
    expect(after?.status).toBe("failed");
  });
});

describe("startQueueCallbackJob", () => {
  it("registers a 15s interval by default", () => {
    const cap = captureInterval();
    const timer = startQueueCallbackJob();
    cap.restore();
    expect(cap.period()).toBe(15_000);
    expect(() => cap.tick()()).not.toThrow();
    clearInterval(timer);
  });
});

// ----------------------------------------------------------- trunk-monitor

describe("startTrunkMonitorJob", () => {
  it("marks a registered trunk up and records latency", async () => {
    const trunk = await seedTrunk("Carrier");
    const cap = captureInterval();
    const timer = startTrunkMonitorJob(60_000);
    cap.restore();
    const ok = await settle(async () => {
      const [r] = await db.select().from(trunks).where(eq(trunks.id, trunk.id));
      return r?.status === "up";
    });
    expect(ok).toBe(true);
    clearInterval(timer);
  });

  it("marks an unreachable trunk down", async () => {
    const trunk = await seedTrunk("Dead");
    vi.mocked(fetchTrunkEndpointStatus).mockResolvedValue({
      status: "unreachable",
      latencyMs: null,
    });
    const cap = captureInterval();
    const timer = startTrunkMonitorJob(60_000);
    cap.restore();
    const ok = await settle(async () => {
      const [r] = await db.select().from(trunks).where(eq(trunks.id, trunk.id));
      return r?.status === "down";
    });
    expect(ok).toBe(true);
    clearInterval(timer);
  });

  it("classifies an AMI error as unknown rather than down", async () => {
    const trunk = await seedTrunk("Ami");
    vi.mocked(fetchTrunkEndpointStatus).mockResolvedValue({
      status: "AMI-ERROR-unauthorized",
      latencyMs: null,
    });
    const cap = captureInterval();
    const timer = startTrunkMonitorJob(60_000);
    cap.restore();
    const ok = await settle(async () => {
      const [r] = await db.select().from(trunks).where(eq(trunks.id, trunk.id));
      return r?.status === "unknown";
    });
    expect(ok).toBe(true);
    clearInterval(timer);
  });

  it("never touches a disabled trunk", async () => {
    const [trunk] = await db
      .insert(trunks)
      .values({
        name: "Off",
        host: "h",
        port: 5060,
        enabled: false,
        secret: "s",
        codecs: [],
        status: "sentinel",
      })
      .returning();
    seededTrunks.push(trunk.id);

    const cap = captureInterval();
    const timer = startTrunkMonitorJob(60_000);
    cap.restore();
    cap.tick()();

    // The sentinel survives untouched; the monitor filters on enabled = true.
    const [r] = await db.select().from(trunks).where(eq(trunks.id, trunk.id));
    expect(r?.status).toBe("sentinel");
    clearInterval(timer);
  });
});

// ---------------------------------------------------------- nightly-backup

describe("runNightlyBackup", () => {
  it("writes a dated settings JSON into the configured archive path", async () => {
    const dest = path.join(WORK, "backups");
    await setSettings({ recordingArchivePath: dest });

    await runNightlyBackup();

    const file = path.join(dest, `monosip-settings-${NOW.toISOString().slice(0, 10)}.json`);
    expect(existsSync(file)).toBe(true);
    const payload = JSON.parse(readFileSync(file, "utf8"));
    expect(payload).toHaveProperty("settings");
    expect(payload).toHaveProperty("extensions");
    expect(payload).toHaveProperty("exportedAt");
  });

  it("never writes SIP secrets or password hashes into the backup", async () => {
    const dest = path.join(WORK, "backups");
    await setSettings({ recordingArchivePath: dest });
    const [ext] = await db
      .insert(extensions)
      .values({
        number: "55001",
        name: "Secretive",
        sipSecretEnc: "SUPER-SECRET-CIPHERTEXT",
        portalPasswordHash: "HASHVALUE",
        portalEnabled: true,
      })
      .returning();
    seededExtensions.push(ext.id);

    await runNightlyBackup();

    const raw = readFileSync(
      path.join(dest, `monosip-settings-${NOW.toISOString().slice(0, 10)}.json`),
      "utf8",
    );
    expect(raw).not.toContain("SUPER-SECRET-CIPHERTEXT");
    expect(raw).not.toContain("HASHVALUE");
  });

  it("creates the archive directory when missing", async () => {
    const dest = path.join(WORK, "deep", "nested", "backups");
    await setSettings({ recordingArchivePath: dest });
    await runNightlyBackup();
    expect(existsSync(dest)).toBe(true);
  });
});

describe("startNightlyBackupJob", () => {
  it("schedules the next run with a setTimeout rather than firing immediately", () => {
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation((() => 0) as never);
    startNightlyBackupJob();
    expect(spy).toHaveBeenCalledTimes(1);
    // The wait targets roughly the next 02:05 local.
    const delay = spy.mock.calls[0]?.[1] as number;
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(24 * 3600_000);
    spy.mockRestore();
  });
});

// ---------------------------------------------------------- summary-email

describe("sendSummaryReport", () => {
  async function seedCdr(callId: string, disposition: string, daysAgo: number) {
    const startedAt = new Date(NOW);
    startedAt.setDate(startedAt.getDate() - daysAgo);
    const [row] = await db
      .insert(cdr)
      .values({ callId, startedAt, direction: "inbound", disposition, duration: 1, billsec: 1 })
      .returning();
    seededCdrs.push(row.id);
    return row;
  }

  it("stays log-only when SMTP is not configured", async () => {
    await setSettings({});
    await seedCdr("sum-1", "ANSWERED", 0);
    await sendSummaryReport("daily");
    expect(sendSmtpMail).not.toHaveBeenCalled();
  });

  it("sends CSV + PDF attachments once SMTP is configured", async () => {
    await setSettings({ smtpHost: "smtp.test", smtpTo: "ops@test.local" });
    await seedCdr("sum-2", "ANSWERED", 0);

    await sendSummaryReport("daily");

    expect(sendSmtpMail).toHaveBeenCalledTimes(1);
    const [cfg, subject, body, attachments] = vi.mocked(sendSmtpMail).mock.calls[0]!;
    expect((cfg as { host: string }).host).toBe("smtp.test");
    expect(subject).toContain("daily summary");
    expect(body).toContain("Total CDR:");
    const names = (attachments as Array<{ filename: string; buffer: Buffer }>).map((a) => a.filename);
    expect(names.some((n) => n.endsWith(".csv"))).toBe(true);
    expect(names.some((n) => n.endsWith(".pdf"))).toBe(true);
    const pdf = (attachments as Array<{ buffer: Buffer }>).find((a) =>
      a.buffer.subarray(0, 4).toString("ascii").startsWith("%PDF"),
    );
    expect(pdf).toBeDefined();
  });

  it("excludes yesterday's calls from the daily window", async () => {
    await setSettings({ smtpHost: "smtp.test", smtpTo: "ops@test.local" });
    await seedCdr("sum-today", "ANSWERED", 0);
    await seedCdr("sum-old", "ANSWERED", 5);

    await sendSummaryReport("daily");

    const body = vi.mocked(sendSmtpMail).mock.calls[0]?.[2] as string;
    expect(body).toContain("Total CDR: 1");
  });

  it("widens the window to month-start for the monthly report", async () => {
    await setSettings({ smtpHost: "smtp.test", smtpTo: "ops@test.local" });
    await seedCdr("sum-month", "ANSWERED", 0);

    await sendSummaryReport("monthly");

    const body = vi.mocked(sendSmtpMail).mock.calls[0]?.[2] as string;
    expect(body).toContain("monthly summary");
  });

  it("survives an SMTP failure without throwing", async () => {
    await setSettings({ smtpHost: "smtp.test", smtpTo: "ops@test.local" });
    vi.mocked(sendSmtpMail).mockRejectedValue(new Error("relay refused"));
    await expect(sendSummaryReport("daily")).resolves.toBeUndefined();
  });
});

describe("startSummaryEmailJob", () => {
  it("schedules via setTimeout instead of sending on boot", () => {
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation((() => 0) as never);
    startSummaryEmailJob();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(sendSmtpMail).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});