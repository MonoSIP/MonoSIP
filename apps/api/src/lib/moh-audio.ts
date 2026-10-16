import { spawn } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { convertWavToAsterisk8k, isLikelyWav } from "./tts.js";
import { config } from "../config.js";

/** Shared MOH root (API + Asterisk via asterisk_config volume). */
export function mohClassDir(className: string): string {
  const safe = className.replace(/[^\w.-]/g, "_") || "default";
  return path.join(config.asterisk.configDir, "moh", safe);
}

function ffmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr?.on("data", (c) => {
      err += String(c);
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.slice(-500) || `ffmpeg exit ${code}`));
    });
  });
}

/**
 * Normalize any common audio upload to Asterisk-friendly 8 kHz mono PCM WAV.
 * Returns the stored filename (always `.wav`).
 */
export async function writeMohAudioFile(
  className: string,
  originalName: string,
  buf: Buffer,
): Promise<{ file: string; converted: boolean; path: string }> {
  const dir = mohClassDir(className);
  await mkdir(dir, { recursive: true });

  const base =
    originalName
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w.-]/g, "_")
      .slice(0, 80) || "moh";
  const outName = `${base}.wav`;
  const outPath = path.join(dir, outName);

  const ext = (originalName.split(".").pop() ?? "").toLowerCase();
  const alreadyOkWav =
    (ext === "wav" || isLikelyWav(buf)) &&
    isLikelyWav(buf) &&
    isAsteriskFriendlyWav(buf);

  if (alreadyOkWav) {
    await writeFile(outPath, buf);
    return { file: outName, converted: false, path: outPath };
  }

  const hasFf = await ffmpegAvailable();
  if (hasFf) {
    const tmpIn = path.join(dir, `.upload-${Date.now()}-${base}.${ext || "bin"}`);
    await writeFile(tmpIn, buf);
    try {
      await runFfmpeg([
        "-y",
        "-i",
        tmpIn,
        "-ac",
        "1",
        "-ar",
        "8000",
        "-c:a",
        "pcm_s16le",
        outPath,
      ]);
      return { file: outName, converted: true, path: outPath };
    } finally {
      await unlink(tmpIn).catch(() => undefined);
    }
  }

  // No ffmpeg: only WAV can be resampled in-process
  if (isLikelyWav(buf)) {
    const converted = convertWavToAsterisk8k(buf);
    await writeFile(outPath, converted);
    return {
      file: outName,
      converted: !converted.equals(buf),
      path: outPath,
    };
  }

  throw new Error(
    "Unsupported audio format without ffmpeg. Upload WAV, or install ffmpeg in the API image (MP3/OGG/M4A).",
  );
}

function isAsteriskFriendlyWav(buf: Buffer): boolean {
  if (!isLikelyWav(buf) || buf.length < 44) return false;
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt " && size >= 16) {
      channels = buf.readUInt16LE(start + 2);
      sampleRate = buf.readUInt32LE(start + 4);
      bits = buf.readUInt16LE(start + 14);
      break;
    }
    offset = start + size + (size % 2);
  }
  return channels === 1 && sampleRate === 8000 && bits === 16;
}
