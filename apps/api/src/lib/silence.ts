/**
 * Audible-path "silence" for IVR channels.
 *
 * While a Stasis channel just sleeps, Asterisk sends no RTP at all. The first
 * prompt after such a gap starts a fresh talk-spurt, and the browser's jitter
 * buffer clips its first syllable while it adapts. Playing a near-silent clip
 * instead keeps packets flowing, and a short clip before hangup lets the last
 * words of a prompt drain out of the caller's jitter buffer before the BYE.
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const RATE = 8000;

/** 16-bit mono 8 kHz WAV of `ms` near-silence (±1 LSB dither, so no codec/VAD drops it). */
export function silenceWav(ms: number): Buffer {
  const samples = Math.round((RATE * ms) / 1000);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(i % 2 ? 1 : -1, i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const ready = new Map<number, Promise<string>>();

/** `sound:` URI of an `ms`-long silence clip, written once under sounds/munasip. */
export function silenceMedia(ms: number): Promise<string> {
  let p = ready.get(ms);
  if (!p) {
    p = (async () => {
      const dir = path.join(config.asterisk.configDir, "sounds", "munasip");
      const file = path.join(dir, `silence-${ms}.wav`);
      if (!existsSync(file)) {
        await mkdir(dir, { recursive: true });
        await writeFile(file, silenceWav(ms));
        await chmod(file, 0o644).catch(() => undefined);
      }
      return `sound:munasip/silence-${ms}`;
    })();
    p.catch(() => ready.delete(ms));
    ready.set(ms, p);
  }
  return p;
}
