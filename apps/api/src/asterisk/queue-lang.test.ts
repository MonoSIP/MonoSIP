import { describe, expect, it } from "vitest";
import { queueLanguage, queueSoundLanguage, queueVoiceLanguages } from "./queue-lang.js";

describe("queueLanguage", () => {
  it("uses the queue's language when set", () => {
    expect(queueLanguage("tr", "en")).toBe("tr");
    expect(queueLanguage("en", "tr")).toBe("en");
  });

  it("falls back to the system default when unset or unknown", () => {
    expect(queueLanguage(null, "tr")).toBe("tr");
    expect(queueLanguage(undefined, "en")).toBe("en");
    expect(queueLanguage("de", "en")).toBe("en");
  });
});

describe("queueSoundLanguage", () => {
  it("maps a voice to its Asterisk language variant", () => {
    expect(queueSoundLanguage("tr", "ema-lightning")).toBe("tr_ema");
    expect(queueSoundLanguage("tr", "male")).toBe("tr_male");
  });

  it("keeps the base language for the default voice or a voice the language lacks", () => {
    expect(queueSoundLanguage("tr", null)).toBe("tr");
    expect(queueSoundLanguage("tr", "female")).toBe("tr");
    expect(queueSoundLanguage("en", "ema-lightning")).toBe("en");
    expect(queueSoundLanguage("tr", "kokoro")).toBe("tr");
  });
});

describe("queueVoiceLanguages", () => {
  it("lists the packs a queue needs", () => {
    expect(queueVoiceLanguages("tr", "ema-lightning")).toEqual(["tr"]);
    expect(queueVoiceLanguages(null, "male")).toEqual(["tr", "en"]);
    // kokoro (removed model) falls back to the base pack
    expect(queueVoiceLanguages(null, "kokoro")).toEqual([]);
    expect(queueSoundLanguage("en", "kokoro")).toBe("en");
    expect(queueVoiceLanguages("en", "ema-lightning")).toEqual([]);
    expect(queueVoiceLanguages("tr", null)).toEqual([]);
    expect(queueVoiceLanguages("tr", "female")).toEqual([]);
  });
});
