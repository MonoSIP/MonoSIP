import { describe, expect, it } from "vitest";
import { originAllowed } from "./origin-allow.js";

describe("originAllowed", () => {
  it("allows any origin when the list is empty (lab default)", () => {
    expect(originAllowed([], "https://evil.example")).toBe(true);
    expect(originAllowed(undefined, "https://evil.example")).toBe(true);
  });

  it("rejects a missing or unparseable Origin header", () => {
    expect(originAllowed(["shop.example.com"], undefined)).toBe(false);
    expect(originAllowed(["shop.example.com"], "not a url")).toBe(false);
  });

  it("matches an exact host", () => {
    expect(originAllowed(["shop.example.com"], "https://shop.example.com")).toBe(true);
    expect(originAllowed(["shop.example.com"], "https://other.example.com")).toBe(false);
  });

  it("does not match a host that merely contains the rule", () => {
    // The bypass this replaces: a substring test let any attacker host that
    // embedded the allowed string satisfy the rule.
    expect(originAllowed(["shop.example.com"], "https://shop.example.com.evil.io")).toBe(false);
    expect(originAllowed(["example.com"], "https://notexample.com")).toBe(false);
    expect(originAllowed(["example.com"], "https://example.com.evil.io")).toBe(false);
    expect(originAllowed(["shop.example.com"], "https://evil.io/shop.example.com")).toBe(false);
  });

  it("matches a wildcard host on a dot boundary", () => {
    expect(originAllowed(["*.example.com"], "https://shop.example.com")).toBe(true);
    expect(originAllowed(["*.example.com"], "https://a.b.example.com")).toBe(true);
    expect(originAllowed(["*.example.com"], "https://example.com")).toBe(true);
    expect(originAllowed(["*.example.com"], "https://notexample.com")).toBe(false);
    expect(originAllowed(["*.example.com"], "https://example.com.evil.io")).toBe(false);
  });

  it("matches a full origin rule on scheme and port too", () => {
    expect(originAllowed(["https://shop.example.com"], "https://shop.example.com")).toBe(true);
    expect(originAllowed(["https://shop.example.com"], "http://shop.example.com")).toBe(false);
    expect(originAllowed(["https://shop.example.com:8443"], "https://shop.example.com:8443")).toBe(
      true,
    );
    expect(originAllowed(["https://shop.example.com:8443"], "https://shop.example.com")).toBe(false);
  });

  it("ignores blank rules", () => {
    expect(originAllowed(["", "   "], "https://shop.example.com")).toBe(false);
  });
});
