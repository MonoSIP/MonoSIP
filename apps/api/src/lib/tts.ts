import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);

export type TtsLanguage = "en" | "tr";

export async function ttsHealth(): Promise<{
  ok: boolean;
  engine?: string;
  voices?: unknown;
  error?: string;
}> {
  if (config.ttsUrl) {
    try {
      const res = await fetch(`${config.ttsUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const body = (await res.json()) as { ok?: boolean; engine?: string; voices?: unknown };
      if (res.ok && body.ok) {
        return { ok: true, engine: body.engine ?? "remote", voices: body.voices };
      }
    } catch {
      /* fall through to espeak */
    }
  }
  try {
    await execFileAsync("espeak-ng", ["--version"], { timeout: 3000 });
    return { ok: true, engine: "espeak-ng" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Last-resort fallback when embedded TTS (127.0.0.1:5500) is unreachable. */
async function synthesizeWithEspeak(text: string, language: TtsLanguage): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "dsip-tts-"));
  const raw = path.join(dir, "raw.wav");
  const out = path.join(dir, "8k.wav");
  try {
    const voice = language === "tr" ? "tr" : "en";
    await execFileAsync(
      "espeak-ng",
      ["-v", voice, "-s", "140", "-w", raw, text.slice(0, 500)],
      { timeout: 30_000 },
    );
    await execFileAsync(
      "ffmpeg",
      ["-y", "-i", raw, "-ac", "1", "-ar", "8000", "-sample_fmt", "s16", out],
      { timeout: 30_000 },
    );
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function isEmaVoice(v: string): boolean {
  const g = v.toLowerCase();
  return g === "ema" || g === "ema-lightning";
}

function isKokoroVoice(v: string): boolean {
  return v.toLowerCase() === "kokoro";
}

/** Explicit offline neural voices must not silently degrade to robotic espeak. */
function isFailClosedVoice(v: string): boolean {
  return isEmaVoice(v) || isKokoroVoice(v);
}

export async function synthesizeSpeech(
  text: string,
  language: TtsLanguage = "en",
  lengthScale = 1.05,
  genderOrVoice: string = "female",
): Promise<Buffer> {
  const g = genderOrVoice.toLowerCase();
  // EMA = Turkish-only, Kokoro = English-only — force lang so a mismatched UI
  // choice does not 500 inside the TTS service and then fall through to espeak.
  const lang: TtsLanguage = isEmaVoice(g) ? "tr" : isKokoroVoice(g) ? "en" : language;
  let voice: string | undefined;
  if (isEmaVoice(g)) {
    voice = "ema-lightning";
  } else if (isKokoroVoice(g)) {
    voice = "kokoro";
  } else if (g === "male" || g === "erkek") {
    voice = lang === "tr" ? "tr-TR-AhmetNeural" : "en-US-GuyNeural";
  } else if (g === "female" || g === "kadin" || g === "kadın") {
    voice = lang === "tr" ? "tr-TR-EmelNeural" : "en-US-JennyNeural";
  } else if (genderOrVoice.includes("-")) {
    voice = genderOrVoice;
  }
  if (config.ttsUrl) {
    try {
      const res = await fetch(`${config.ttsUrl}/synthesize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, language: lang, lengthScale, voice, gender: g }),
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      console.warn("[tts] remote failed:", err.error ?? res.status);
      if (isFailClosedVoice(g)) {
        throw new Error(err.error ?? `TTS failed (${res.status})`);
      }
    } catch (e) {
      if (isFailClosedVoice(g)) throw e;
      console.warn("[tts] remote unreachable:", (e as Error).message);
    }
  } else if (isFailClosedVoice(g)) {
    const name = isEmaVoice(g) ? "EMA" : "Kokoro";
    throw new Error(`${name} TTS unavailable: TTS_URL unset`);
  }
  return synthesizeWithEspeak(text, lang);
}

/**
 * Asterisk's native WAV player expects 8 kHz mono 16-bit PCM.
 * Many uploads are 22.05 kHz — resample before writing.
 */
export function convertWavToAsterisk8k(buf: Buffer): Buffer {
  if (!isLikelyWav(buf)) return buf;

  let offset = 12;
  let channels = 1;
  let sampleRate = 8000;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt " && size >= 16) {
      channels = buf.readUInt16LE(start + 2);
      sampleRate = buf.readUInt32LE(start + 4);
      bitsPerSample = buf.readUInt16LE(start + 14);
    } else if (id === "data") {
      dataOffset = start;
      dataSize = size;
      break;
    }
    offset = start + size + (size % 2);
  }

  if (dataOffset < 0 || bitsPerSample !== 16) return buf;
  if (sampleRate === 8000 && channels === 1) return buf;

  const frameCount = Math.floor(dataSize / (channels * 2));
  const mono = new Int16Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += buf.readInt16LE(dataOffset + (i * channels + c) * 2);
    }
    mono[i] = Math.max(-32768, Math.min(32767, Math.round(sum / channels)));
  }

  const outLen = Math.max(1, Math.round((frameCount * 8000) / sampleRate));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = (i * (frameCount - 1)) / Math.max(1, outLen - 1);
    const i0 = Math.floor(src);
    const i1 = Math.min(frameCount - 1, i0 + 1);
    const t = src - i0;
    out[i] = Math.round(mono[i0]! * (1 - t) + mono[i1]! * t);
  }

  const dataBytes = Buffer.alloc(outLen * 2);
  for (let i = 0; i < outLen; i++) dataBytes.writeInt16LE(out[i]!, i * 2);

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataBytes.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(8000 * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataBytes.length, 40);
  return Buffer.concat([header, dataBytes]);
}

/** Write audio under Asterisk sounds path; returns absolute path and play media URI. */
export async function writePromptWav(
  promptId: string,
  wav: Buffer,
  ext = "wav",
): Promise<{ filePath: string; media: string }> {
  const safeExt = ext.replace(/^\./, "").toLowerCase() || "wav";
  const soundsDir = path.join(config.asterisk.configDir, "sounds", "dsip");
  await mkdir(soundsDir, { recursive: true });
  // Asterisk runs as non-root — keep dirs/files world-readable (API may run as root).
  await chmod(soundsDir, 0o755).catch(() => undefined);
  const safeId = promptId.replace(/[^\w.-]/g, "").slice(0, 64) || "prompt";
  const filePath = path.join(soundsDir, `${safeId}.${safeExt}`);
  const out = safeExt === "wav" && isLikelyWav(wav) ? convertWavToAsterisk8k(wav) : wav;
  await writeFile(filePath, out);
  await chmod(filePath, 0o644).catch(() => undefined);
  // Relative to Asterisk sounds/ (symlink sounds/dsip → dsip/sounds/dsip)
  const media = `sound:dsip/${safeId}`;
  return { filePath, media };
}

export function isLikelyWav(buf: Buffer): boolean {
  return buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE";
}

export function extFromUpload(filename?: string | null, mime?: string | null, buf?: Buffer): string {
  const fromName = filename?.split(".").pop()?.toLowerCase();
  if (fromName && ["wav", "ulaw", "alaw", "gsm", "sln", "sln16"].includes(fromName)) return fromName;
  if (mime?.includes("wav")) return "wav";
  if (buf && isLikelyWav(buf)) return "wav";
  return fromName && /^[a-z0-9]+$/i.test(fromName) ? fromName : "wav";
}

export function promptMediaUri(filePath: string | null | undefined, promptId?: string): string | null {
  // Prefer sound:dsip/<id> (works with Asterisk sounds path + symlink)
  if (promptId) {
    const safeId = promptId.replace(/[^\w.-]/g, "");
    if (safeId) return `sound:dsip/${safeId}`;
  }
  if (filePath) {
    const base = path.basename(filePath).replace(/\.[^.]+$/i, "");
    if (base) return `sound:dsip/${base}`;
  }
  return null;
}
