import { describe, expect, it } from "vitest";
import { queueLanguage } from "./queue-lang.js";

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
