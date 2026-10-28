import { describe, expect, it } from "vitest";
import {
  QUEUE_POSITION_SAY_LIMIT,
  queueAnnounceLanguage,
  queueLanguage,
  queueSoundLanguage,
  queueVoiceLanguages,
} from "./queue-lang.js";

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

describe("queueAnnounceLanguage", () => {
  it("uses a queue-only language so say_number plays the position sentence", () => {
    expect(queueAnnounceLanguage("tr", null)).toBe("tr_ann");
    expect(queueAnnounceLanguage("tr", "female")).toBe("tr_ann");
    expect(queueAnnounceLanguage("tr", "male")).toBe("tr_male_ann");
    expect(queueAnnounceLanguage("tr", "ema-lightning")).toBe("tr_ema_ann");
    expect(queueAnnounceLanguage("en", "male")).toBe("en_male_ann");
    expect(queueAnnounceLanguage("en", "ema-lightning")).toBe("en_ann");
    expect(QUEUE_POSITION_SAY_LIMIT).toBe(20);
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
