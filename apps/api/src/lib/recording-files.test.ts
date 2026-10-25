import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deleteRecordingFile, repairWavHeader, wavDurationSeconds } from "./recording-files.js";

function makeWav(sampleRate: number, samples: number): Buffer {
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe("repairWavHeader", () => {
  it("fills a zero data-chunk size so a browser can play the file", () => {
    const buf = makeWav(8000, 8000);
    buf.writeUInt32LE(0, 40);
    buf.writeUInt32LE(0, 4);
    repairWavHeader(buf);
    const dir = mkdtempSync(path.join(tmpdir(), "vm-"));
    dirs.push(dir);
    const file = path.join(dir, "fixed.wav");
    writeFileSync(file, buf);
    expect(wavDurationSeconds(file)).toBe(1);
  });
});

describe("wavDurationSeconds", () => {
  it("returns 0 for missing / tiny files", () => {
    expect(wavDurationSeconds("/tmp/monosip-no-such-file.wav")).toBe(0);
  });

  it("reads PCM duration", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "monosip-wav-"));
    dirs.push(dir);
    const file = path.join(dir, "t.wav");
    // 8000 samples @ 8kHz = 1s
    writeFileSync(file, makeWav(8000, 8000));
    expect(wavDurationSeconds(file)).toBe(1);
  });

  it("returns 0 for empty data chunk", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "monosip-wav-"));
    dirs.push(dir);
    const file = path.join(dir, "empty.wav");
    writeFileSync(file, makeWav(8000, 0));
    expect(wavDurationSeconds(file)).toBe(0);
  });
});

describe("deleteRecordingFile", () => {
  it("removes existing file without throwing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "monosip-wav-"));
    dirs.push(dir);
    const file = path.join(dir, "x.wav");
    writeFileSync(file, makeWav(8000, 10));
    deleteRecordingFile(file);
    expect(wavDurationSeconds(file)).toBe(0);
  });
});
