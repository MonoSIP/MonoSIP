import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { recordings, settings } from "../db/schema.js";
import { runRecordingArchive, startArchiveJob } from "./archive.js";
import { runRecordingRetention, startRetentionJob } from "./retention.js";

/**
 * Fake-timer coverage for the two destructive jobs.
 *
 * These modules own irreversible behaviour — `retention` DELETES recording rows
 * and unlinks their files, `archive` copies them off-box and flips `archived`.
 * They read policy from the `settings` singleton (id = 1), which is shared by
 * the whole suite, so its `data` is snapshotted and restored around every test.
 *
 * The `start*Job` wrappers fire once immediately and then on an interval; the
 * interval cases prove a *second* run happens by seeding a recording after the
 * first run has already settled.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const WORK = path.join(repoRoot, ".temp_files", "runtime", "jobs");

const NOW = new Date("2026-06-15T12:00:00Z");
let settingsSnapshot: unknown;
let seeded: string[] = [];

async function setSettings(data: Record<string, unknown>) {
  await db
    .insert(settings)
    .values({ id: 1, data })
    .onConflictDoUpdate({ target: settings.id, set: { data } });
}

/** Seed a recording row plus a real file on disk. */
async function seedRecording(
  fileName: string,
  opts: { ageMonths: number; archived?: boolean },
): Promise<{ id: string; filePath: string }> {
  const filePath = path.join(WORK, fileName);
  mkdirSync(WORK, { recursive: true });
  writeFileSync(filePath, readFileSync(path.join(repoRoot, ".temp_files", "fixtures", "tone-8k-mono-1s.wav")));
  const createdAt = new Date(NOW);
  createdAt.setMonth(createdAt.getMonth() - opts.ageMonths);
  const [row] = await db
    .insert(recordings)
    .values({
      callId: `job-${fileName}`,
      filePath,
      duration: 1,
      sizeBytes: 24044,
      archived: opts.archived ?? false,
      createdAt,
    })
    .returning();
  seeded.push(row.id);
  return { id: row.id, filePath };
}

beforeAll(async () => {
  mkdirSync(WORK, { recursive: true });
});

afterAll(async () => {
  await db.$client.end();
});

beforeEach(async () => {
  // Fake ONLY Date and setInterval. Leaving setTimeout/setImmediate real keeps a
  // real event loop available, which the fire-and-forget job callbacks need in
  // order to complete their Postgres round-trip.
  vi.useFakeTimers({ now: NOW, toFake: ["Date", "setInterval", "clearInterval"] });
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  settingsSnapshot = row ? structuredClone(row.data) : null;
});

afterEach(async () => {
  vi.useRealTimers();
  for (const id of seeded) await db.delete(recordings).where(eq(recordings.id, id));
  seeded = [];
  if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  if (settingsSnapshot === null) {
    await db.delete(settings).where(eq(settings.id, 1));
  } else {
    await db
      .insert(settings)
      .values({ id: 1, data: settingsSnapshot })
      .onConflictDoUpdate({ target: settings.id, set: { data: settingsSnapshot } });
  }
});

const count = () => db.select().from(recordings);

/** Poll until `fn` returns true, using the real (non-faked) event loop. */
async function settle(fn: () => Promise<boolean>, tries = 50): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

// ------------------------------------------------------------- retention

describe("runRecordingRetention", () => {
  it("deletes recordings older than the configured retention window", async () => {
    await setSettings({ recordingRetentionMonths: 12 });
    const old = await seedRecording("old.wav", { ageMonths: 13 });

    const deleted = await runRecordingRetention();

    expect(deleted).toBe(1);
    const rows = await count();
    expect(rows.map((r) => r.id)).not.toContain(old.id);
  });

  it("also unlinks the audio file from disk", async () => {
    await setSettings({ recordingRetentionMonths: 12 });
    const old = await seedRecording("unlink-me.wav", { ageMonths: 24 });
    expect(existsSync(old.filePath)).toBe(true);

    await runRecordingRetention();

    expect(existsSync(old.filePath)).toBe(false);
  });

  it("keeps recordings inside the retention window", async () => {
    await setSettings({ recordingRetentionMonths: 12 });
    const fresh = await seedRecording("fresh.wav", { ageMonths: 2 });

    expect(await runRecordingRetention()).toBe(0);
    const rows = await count();
    expect(rows.map((r) => r.id)).toContain(fresh.id);
    expect(existsSync(fresh.filePath)).toBe(true);
  });

  it("treats the boundary month as still retained", async () => {
    await setSettings({ recordingRetentionMonths: 12 });
    const edge = await seedRecording("edge.wav", { ageMonths: 11 });
    expect(await runRecordingRetention()).toBe(0);
    expect((await count()).map((r) => r.id)).toContain(edge.id);
  });

  it("deletes nothing when no recording is expired", async () => {
    // 84 is the schema maximum; anything higher fails SettingsSchema.parse.
    await setSettings({ recordingRetentionMonths: 84 });
    await seedRecording("young.wav", { ageMonths: 1 });
    expect(await runRecordingRetention()).toBe(0);
    expect((await count())[0]?.archived).toBe(false);
  });

  it("still removes rows whose file has already vanished", async () => {
    await setSettings({ recordingRetentionMonths: 12 });
    const gone = await seedRecording("already-gone.wav", { ageMonths: 13 });
    rmSync(gone.filePath, { force: true });

    // The unlink throws internally; the row must still be cleaned up.
    expect(await runRecordingRetention()).toBe(1);
    expect((await count()).map((r) => r.id)).not.toContain(gone.id);
  });

  describe("when an archive destination is configured", () => {
    it("deletes only rows already flagged archived", async () => {
      await setSettings({ recordingRetentionMonths: 12, recordingArchivePath: WORK });
      const unarchived = await seedRecording("unarchived.wav", { ageMonths: 24 });
      const archived = await seedRecording("archived.wav", { ageMonths: 24, archived: true });

      const deleted = await runRecordingRetention();

      expect(deleted).toBe(1);
      const ids = (await count()).map((r) => r.id);
      // The not-yet-archived row survives so it can still be off-boxed.
      expect(ids).toContain(unarchived.id);
      expect(ids).not.toContain(archived.id);
    });

    it("applies the same rule for a configured SFTP destination", async () => {
      await setSettings({ recordingRetentionMonths: 12, recordingArchiveSftp: "sftp://u@h/r" });
      const unarchived = await seedRecording("sftp-unarchived.wav", { ageMonths: 24 });
      const archived = await seedRecording("sftp-archived.wav", { ageMonths: 24, archived: true });

      expect(await runRecordingRetention()).toBe(1);
      const ids = (await count()).map((r) => r.id);
      expect(ids).toContain(unarchived.id);
      expect(ids).not.toContain(archived.id);
    });
  });
});

describe("startRetentionJob", () => {
  it("runs once immediately on start", async () => {
    await setSettings({ recordingRetentionMonths: 12 });
    const old = await seedRecording("immediate.wav", { ageMonths: 24 });

    const timer = startRetentionJob(60_000);
    await vi.advanceTimersByTimeAsync(0);

    expect((await count()).map((r) => r.id)).not.toContain(old.id);
    clearInterval(timer);
  });

  it("registers the interval and the registered callback does the work", async () => {
    await setSettings({ recordingRetentionMonths: 12 });
    const first = await seedRecording("tick-1.wav", { ageMonths: 24 });

    // Capture what the wrapper registers instead of racing the real clock: the
    // callback is fire-and-forget, so invoking it directly is the deterministic
    // way to prove the periodic run performs the same deletion.
    let tick: (() => void) | undefined;
    let period = 0;
    const spy = vi.spyOn(globalThis, "setInterval").mockImplementation(((
      cb: () => void,
      ms: number,
    ) => {
      tick = cb;
      period = ms;
      return 0 as unknown as NodeJS.Timeout;
    }) as never);

    const timer = startRetentionJob(60_000);
    spy.mockRestore();

    expect(period).toBe(60_000);
    expect(tick).toBeTypeOf("function");

    // The immediate invocation already cleared the first recording.
    expect(await settle(async () => !(await count()).map((r) => r.id).includes(first.id))).toBe(
      true,
    );

    // Seed after that pass; only the interval callback can clear it.
    const second = await seedRecording("tick-2.wav", { ageMonths: 24 });
    tick!();
    expect(
      await settle(async () => !(await count()).map((r) => r.id).includes(second.id)),
    ).toBe(true);
    clearInterval(timer);
  });

  it("registers a timer so the caller can stop the job", async () => {
    await setSettings({ recordingRetentionMonths: 12 });
    const timer = startRetentionJob(60_000);
    expect(timer).toBeDefined();
    clearInterval(timer);
  });
});

// --------------------------------------------------------------- archive

describe("runRecordingArchive", () => {
  it("is a no-op when neither path nor SFTP is configured", async () => {
    await setSettings({});
    await seedRecording("no-dest.wav", { ageMonths: 1 });
    expect(await runRecordingArchive()).toBe(0);
    // Nothing is marked archived without a destination.
    expect((await count())[0]?.archived).toBe(false);
  });

  it("copies pending recordings to the archive path and marks them archived", async () => {
    const dest = path.join(WORK, "archive-dest");
    await setSettings({ recordingArchivePath: dest });
    const rec = await seedRecording("archive-me.wav", { ageMonths: 2 });

    expect(await runRecordingArchive()).toBe(1);

    const copied = path.join(dest, "archive-me.wav");
    expect(existsSync(copied)).toBe(true);
    // Content survives the copy byte-for-byte.
    expect(readFileSync(copied)).toEqual(readFileSync(rec.filePath));

    const [row] = await db.select().from(recordings).where(eq(recordings.id, rec.id));
    expect(row?.archived).toBe(true);
  });

  it("skips recordings already marked archived", async () => {
    const dest = path.join(WORK, "archive-dest2");
    await setSettings({ recordingArchivePath: dest });
    await seedRecording("already.wav", { ageMonths: 2, archived: true });

    expect(await runRecordingArchive()).toBe(0);
    expect(existsSync(path.join(dest, "already.wav"))).toBe(false);
  });

  it("is idempotent — a second run archives nothing new", async () => {
    const dest = path.join(WORK, "archive-dest3");
    await setSettings({ recordingArchivePath: dest });
    await seedRecording("twice.wav", { ageMonths: 2 });

    expect(await runRecordingArchive()).toBe(1);
    expect(await runRecordingArchive()).toBe(0);
  });

  it("does not flag a recording archived when the copy fails", async () => {
    const dest = path.join(WORK, "archive-dest4");
    await setSettings({ recordingArchivePath: dest });
    const rec = await seedRecording("broken.wav", { ageMonths: 2 });
    // Remove the source so copyFile throws.
    rmSync(rec.filePath, { force: true });

    expect(await runRecordingArchive()).toBe(0);
    const [row] = await db.select().from(recordings).where(eq(recordings.id, rec.id));
    expect(row?.archived).toBe(false);
  });

  it("creates the destination directory when it does not exist", async () => {
    const dest = path.join(WORK, "deep", "nested", "dest");
    await setSettings({ recordingArchivePath: dest });
    await seedRecording("nested.wav", { ageMonths: 2 });

    expect(await runRecordingArchive()).toBe(1);
    expect(existsSync(path.join(dest, "nested.wav"))).toBe(true);
  });
});

describe("startArchiveJob", () => {
  it("runs immediately and again on the interval", async () => {
    const dest = path.join(WORK, "archive-tick");
    await setSettings({ recordingArchivePath: dest });

    const timer = startArchiveJob(60_000);
    await vi.advanceTimersByTimeAsync(0);

    // Seed after the immediate pass; the interval must pick it up.
    const rec = await seedRecording("tick-archive.wav", { ageMonths: 2 });
    await vi.advanceTimersByTimeAsync(60_000);
    const archived = await settle(async () => {
      if (!existsSync(path.join(dest, "tick-archive.wav"))) return false;
      const [row] = await db.select().from(recordings).where(eq(recordings.id, rec.id));
      return row?.archived === true;
    });
    expect(archived).toBe(true);
    clearInterval(timer);
  });
});