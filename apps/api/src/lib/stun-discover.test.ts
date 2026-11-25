import { describe, expect, it } from "vitest";
import {
  DEFAULT_STUN_SERVERS,
  isPrivateOrLocalIpv4,
  normalizeStunServerList,
  parseStunHostPort,
  parseStunMappedIpv4,
} from "./stun-discover.js";

describe("parseStunHostPort", () => {
  it("parses host:port", () => {
    expect(parseStunHostPort("stun.l.google.com:19302")).toEqual({
      host: "stun.l.google.com",
      port: 19302,
    });
  });

  it("strips stun: prefix and defaults port", () => {
    expect(parseStunHostPort("stun:stun.cloudflare.com")).toEqual({
      host: "stun.cloudflare.com",
      port: 3478,
    });
  });

  it("rejects empty", () => {
    expect(parseStunHostPort("  ")).toBeNull();
  });
});

describe("isPrivateOrLocalIpv4", () => {
  it("flags RFC1918, loopback, CGNAT", () => {
    expect(isPrivateOrLocalIpv4("10.6.6.9")).toBe(true);
    expect(isPrivateOrLocalIpv4("192.168.1.1")).toBe(true);
    expect(isPrivateOrLocalIpv4("172.27.0.3")).toBe(true);
    expect(isPrivateOrLocalIpv4("127.0.0.1")).toBe(true);
    expect(isPrivateOrLocalIpv4("100.64.1.2")).toBe(true);
  });

  it("allows public", () => {
    expect(isPrivateOrLocalIpv4("203.0.113.10")).toBe(false);
    expect(isPrivateOrLocalIpv4("8.8.8.8")).toBe(false);
  });
});

describe("normalizeStunServerList", () => {
  it("defaults when empty", () => {
    expect(normalizeStunServerList([])).toEqual([...DEFAULT_STUN_SERVERS]);
    expect(normalizeStunServerList(null)).toEqual([...DEFAULT_STUN_SERVERS]);
  });

  it("normalizes stun: and dedupes", () => {
    expect(
      normalizeStunServerList(["stun:a.example:3478", "a.example:3478", "b.example"]),
    ).toEqual(["a.example:3478", "b.example:3478"]);
  });
});

describe("parseStunMappedIpv4", () => {
  it("decodes XOR-MAPPED-ADDRESS IPv4", () => {
    const MAGIC = 0x2112a442;
    const txId = Buffer.alloc(12, 0xab);
    const msg = Buffer.alloc(32);
    msg.writeUInt16BE(0x0101, 0); // Binding Success
    msg.writeUInt16BE(12, 2); // attr length
    msg.writeUInt32BE(MAGIC, 4);
    txId.copy(msg, 8);
    msg.writeUInt16BE(0x0020, 20); // XOR-MAPPED
    msg.writeUInt16BE(8, 22);
    msg[24] = 0;
    msg[25] = 0x01; // IPv4
    msg.writeUInt16BE(0, 26); // x-port unused
    // 203.0.113.10 XOR magic bytes
    msg[28] = 203 ^ ((MAGIC >>> 24) & 0xff);
    msg[29] = 0 ^ ((MAGIC >>> 16) & 0xff);
    msg[30] = 113 ^ ((MAGIC >>> 8) & 0xff);
    msg[31] = 10 ^ (MAGIC & 0xff);
    expect(parseStunMappedIpv4(msg, txId)).toBe("203.0.113.10");
  });
});
