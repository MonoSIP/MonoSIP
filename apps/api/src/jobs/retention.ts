import { and, eq, lt } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { SettingsSchema } from "@monosip/shared";
import { db } from "../db/client.js";
import { recordings, sessions, settings } from "../db/schema.js";

/**
 * Delete session rows past their expiry. `resolveActor` already ignores expired
 * sessions, but nothing deleted them, so the table grew without bound (every
 * login, widget call and extension sign-in adds a row). Pruning them is purely
 * housekeeping — no live session is affected — and keeps the hot auth lookup fast.
 */
export async function pruneExpiredSessions(): Promise<number> {
  const res = (await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))) as { rowCount?: number | null };
  const n = res?.rowCount ?? 0;
  if (n) console.log(`[retention] pruned ${n} expired sessions`);
  return n;
}

export async function runRecordingRetention(): Promise<number> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  const s = SettingsSchema.parse(row?.data ?? {});
  const months = s.recordingRetentionMonths ?? 12;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const archiveConfigured = Boolean(
    (s.recordingArchivePath && String(s.recordingArchivePath).trim()) ||
      (s.recordingArchiveSftp && String(s.recordingArchiveSftp).trim()),
  );

  // If archive is configured, only delete rows already archived (or with no file).
  // Otherwise age-based delete is fine.
  const expired = await db
    .select()
    .from(recordings)
    .where(
      archiveConfigured
        ? and(lt(recordings.createdAt, cutoff), eq(recordings.archived, true))
        : lt(recordings.createdAt, cutoff),
    );

  let deleted = 0;
  for (const rec of expired) {
    try {
      await unlink(rec.filePath);
    } catch {
      /* file may already be gone */
    }
    await db.delete(recordings).where(eq(recordings.id, rec.id));
    deleted++;
  }
  if (deleted) {
    console.log(
      `[retention] deleted ${deleted} recordings older than ${months}m` +
        (archiveConfigured ? " (archived only)" : ""),
    );
  }
  return deleted;
}

async function runRetentionCycle(): Promise<void> {
  await runRecordingRetention();
  await pruneExpiredSessions();
}

export function startRetentionJob(intervalMs = 6 * 3600_000) {
  // Without a rejection handler a failed run (SettingsSchema.parse, a DB error)
  // becomes an unhandled rejection, which is fatal and takes the API down.
  void runRetentionCycle().catch((e) => console.warn("[retention]", (e as Error).message));
  return setInterval(
    () => void runRetentionCycle().catch((e) => console.warn("[retention]", (e as Error).message)),
    intervalMs,
  );
}
