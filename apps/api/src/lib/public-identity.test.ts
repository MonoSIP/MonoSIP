import { describe, expect, it } from "vitest";
import { browserWebsocketUrl, clientIsHttps } from "./public-identity.js";

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
