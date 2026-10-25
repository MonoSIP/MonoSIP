import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("accumulates failures when the caller checks before each attempt", () => {
    // The login routes call isIpBanned() before every attempt and only then
    // record the failure. The count has to survive that interleaved check,
    // otherwise the counter resets on each request and nothing is ever banned.
    clearLoginFailures("10.9.9.3");
    const counts: number[] = [];
    for (let i = 0; i < 3; i++) {
      expect(isIpBanned("10.9.9.3", 3)).toBe(false);
      counts.push(recordLoginFailure("10.9.9.3", { maxRetry: 3, banMinutes: 15 }).count);
    }
    expect(counts).toEqual([1, 2, 3]);
    expect(isIpBanned("10.9.9.3", 3)).toBe(true);
    clearLoginFailures("10.9.9.3");
  });

  it("expires a record once its window has passed", () => {
    vi.useFakeTimers();
    try {
      clearLoginFailures("10.9.9.4");
      for (let i = 0; i < 3; i++) {
        recordLoginFailure("10.9.9.4", { maxRetry: 3, banMinutes: 1 });
      }
      expect(isIpBanned("10.9.9.4", 3)).toBe(true);
      // The window is one minute; once it elapses the record is forgotten.
      vi.setSystemTime(Date.now() + 61_000);
      expect(isIpBanned("10.9.9.4", 3)).toBe(false);
      clearLoginFailures("10.9.9.4");
    } finally {
      vi.useRealTimers();
    }
  });
});
