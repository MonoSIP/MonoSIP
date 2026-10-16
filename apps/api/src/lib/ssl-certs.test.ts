import { describe, expect, it } from "vitest";
import { needsRenewal, readCertExpiry, RENEW_WITHIN_DAYS } from "./ssl-policy.js";

describe("needsRenewal", () => {
  it("renews when there is no cert", () => {
    expect(needsRenewal(null)).toBe(true);
  });

  it("renews when expiry is within the window", () => {
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    expect(needsRenewal(soon, RENEW_WITHIN_DAYS)).toBe(true);
  });

  it("skips when expiry is far away", () => {
    const later = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    expect(needsRenewal(later, RENEW_WITHIN_DAYS)).toBe(false);
  });
});

describe("readCertExpiry", () => {
  it("returns null for garbage PEM", () => {
    expect(readCertExpiry("not-a-cert")).toBeNull();
  });
});
