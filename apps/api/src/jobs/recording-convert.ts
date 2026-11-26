import { spawn } from "node:child_process";
import { stat, unlink } from "node:fs/promises";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { recordings } from "../db/schema.js";

/** Untouched for this long means Asterisk has closed the file. */
const BUSY_MS = 5 * 60_000;

/**
 * Store finished call recordings as MP3 (8 kHz mono, 32 kbps, ~240 KB a minute):
 * a quarter of the WAV Asterisk writes, and it opens in every player and archive
 * tool. Recordings converted to Opus/OGG by older releases are moved to MP3 too.
 */
export async function convertRecordingsToMp3(limit = 20): Promise<number> {
  const pending = await db
    .select()
    .from(recordings)
    .where(
      and(
        eq(recordings.archived, false),
        or(
          sql`lower(${recordings.filePath}) like '%.wav'`,
          sql`lower(${recordings.filePath}) like '%.ogg'`,
        ),
      ),
    )
    .limit(200);
  let n = 0;
  for (const rec of pending) {
    if (n >= limit) break;
    // A recording still being written (IVR rows exist from the start of the call)
    // must not be converted: the WAV would be deleted under Asterisk and the rest
    // of the call lost. Asterisk writes every few ms, so a quiet file is finished.
    const st = await stat(rec.filePath).catch(() => null);
    if (!st || Date.now() - st.mtimeMs < BUSY_MS) continue;
    const out = rec.filePath.replace(/\.(wav|ogg)$/i, ".mp3");
    const ok = await runFfmpeg(rec.filePath, out);
    if (!ok) continue;
    try {
      await unlink(rec.filePath);
    } catch {
      /* keep the source if unlink fails */
    }
    const size = await stat(out)
      .then((s) => s.size)
      .catch(() => rec.sizeBytes ?? 0);
    await db
      .update(recordings)
      .set({ filePath: out, sizeBytes: size })
      .where(eq(recordings.id, rec.id));
    n++;
  }
  if (n) console.log(`[mp3] converted ${n} recordings`);
  return n;
}

function runFfmpeg(input: string, output: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(
      "ffmpeg",
      ["-y", "-i", input, "-ac", "1", "-ar", "8000", "-c:a", "libmp3lame", "-b:a", "32k", output],
      { stdio: "ignore" },
    );
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

export function startRecordingConvertJob(intervalMs = 3600_000) {
  // A failed conversion (ffmpeg missing, a deleted file) must not become an
  // unhandled rejection — that is fatal for the whole API process.
  const run = () =>
    void convertRecordingsToMp3().catch((e) => console.warn("[mp3]", (e as Error).message));
  run();
  return setInterval(run, intervalMs);
}
