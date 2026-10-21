import { and, eq, lt } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { SettingsSchema } from "@munasip/shared";
import { db } from "../db/client.js";
import { recordings, settings } from "../db/schema.js";

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

export function startRetentionJob(intervalMs = 6 * 3600_000) {
  void runRecordingRetention();
  return setInterval(() => void runRecordingRetention(), intervalMs);
}
