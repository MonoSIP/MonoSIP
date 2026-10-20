import { randomBytes } from "node:crypto";
import WebSocket from "ws";

export type SipProbeResult = {
  url: string;
  openMs: number | null;
  responseMs: number | null;
  firstLine: string | null;
  error: string | null;
};

/**
 * Send an out-of-dialog OPTIONS straight to Asterisk's SIP WebSocket (bypassing the
 * browser proxy). Asterisk answers OPTIONS to itself without auth, so silence here
 * means the PJSIP stack is not processing WebSocket traffic at all.
 */
export function probeAsteriskSipWs(ariUrl: string, timeoutMs = 4000): Promise<SipProbeResult> {
  const url = `${ariUrl.replace(/\/$/, "").replace(/^http/i, "ws")}/ws`;
  const started = Date.now();
  const result: SipProbeResult = { url, openMs: null, responseMs: null, firstLine: null, error: null };
  return new Promise((resolve) => {
    let ws: WebSocket;
    const done = (error?: string) => {
      clearTimeout(timer);
      if (error && !result.error) result.error = error;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };
    const timer = setTimeout(
      () => done(result.openMs === null ? "websocket did not open" : "no SIP response"),
      timeoutMs,
    );
    try {
      ws = new WebSocket(url, "sip");
    } catch (e) {
      done((e as Error).message);
      return;
    }
    ws.on("open", () => {
      result.openMs = Date.now() - started;
      const id = randomBytes(6).toString("hex");
      ws.send(
        [
          "OPTIONS sip:127.0.0.1 SIP/2.0",
          `Via: SIP/2.0/WS diag.invalid;branch=z9hG4bK${id}`,
          "Max-Forwards: 70",
          `From: <sip:diag@diag.invalid>;tag=${id}`,
          "To: <sip:127.0.0.1>",
          `Call-ID: diag-${id}`,
          "CSeq: 1 OPTIONS",
          "Contact: <sip:diag@diag.invalid;transport=ws>",
          "Content-Length: 0",
          "",
          "",
        ].join("\r\n"),
      );
    });
    ws.on("message", (data) => {
      result.responseMs = Date.now() - started;
      result.firstLine = String(data).split("\r\n")[0] ?? null;
      done();
    });
    ws.on("error", (err) => done(err.message));
    ws.on("close", (code) => {
      if (result.responseMs === null) done(`closed ${code} before a SIP response`);
    });
  });
}
