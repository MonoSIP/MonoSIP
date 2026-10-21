import { beforeEach, describe, expect, it, vi } from "vitest";

describe("legacy storage keys", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("moves dsip_* preferences to the munasip_* keys once", async () => {
    localStorage.setItem("dsip_locale", "tr");
    localStorage.setItem("dsip_theme", "light");
    await import("./legacy-storage");
    expect(localStorage.getItem("munasip_locale")).toBe("tr");
    expect(localStorage.getItem("munasip_theme")).toBe("light");
    expect(localStorage.getItem("dsip_locale")).toBeNull();
  });

  it("never overwrites a value already saved under the new key", async () => {
    localStorage.setItem("dsip_locale", "tr");
    localStorage.setItem("munasip_locale", "en");
    await import("./legacy-storage");
    expect(localStorage.getItem("munasip_locale")).toBe("en");
  });
});
