import { describe, expect, it } from "vitest";
import { adoptPublicIdentityFromHost, browserWebsocketUrl, clientIsHttps, isInternalHost } from "./public-identity.js";

describe("clientIsHttps", () => {
  it("trusts the forwarded scheme over the socket", () => {
    expect(clientIsHttps({ "x-forwarded-proto": "http" }, "https")).toBe(false);
    expect(clientIsHttps({ "x-forwarded-proto": "https" }, "http")).toBe(true);
  });

  it("uses the first forwarded value", () => {
    expect(clientIsHttps({ "x-forwarded-proto": "https, http" }, "http")).toBe(true);
  });
});

describe("browserWebsocketUrl", () => {
  it("stays on ws when the page is HTTP even if a wss URL is configured", () => {
    expect(browserWebsocketUrl("sip.example", false, "wss://sip.example/asterisk-ws")).toBe(
      "ws://sip.example/asterisk-ws",
    );
  });

  it("keeps a public wss URL when the page is HTTPS", () => {
    expect(browserWebsocketUrl("sip.example", true, "wss://pbx.example/asterisk-ws")).toBe(
      "wss://pbx.example/asterisk-ws",
    );
  });
});

describe("adoptPublicIdentityFromHost", () => {
  it("ignores container and LAN addresses, adopts the first real hostname", async () => {
    const { config } = await import("../config.js");
    const saved = { ...config };
    try {
      Object.assign(config, {
        publicHost: "localhost",
        publicUrl: "https://localhost",
        sipDomain: "localhost",
        sipWssUrl: "wss://localhost/asterisk-ws",
      });
      for (const h of ["172.27.0.3", "172.27.0.3:3000", "10.6.6.9", "192.168.1.5", "monosip", "[::1]:3000"]) {
        adoptPublicIdentityFromHost(h);
        expect(config.sipDomain).toBe("localhost");
      }
      adoptPublicIdentityFromHost("sip.dgn.tr:443");
      expect(config.publicHost).toBe("sip.dgn.tr");
      expect(config.sipDomain).toBe("sip.dgn.tr");
      expect(config.sipWssUrl).toBe("wss://sip.dgn.tr/asterisk-ws");
    } finally {
      Object.assign(config, saved);
    }
  });

  it("classifies hosts", () => {
    expect(isInternalHost("172.31.255.1")).toBe(true);
    expect(isInternalHost("172.32.0.1")).toBe(false);
    expect(isInternalHost("95.130.168.22")).toBe(false);
    expect(isInternalHost("pbx.example.com")).toBe(false);
  });
});
