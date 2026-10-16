import { describe, expect, it } from "vitest";
import { audioContentType, audioFilename } from "./audio-mime.js";

describe("audioContentType", () => {
  it("maps extensions", () => {
    expect(audioContentType("/a/b.wav")).toBe("audio/wav");
    expect(audioContentType("/a/b.ogg")).toBe("audio/ogg");
    expect(audioContentType("/a/b.mp3")).toBe("audio/mpeg");
    expect(audioContentType("/a/b.bin")).toBe("application/octet-stream");
  });
});

describe("audioFilename", () => {
  it("keeps id and extension", () => {
    expect(audioFilename("rec1", "/data/x.wav")).toBe("rec1.wav");
  });
});
