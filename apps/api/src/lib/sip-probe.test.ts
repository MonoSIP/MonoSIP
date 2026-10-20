import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { probeAsteriskSipWs } from "./sip-probe.js";

let wss: WebSocketServer | undefined;

afterEach(async () => {
  await new Promise<void>((r) => (wss ? wss.close(() => r()) : r()));
  wss = undefined;
});

async function fakeAsterisk(answer: boolean) {
  wss = new WebSocketServer({ port: 0, host: "127.0.0.1", handleProtocols: () => "sip" });
  await new Promise<void>((r) => wss!.once("listening", () => r()));
  wss.on("connection", (ws) => {
    ws.on("message", (d) => {
      if (answer && String(d).startsWith("OPTIONS")) ws.send("SIP/2.0 200 OK\r\n\r\n");
    });
  });
  return `http://127.0.0.1:${(wss.address() as AddressInfo).port}`;
}

describe("probeAsteriskSipWs", () => {
  it("reports the SIP response line from a healthy stack", async () => {
    const r = await probeAsteriskSipWs(await fakeAsterisk(true));
    expect(r.error).toBeNull();
    expect(r.firstLine).toBe("SIP/2.0 200 OK");
    expect(r.responseMs).not.toBeNull();
  });

  it("flags a stack that accepts the socket but never answers", async () => {
    const r = await probeAsteriskSipWs(await fakeAsterisk(false), 300);
    expect(r.openMs).not.toBeNull();
    expect(r.error).toBe("no SIP response");
  });
});
