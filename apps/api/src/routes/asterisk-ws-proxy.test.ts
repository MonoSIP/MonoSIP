import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { AddressInfo } from "node:net";
import WebSocket, { WebSocketServer } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { config } from "../config.js";
import { asteriskWsProxyRoutes } from "./asterisk-ws-proxy.js";

/** Fake Asterisk /ws that finishes the upstream handshake only after `delayMs`. */
async function slowAsterisk(delayMs: number) {
  const received: string[] = [];
  const wss = new WebSocketServer({
    port: 0,
    host: "127.0.0.1",
    handleProtocols: (protocols) => (protocols.has("sip") ? "sip" : false),
    verifyClient: (_info, done) => setTimeout(() => done(true), delayMs),
  });
  await new Promise<void>((r) => wss.once("listening", () => r()));
  wss.on("connection", (ws) => {
    ws.on("message", (d) => {
      received.push(String(d));
      ws.send(`SIP/2.0 401 Unauthorized (for ${String(d)})`);
    });
  });
  return { wss, received, port: (wss.address() as AddressInfo).port };
}

let app: FastifyInstance | undefined;
let asterisk: Awaited<ReturnType<typeof slowAsterisk>> | undefined;
const savedAri = config.asterisk.ariUrl;

afterEach(async () => {
  await app?.close();
  await new Promise<void>((r) => (asterisk ? asterisk.wss.close(() => r()) : r()));
  config.asterisk.ariUrl = savedAri;
  app = undefined;
  asterisk = undefined;
});

describe("asterisk-ws proxy", () => {
  it("delivers a REGISTER sent before the upstream socket has opened", async () => {
    asterisk = await slowAsterisk(300);
    config.asterisk.ariUrl = `http://127.0.0.1:${asterisk.port}`;
    app = Fastify();
    await app.register(websocket);
    await app.register(asteriskWsProxyRoutes);
    await app.listen({ port: 0, host: "127.0.0.1" });
    const port = (app.server.address() as AddressInfo).port;

    const client = new WebSocket(`ws://127.0.0.1:${port}/asterisk-ws`, "sip");
    const reply = new Promise<string>((resolve, reject) => {
      client.once("message", (d) => resolve(String(d)));
      client.once("error", reject);
      setTimeout(() => reject(new Error("no SIP response — REGISTER was dropped")), 3000);
    });
    // SIP.js sends REGISTER the moment its own socket opens.
    client.once("open", () => {
      client.send("REGISTER sip:monosip SIP/2.0");
      client.send("OPTIONS sip:monosip SIP/2.0");
    });

    expect(await reply).toContain("REGISTER");
    await expect.poll(() => asterisk!.received).toEqual([
      "REGISTER sip:monosip SIP/2.0",
      "OPTIONS sip:monosip SIP/2.0",
    ]);
    client.close();
  });
});
