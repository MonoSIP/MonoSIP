import { describe, expect, it } from "vitest";
import { ipAllowed } from "./ip-allowlist.js";

describe("ipAllowed", () => {
  it("allows all when list empty", () => {
    expect(ipAllowed("1.2.3.4", [])).toBe(true);
  });

  it("matches exact and mapped IPv4", () => {
    expect(ipAllowed("10.0.0.5", ["10.0.0.5"])).toBe(true);
    expect(ipAllowed("::ffff:10.0.0.5", ["10.0.0.5"])).toBe(true);
    expect(ipAllowed("10.0.0.6", ["10.0.0.5"])).toBe(false);
  });

  it("matches CIDR", () => {
    expect(ipAllowed("192.168.1.50", ["192.168.1.0/24"])).toBe(true);
    expect(ipAllowed("192.168.2.50", ["192.168.1.0/24"])).toBe(false);
    expect(ipAllowed("8.8.8.8", ["0.0.0.0/0"])).toBe(true);
  });
});
