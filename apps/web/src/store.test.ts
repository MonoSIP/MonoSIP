import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The SPA must boot with blocked storage: store.ts reads localStorage at module
// scope and main.tsx imports it before anything renders, so a throw here
// white-screens the whole app. legacy-storage.ts already treats blocked storage
// ("private mode") as a supported condition; store.ts must degrade the same way.
describe("store with blocked localStorage", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.classList.remove("light");
  });

  it("still loads when reading the saved theme throws", async () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const { useStore } = await import("./store");
    expect(useStore.getState().theme).toBe("dark");
  });

  it("keeps switching the theme when persisting throws", async () => {
    const { useStore } = await import("./store");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(() => useStore.getState().setTheme("light")).not.toThrow();
    expect(useStore.getState().theme).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("persists and applies an unblocked theme switch (control)", async () => {
    const { useStore } = await import("./store");
    useStore.getState().setTheme("light");
    expect(useStore.getState().theme).toBe("light");
    expect(window.localStorage.getItem("monosip_theme")).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });
});
