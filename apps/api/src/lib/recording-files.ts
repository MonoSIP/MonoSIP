import { existsSync, openSync, readFileSync, readSync, closeSync, unlinkSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
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

/** Asterisk sometimes leaves the WAV sizes at 0. Browsers then refuse to play the file. */
export function repairWavHeader(buf: Buffer): void {
  if (buf.length < 44) return;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return;
  if (buf.readUInt32LE(4) !== buf.length - 8) buf.writeUInt32LE(buf.length - 8, 4);
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      const available = buf.length - (offset + 8);
      if (size === 0 || size > available) buf.writeUInt32LE(available, offset + 4);
      return;
    }
    if (size > buf.length) return;
    offset += 8 + size + (size % 2);
  }
}

function wavFormatTag(buf: Buffer): number | null {
  if (buf.length < 44) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt " && offset + 10 <= buf.length) return buf.readUInt16LE(offset + 8);
    if (size > buf.length) return null;
    offset += 8 + size + (size % 2);
  }
  return null;
}

function transcodeToPcmWav(source: string | Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const fromBuffer = Buffer.isBuffer(source);
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      fromBuffer ? "pipe:0" : source,
      "-f",
      "wav",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "8000",
      "-ac",
      "1",
      "pipe:1",
    ];
    // Concrete stdio tuples so @types/node resolves the non-null-stream overloads
    // (stdin is piped only when transcoding from a buffer). The previous inline
    // ternary widened the first element to a union that matches no tuple
    // overload, so spawn fell back to the nullable base ChildProcess type and
    // tsc --noEmit failed on every stream access here.
    const child = fromBuffer
      ? spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] })
      : spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
      else reject(new Error(Buffer.concat(err).toString("utf8") || `ffmpeg exit ${code}`));
    });
    if (fromBuffer) {
      const stdin = child.stdin;
      // The tuple overload guarantees a stdin pipe in the buffer branch; fail
      // loudly instead of hanging on an unwritten pipe if that ever changes.
      if (!stdin) {
        reject(new Error("ffmpeg did not provide a stdin pipe"));
        return;
      }
      stdin.on("error", () => undefined);
      stdin.end(source);
    }
  });
}

/**
 * Bytes a browser can decode. Asterisk mailbox files are often a WAV with a
 * zero data-chunk size, or GSM inside a wav container. Either one decodes as
 * silence in the browser, so the file is rewritten to 8 kHz PCM first.
 */
export async function browserWavBytes(filePath: string): Promise<Buffer> {
  const raw = readFileSync(filePath);
  repairWavHeader(raw);
  try {
    const wav = await transcodeToPcmWav(raw);
    if (wav.length >= 128 && wavFormatTag(wav) === 1) return wav;
  } catch {
    try {
      const wav = await transcodeToPcmWav(filePath);
      if (wav.length >= 128 && wavFormatTag(wav) === 1) return wav;
    } catch {
      /* repaired original */
    }
  }
  return raw;
}
