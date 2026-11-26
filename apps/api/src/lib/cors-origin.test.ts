import { describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  config: {
    publicHost: "pbx.example.com",
    publicUrl: "https://pbx.example.com",
    sipDomain: "pbx.example.com",
  },
}));

const { isAllowedCorsOrigin } = await import("./cors-origin.js");

describe("isAllowedCorsOrigin", () => {
  it("allows a missing Origin (same-origin / curl / native app)", () => {
    expect(isAllowedCorsOrigin(undefined)).toBe(true);
    expect(isAllowedCorsOrigin("")).toBe(true);
  });

  it("allows the configured public host", () => {
    expect(isAllowedCorsOrigin("https://pbx.example.com")).toBe(true);
    expect(isAllowedCorsOrigin("http://pbx.example.com:8080")).toBe(true);
  });

  it("allows loopback and RFC-1918 LAN origins", () => {
    expect(isAllowedCorsOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedCorsOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isAllowedCorsOrigin("http://10.4.4.250")).toBe(true);
    expect(isAllowedCorsOrigin("http://192.168.1.20")).toBe(true);
    expect(isAllowedCorsOrigin("http://172.16.0.9")).toBe(true);
  });

  it("rejects an arbitrary foreign origin", () => {
    expect(isAllowedCorsOrigin("https://evil.example")).toBe(false);
    expect(isAllowedCorsOrigin("https://pbx.example.com.evil.io")).toBe(false);
    expect(isAllowedCorsOrigin("http://8.8.8.8")).toBe(false);
  });

  it("rejects an unparseable origin", () => {
    expect(isAllowedCorsOrigin("not a url")).toBe(false);
  });
});
