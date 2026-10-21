import { existsSync, openSync, readSync, closeSync, unlinkSync, statSync } from "node:fs";
import { eq, lte, or, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { cdr, recordings } from "../db/schema.js";

/** Duration in whole seconds from a WAV file; 0 if unreadable/empty. */
export function wavDurationSeconds(filePath: string): number {
  try {
    if (!existsSync(filePath)) return 0;
    const st = statSync(filePath);
    if (st.size < 44) return 0;

    const fd = openSync(filePath, "r");
    try {
      const hdr = Buffer.alloc(12);
      readSync(fd, hdr, 0, 12, 0);
      if (hdr.toString("ascii", 0, 4) !== "RIFF" || hdr.toString("ascii", 8, 12) !== "WAVE") {
        // Non-WAV: rough estimate as 8 kHz 16-bit mono PCM
        return Math.max(0, Math.floor((st.size - 44) / 16000));
      }
      let offset = 12;
      let sampleRate = 8000;
      let channels = 1;
      let bits = 16;
      let dataSize = 0;
      const chunkHdr = Buffer.alloc(8);
      while (offset + 8 <= st.size) {
        readSync(fd, chunkHdr, 0, 8, offset);
        const id = chunkHdr.toString("ascii", 0, 4);
        const size = chunkHdr.readUInt32LE(4);
        if (id === "fmt ") {
          const fmt = Buffer.alloc(Math.min(size, 40));
          readSync(fd, fmt, 0, fmt.length, offset + 8);
          channels = fmt.readUInt16LE(2) || 1;
          sampleRate = fmt.readUInt32LE(4) || 8000;
          bits = fmt.readUInt16LE(14) || 16;
        } else if (id === "data") {
          dataSize = size;
          break;
        }
        offset += 8 + size + (size % 2); // word-align
      }
      const bytesPerSec = sampleRate * channels * Math.max(1, bits / 8);
      if (bytesPerSec <= 0 || dataSize <= 0) return 0;
      return Math.floor(dataSize / bytesPerSec);
    } finally {
      closeSync(fd);
    }
  } catch {
    return 0;
  }
}

/** Delete empty / 0-second recording file from disk. */
export function deleteRecordingFile(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    /* ignore */
  }
  // Also try the sibling path on the shared volume
  const alt = filePath.includes("/data/recordings/")
    ? filePath.replace("/data/recordings/", "/var/spool/asterisk/recording/")
    : filePath.replace("/var/spool/asterisk/recording/", "/data/recordings/");
  if (alt !== filePath) {
    try {
      if (existsSync(alt)) unlinkSync(alt);
    } catch {
      /* ignore */
    }
  }
}

function siblingRecordingPath(filePath: string): string {
  return filePath.includes("/data/recordings/")
    ? filePath.replace("/data/recordings/", "/var/spool/asterisk/recording/")
    : filePath.replace("/var/spool/asterisk/recording/", "/data/recordings/");
}

/** Spool and /data/recordings are the same volume; use whichever path exists. */
function locatedRecording(filePath: string): { path: string; size: number } | null {
  for (const candidate of [filePath, siblingRecordingPath(filePath)]) {
    if (!candidate || !existsSync(candidate)) continue;
    try {
      return { path: candidate, size: statSync(candidate).size };
    } catch {
      return { path: candidate, size: 0 };
    }
  }
  return null;
}

/** Remove DB row + file for a call when recording is empty / 0s. */
export async function discardEmptyRecordingsForCall(callId: string): Promise<number> {
  const rows = await db.select().from(recordings).where(eq(recordings.callId, callId));
  let n = 0;
  for (const rec of rows) {
    const found = locatedRecording(rec.filePath);
    const dur = Math.max(rec.duration ?? 0, found ? wavDurationSeconds(found.path) : 0);
    const size = Math.max(rec.sizeBytes ?? 0, found?.size ?? 0);
    // IVR rows are inserted with duration 0 and size 0 before the wav is measured.
    // Keep them when the file itself has audio; the stored size is not the signal.
    if (dur >= 1 || size >= 500) {
      const stored = found?.path.includes("/var/spool/asterisk/recording/")
        ? found.path.replace("/var/spool/asterisk/recording/", "/data/recordings/")
        : (found?.path ?? rec.filePath);
      await db
        .update(recordings)
        .set({ duration: dur, sizeBytes: size, filePath: stored })
        .where(eq(recordings.id, rec.id));
      continue;
    }
    if (found) deleteRecordingFile(found.path);
    else deleteRecordingFile(rec.filePath);
    await db.delete(recordings).where(eq(recordings.id, rec.id));
    n++;
  }
  if (n) {
    await db.update(cdr).set({ recordingId: null }).where(eq(cdr.callId, callId));
  }
  return n;
}

/** Purge all existing 0-second / empty recording rows. */
export async function purgeZeroSecondRecordings(): Promise<number> {
  const rows = await db
    .select()
    .from(recordings)
    .where(or(lte(recordings.duration, 0), isNull(recordings.duration)));
  let n = 0;
  for (const rec of rows) {
    const dur = wavDurationSeconds(rec.filePath);
    if (dur >= 1) {
      await db.update(recordings).set({ duration: dur }).where(eq(recordings.id, rec.id));
      continue;
    }
    deleteRecordingFile(rec.filePath);
    await db.delete(recordings).where(eq(recordings.id, rec.id));
    await db.update(cdr).set({ recordingId: null }).where(eq(cdr.callId, rec.callId));
    n++;
  }
  if (n) console.log(`[recording] purged ${n} zero-second recording(s)`);
  return n;
}
