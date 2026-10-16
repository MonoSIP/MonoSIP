import { afterEach, describe, expect, it } from "vitest";
import { clearLoginFailures, isIpBanned, recordLoginFailure } from "./login-guard.js";

describe("login-guard", () => {
  afterEach(() => {
    clearLoginFailures("10.9.9.1");
  });

  it("does not ban before threshold", () => {
    expect(isIpBanned("10.9.9.1", 5)).toBe(false);
    recordLoginFailure("10.9.9.1", { maxRetry: 5, banMinutes: 1 });
    recordLoginFailure("10.9.9.1", { maxRetry: 5, banMinutes: 1 });
    expect(isIpBanned("10.9.9.1", 5)).toBe(false);
  });

  it("bans after enough failures", () => {
    for (let i = 0; i < 5; i++) {
      recordLoginFailure("10.9.9.1", { maxRetry: 5, banMinutes: 1 });
    }
    expect(isIpBanned("10.9.9.1", 5)).toBe(true);
    clearLoginFailures("10.9.9.1");
    expect(isIpBanned("10.9.9.1", 5)).toBe(false);
  });
});
