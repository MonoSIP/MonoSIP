import { afterEach, describe, expect, it } from "vitest";
import { clearUpdateCheckCache, compareSemver, getUpdateStatus } from "./update-check.js";

describe("compareSemver", () => {
  it("orders dotted versions", () => {
    expect(compareSemver("1.8.0", "1.8.0")).toBe(0);
    expect(compareSemver("1.9.1", "1.9.2")).toBe(-1);
    expect(compareSemver("1.9.0", "1.8.9")).toBe(1);
    expect(compareSemver("v2.0.0", "1.9.9")).toBe(1);
  });
});

describe("getUpdateStatus preview", () => {
  afterEach(() => {
    delete process.env.MONOSIP_UPDATE_PREVIEW;
    clearUpdateCheckCache();
  });

  it("reports a patch bump when MONOSIP_UPDATE_PREVIEW=1", async () => {
    process.env.MONOSIP_UPDATE_PREVIEW = "1";
    const status = await getUpdateStatus();
    expect(status.updateAvailable).toBe(true);
    expect(compareSemver(status.latest, status.current)).toBe(1);
    expect(status.releaseUrl).toContain(`/releases/tag/v${status.latest}`);
  });
});
