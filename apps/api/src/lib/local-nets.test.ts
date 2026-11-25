import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_NETS,
  ipv4InCidr,
  normalizeLocalNets,
  parseLocalNetsEnv,
} from "./local-nets.js";

describe("ipv4InCidr", () => {
  it("matches phone LAN and Docker bridge", () => {
    expect(ipv4InCidr("10.6.6.9", "10.0.0.0/8")).toBe(true);
    expect(ipv4InCidr("10.6.6.9", "172.16.0.0/12")).toBe(false);
    expect(ipv4InCidr("172.27.0.3", "172.16.0.0/12")).toBe(true);
  });
});

describe("normalizeLocalNets", () => {
  it("defaults when empty", () => {
    expect(normalizeLocalNets([])).toEqual([...DEFAULT_LOCAL_NETS]);
  });

  it("fixes 127.0.0.1/3 typo", () => {
    expect(normalizeLocalNets(["127.0.0.1/3", "172.16.0.0/12"])).toEqual([
      "127.0.0.0/8",
      "172.16.0.0/12",
    ]);
  });

  it("strips phone LAN that contains EXTERNAL_IP (Docker NAT)", () => {
    expect(
      normalizeLocalNets(
        ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.1/32"],
        "10.6.6.9",
      ),
    ).toEqual(["172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8"]);
  });

  it("keeps LAN when EXTERNAL_IP is public (bare VPS)", () => {
    expect(
      normalizeLocalNets(["10.0.0.0/8", "172.16.0.0/12", "127.0.0.0/8"], "203.0.113.10"),
    ).toEqual(["10.0.0.0/8", "172.16.0.0/12", "127.0.0.0/8"]);
  });
});

describe("parseLocalNetsEnv", () => {
  it("uses Docker-safe default when unset", () => {
    expect(parseLocalNetsEnv(undefined)).toEqual([...DEFAULT_LOCAL_NETS]);
  });
});
