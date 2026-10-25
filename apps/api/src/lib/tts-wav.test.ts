import { describe, expect, it } from "vitest";
import { convertWavToAsterisk8k, extFromUpload, isLikelyWav } from "./tts.js";

/** Minimal PCM WAV: 16 kHz mono 16-bit, 0.1s silence. */
function makeWav(sampleRate: number, samples: number, channels = 1): Buffer {
  const dataSize = samples * channels * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

describe("isLikelyWav", () => {
  it("detects RIFF/WAVE", () => {
    expect(isLikelyWav(makeWav(8000, 80))).toBe(true);
    expect(isLikelyWav(Buffer.from("not wav"))).toBe(false);
  });
});

describe("convertWavToAsterisk8k", () => {
  it("leaves 8k mono unchanged", () => {
    const src = makeWav(8000, 80);
    expect(convertWavToAsterisk8k(src).equals(src)).toBe(true);
  });

  it("resamples 16k to 8k", () => {
    const src = makeWav(16000, 160);
    const out = convertWavToAsterisk8k(src);
    expect(isLikelyWav(out)).toBe(true);
    expect(out.readUInt32LE(24)).toBe(8000);
    expect(out.readUInt16LE(22)).toBe(1);
  });
});

describe("extFromUpload", () => {
  it("prefers filename then mime then magic", () => {
    expect(extFromUpload("a.wav")).toBe("wav");
    expect(extFromUpload(undefined, "audio/wav")).toBe("wav");
    expect(extFromUpload(undefined, undefined, makeWav(8000, 8))).toBe("wav");
  });
});

describe("convertWavToAsterisk8k with a corrupt header", () => {
  it("clamps a truncated data chunk instead of reading past the buffer", () => {
    // Upload cut short: the header claims 320 bytes of data, the buffer has 12.
    // repairWavHeader clamps the same lie for recordings; this path must not
    // throw RangeError on admin prompt uploads.
    const src = makeWav(16000, 160);
    const truncated = src.subarray(0, 44 + 12);
    let out: Buffer;
    expect(() => {
      out = convertWavToAsterisk8k(truncated);
    }).not.toThrow();
    expect(isLikelyWav(out!)).toBe(true);
    expect(out!.readUInt32LE(24)).toBe(8000);
  });

  it("returns the buffer unchanged for a degenerate zero-channel header", () => {
    const src = makeWav(16000, 160);
    src.writeUInt16LE(0, 22); // fmt channels = 0
    let out: Buffer;
    expect(() => {
      out = convertWavToAsterisk8k(src);
    }).not.toThrow();
    expect(out!.equals(src)).toBe(true);
  });
});
