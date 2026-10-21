import { beforeEach, describe, expect, it, vi } from "vitest";

const log: string[] = [];

vi.mock("./ari.js", () => ({
  ari: {
    playAndWait: vi.fn(async (_ch: string, media: string) => {
      log.push(`play:${media}`);
      return true;
    }),
    playCollectDtmf: vi.fn(async (_ch: string, media: string) => {
      log.push(`collect:${media}`);
      return "1";
    }),
    waitDtmf: vi.fn(async () => "2"),
    hasBufferedDtmf: vi.fn(() => false),
    clearDtmfBuffer: vi.fn(),
  },
}));

vi.mock("../lib/tts.js", () => ({
  ensureSpeechMedia: vi.fn(async (text: string) => {
    log.push(`synth:${text}`);
    return { media: `m:${text}`, cached: false, ms: 1 };
  }),
}));

import { ari } from "./ari.js";
import { speakChunked, speakThenCollectDigit, splitSpeech } from "./speech.js";

beforeEach(() => {
  vi.clearAllMocks();
  log.length = 0;
  vi.mocked(ari.hasBufferedDtmf).mockReturnValue(false);
});

describe("splitSpeech", () => {
  it("splits at sentence ends but never inside decimals or codes", () => {
    const chunks = splitSpeech(
      "Altın satış fiyatları. Gram altın 6.568,24 lira. Çeyrek altın 10.810,32 lira. Adres NO:34/B tamam.",
    );
    expect(chunks.join(" ")).toContain("6.568,24");
    expect(chunks.join(" ")).toContain("10.810,32");
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c).not.toMatch(/^\d|^,/);
  });

  it("merges tiny fragments like abbreviations into a neighbour", () => {
    const chunks = splitSpeech("BEYAZIT MAH. NURETTİN CANKURTARAN CAD. NO:34/B. Telefon: 0 3 1 2.");
    expect(chunks.every((c) => c.length >= 28 || chunks.length === 1)).toBe(true);
    expect(chunks.join(" ")).toBe("BEYAZIT MAH. NURETTİN CANKURTARAN CAD. NO:34/B. Telefon: 0 3 1 2.");
  });

  it("keeps the first chunk short and splits long sentences at commas", () => {
    const long =
      "Nöbetçi eczane için 1, akaryakıt fiyatları için 2, hava durumu için 3, döviz kurları için 4, " +
      "altın fiyatları için 5, Borsa İstanbul için 6. Çıkmak için sıfıra basın.";
    const chunks = splitSpeech(long);
    expect(chunks[0]!.length).toBeLessThanOrEqual(90);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.join(" ")).toBe(long);
  });

  it("returns a single chunk for short text and nothing for blank", () => {
    expect(splitSpeech("Bilgi hattına hoş geldiniz.")).toEqual(["Bilgi hattına hoş geldiniz."]);
    expect(splitSpeech("   ")).toEqual([]);
  });
});

describe("speakChunked", () => {
  const text = "Birinci cümle burada biraz uzun olsun. İkinci cümle de en az bu kadar uzun. Üçüncü cümle de sonda gelsin.";

  it("synthesizes the next chunk while the current one is playing", async () => {
    // playback takes a moment, like real audio
    vi.mocked(ari.playAndWait).mockImplementation(async (_c: string, media: string) => {
      log.push(`play:${media}`);
      await new Promise((r) => setTimeout(r, 5));
      log.push(`played:${media}`);
      return true;
    });
    const r = await speakChunked("ch", text, "tr", "ema-lightning");
    expect(r).toMatchObject({ played: true, interrupted: false, chunks: 3 });
    const [c1, c2, c3] = splitSpeech(text);
    const at = (e: string) => log.indexOf(e);
    // chunk n+1 is being synthesized before chunk n has finished playing
    expect(at(`synth:${c2}`)).toBeLessThan(at(`played:m:${c1}`));
    expect(at(`synth:${c3}`)).toBeLessThan(at(`played:m:${c2}`));
    // and playback order is preserved
    expect(at(`play:m:${c1}`)).toBeLessThan(at(`play:m:${c2}`));
    expect(at(`play:m:${c2}`)).toBeLessThan(at(`play:m:${c3}`));
  });

  it("stops after a key press when interruptible", async () => {
    vi.mocked(ari.playAndWait).mockImplementationOnce(async (_c: string, media: string) => {
      log.push(`play:${media}`);
      vi.mocked(ari.hasBufferedDtmf).mockReturnValue(true);
      return true;
    });
    const r = await speakChunked("ch", text, "tr", "ema-lightning", { interruptible: true });
    expect(r.interrupted).toBe(true);
    expect(log.filter((l) => l.startsWith("play:"))).toHaveLength(1);
    expect(vi.mocked(ari.playAndWait).mock.calls[0]![3]).toEqual({ interruptible: true });
  });

  it("stops when playback fails (caller gone) instead of spinning through chunks", async () => {
    vi.mocked(ari.playAndWait).mockResolvedValueOnce(false);
    const r = await speakChunked("ch", text, "tr", "ema-lightning");
    expect(r.played).toBe(false);
    expect(vi.mocked(ari.playAndWait).mock.calls.filter((c) => !String(c[1]).includes("beep"))).toHaveLength(1);
  });
});

describe("speakThenCollectDigit", () => {
  const prompt =
    "Nöbetçi eczane için 1, akaryakıt fiyatları için 2, hava durumu için 3, döviz kurları için 4. Çıkmak için sıfıra basın.";

  it("plays earlier chunks interruptibly and collects on the last one", async () => {
    const d = await speakThenCollectDigit("ch", prompt, "tr", "ema-lightning", 9000);
    expect(d).toBe("1");
    const plays = log.filter((l) => /^(play|collect):/.test(l));
    expect(plays.at(-1)).toMatch(/^collect:/);
    expect(plays.slice(0, -1).every((p) => p.startsWith("play:"))).toBe(true);
  });

  it("returns the buffered digit without playing the rest when the caller pressed early", async () => {
    vi.mocked(ari.hasBufferedDtmf).mockReturnValue(true);
    const d = await speakThenCollectDigit("ch", prompt, "tr", "ema-lightning", 9000);
    expect(d).toBe("2");
    expect(log.some((l) => /^(play|collect):/.test(l))).toBe(false);
  });
});
