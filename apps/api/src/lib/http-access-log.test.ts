import { describe, expect, it } from "vitest";
import { shouldLogHttpAccess } from "./http-access-log.js";

describe("shouldLogHttpAccess", () => {
  it("skips healthy probes and static assets", () => {
    expect(shouldLogHttpAccess("/api/v1/health", 200)).toBe(false);
    expect(shouldLogHttpAccess("/api/v1/health?x=1", 200)).toBe(false);
    expect(shouldLogHttpAccess("/assets/index-abc.js", 200)).toBe(false);
    expect(shouldLogHttpAccess("/monosip-lockup.svg", 200)).toBe(false);
    expect(shouldLogHttpAccess("/", 200)).toBe(false);
  });

  it("keeps API traffic and failures", () => {
    expect(shouldLogHttpAccess("/api/v1/auth/me", 200)).toBe(true);
    expect(shouldLogHttpAccess("/api/v1/admin/cdr", 200)).toBe(true);
    expect(shouldLogHttpAccess("/api/v1/health", 503)).toBe(true);
    expect(shouldLogHttpAccess("/assets/missing.js", 404)).toBe(true);
  });
});
