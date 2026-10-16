import { spawn } from "node:child_process";
import { unlink } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { recordings } from "../db/schema.js";

/** Optional: convert WAV recordings to Opus (ogg) when ffmpeg is available. */
export async function convertWavToOpus(limit = 20): Promise<number> {
  const rows = await db.select().from(recordings).limit(200);
  const wavs = rows.filter((r) => r.filePath.endsWith(".wav") && !r.archived).slice(0, limit);
  let n = 0;
  for (const rec of wavs) {
    const out = rec.filePath.replace(/\.wav$/i, ".ogg");
    const ok = await runFfmpeg(rec.filePath, out);
    if (!ok) continue;
    try {
      await unlink(rec.filePath);
    } catch {
      /* keep wav if unlink fails */
    }
    await db.update(recordings).set({ filePath: out }).where(eq(recordings.id, rec.id));
    n++;
  }
  if (n) console.log(`[opus] converted ${n} recordings`);
  return n;
}

function runFfmpeg(input: string, output: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(
      "ffmpeg",
      ["-y", "-i", input, "-c:a", "libopus", "-b:a", "32k", output],
      { stdio: "ignore" },
    );
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

export function startOpusConvertJob(intervalMs = 3600_000) {
  void convertWavToOpus();
  return setInterval(() => void convertWavToOpus(), intervalMs);
}
