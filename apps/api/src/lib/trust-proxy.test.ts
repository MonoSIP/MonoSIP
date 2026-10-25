import { describe, expect, it } from "vitest";
import { createTrustProxy, parseTrustedProxies } from "./trust-proxy.js";

describe("parseTrustedProxies", () => {
  it("accepts addresses and CIDRs", () => {
    expect(() => parseTrustedProxies(["10.0.0.1", "172.16.0.0/12", "::1"])).not.toThrow();
  });

  it("rejects a malformed entry instead of silently trusting nothing", () => {
    // A typo in the list must fail at boot rather than quietly disable the
    // proxy boundary or, worse, widen it.
    expect(() => parseTrustedProxies(["not-an-ip"])).toThrow(/Invalid trusted proxy/);
    expect(() => parseTrustedProxies(["10.0.0.0/33"])).toThrow(/Invalid trusted proxy/);
    expect(() => parseTrustedProxies(["10.0.0.0/abc"])).toThrow(/Invalid trusted proxy/);
    expect(() => parseTrustedProxies(["fd00::/129"])).toThrow(/Invalid trusted proxy/);
  });

  it("ignores blank entries", () => {
    expect(() => parseTrustedProxies(["", "  ", "127.0.0.1"])).not.toThrow();
  });
});

describe("createTrustProxy", () => {
  const trust = createTrustProxy(["172.16.0.0/12", "127.0.0.1/32"]);

  it("trusts a listed peer at hop 0 only", () => {
    expect(trust("172.18.0.5", 0)).toBe(true);
    expect(trust("127.0.0.1", 0)).toBe(true);
    // A further hop is a value the proxy passed on, not the peer itself.
    expect(trust("172.18.0.5", 1)).toBe(false);
  });

  it("does not trust a peer outside the list", () => {
    expect(trust("198.51.100.7", 0)).toBe(false);
    expect(trust("203.0.113.50", 0)).toBe(false);
  });

  it("matches an IPv4-mapped IPv6 peer", () => {
    // Docker may hand the API an IPv4-mapped address for the bridge network.
    expect(trust("::ffff:172.18.0.5", 0)).toBe(true);
    expect(trust("::ffff:198.51.100.7", 0)).toBe(false);
  });
});
