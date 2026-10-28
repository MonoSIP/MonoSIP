import { describe, expect, it } from "vitest";
import { hashToken } from "./crypto.js";
import { authBlocked, clearAuthFailure, keyExpired, noteAuthFailure, verifyBarrier } from "./api-key-auth.js";

describe("api key barrier", () => {
  it("accepts the matching barrier and rejects a missing or wrong one", () => {
    const hash = hashToken("barrier-secret");
    expect(verifyBarrier("barrier-secret", hash)).toBe(true);
    expect(verifyBarrier("other", hash)).toBe(false);
    expect(verifyBarrier(undefined, hash)).toBe(false);
    expect(verifyBarrier("barrier-secret", null)).toBe(false);
  });

  it("treats a past expiry as closed and an empty expiry as open", () => {
    expect(keyExpired(null, new Date("2026-10-28T12:00:00Z"))).toBe(false);
    expect(keyExpired(new Date("2026-10-28T12:00:00Z"), new Date("2026-10-28T12:00:00Z"))).toBe(true);
    expect(keyExpired(new Date("2026-10-28T12:00:01Z"), new Date("2026-10-28T12:00:00Z"))).toBe(false);
  });

  it("blocks an address after repeated failures and clears on success", () => {
    const ip = "203.0.113.10";
    clearAuthFailure(ip);
    const start = 1_700_000_000_000;
    for (let i = 0; i < 19; i += 1) noteAuthFailure(ip, start);
    expect(authBlocked(ip, start + 1)).toBe(false);
    noteAuthFailure(ip, start + 1);
    expect(authBlocked(ip, start + 2)).toBe(true);
    expect(authBlocked(ip, start + 60_000)).toBe(false);
    noteAuthFailure(ip, start + 2);
    clearAuthFailure(ip);
    expect(authBlocked(ip, start + 3)).toBe(false);
  });
});
