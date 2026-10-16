import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export type TtsLanguage = "en" | "tr";

export async function ttsHealth(): Promise<{
  ok: boolean;
  engine?: string;
  voices?: unknown;
  error?: string;
}> {
  if (!config.ttsUrl) return { ok: false, error: "TTS_URL not configured" };
  try {
    const res = await fetch(`${config.ttsUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json()) as { ok?: boolean; engine?: string; voices?: unknown };
    return { ok: !!body.ok && res.ok, engine: body.engine, voices: body.voices };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function synthesizeSpeech(
  text: string,
  language: TtsLanguage = "en",
  lengthScale = 1.05,
  genderOrVoice: string = "female",
): Promise<Buffer> {
  if (!config.ttsUrl) throw new Error("TTS service not configured (TTS_URL)");
  const g = genderOrVoice.toLowerCase();
  let voice: string | undefined;
  if (g === "male" || g === "erkek") {
    voice = language === "tr" ? "tr-TR-AhmetNeural" : "en-US-GuyNeural";
  } else if (g === "female" || g === "kadin" || g === "kadın") {
    voice = language === "tr" ? "tr-TR-EmelNeural" : "en-US-JennyNeural";
  } else if (genderOrVoice.includes("-")) {
    voice = genderOrVoice;
  }
  const res = await fetch(`${config.ttsUrl}/synthesize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, language, lengthScale, voice, gender: g }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `TTS failed (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Asterisk's native WAV player expects 8 kHz mono 16-bit PCM.
 * Piper (and many uploads) are 22.05 kHz — resample before writing.
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
  const safeId = promptId.replace(/[^\w.-]/g, "").slice(0, 64) || "prompt";
  const filePath = path.join(soundsDir, `${safeId}.${safeExt}`);
  const out = safeExt === "wav" && isLikelyWav(wav) ? convertWavToAsterisk8k(wav) : wav;
  await writeFile(filePath, out);
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
