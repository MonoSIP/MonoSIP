import type { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { config } from "../config.js";

/** Give up (and let SIP.js reconnect) if Asterisk's /ws never accepts the upstream socket. */
export const UPSTREAM_OPEN_TIMEOUT_MS = 10_000;

/** Counters for /api/v1/admin/system/sip-diag. */
export const proxyStats = {
  active: 0,
  opened: 0,
  upstreamOpened: 0,
  upstreamTimeouts: 0,
  upstreamErrors: 0,
  bufferedFrames: 0,
  clientFrames: 0,
  upstreamFrames: 0,
  lastUpstreamError: "" as string,
};

/**
 * Softphone SIP-over-WebSocket: browser → Fastify /asterisk-ws → Asterisk http.conf /ws.
 * Used on NineDeploy all-in-one (no nginx). Compose still proxies via nginx to asterisk:8088.
 */
export async function asteriskWsProxyRoutes(app: FastifyInstance) {
  const upstreamUrl = () => {
    const base = config.asterisk.ariUrl.replace(/\/$/, "").replace(/^http/i, "ws");
    return `${base}/ws`;
  };

  app.get("/asterisk-ws", { websocket: true }, (client, req) => {
    const rawProto = req.headers["sec-websocket-protocol"];
    const protoStr = Array.isArray(rawProto) ? rawProto.join(",") : rawProto;
    const protocols =
      typeof protoStr === "string"
        ? protoStr
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean)
        : undefined;

    proxyStats.opened++;
    proxyStats.active++;
    let counted = true;
    const release = () => {
      if (counted) {
        counted = false;
        proxyStats.active--;
      }
    };
    let upstream: WebSocket;
    try {
      upstream = new WebSocket(upstreamUrl(), protocols?.length ? protocols : undefined);
    } catch (err) {
      app.log.error({ err }, "asterisk-ws upstream connect failed");
      release();
      try {
        client.close(1011, "upstream unavailable");
      } catch {
        /* ignore */
      }
      return;
    }

    const closeBoth = (code?: number, reason?: string) => {
      release();
      try {
        if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
          client.close(code, reason);
        }
      } catch {
        /* ignore */
      }
      try {
        if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
          upstream.close();
        }
      } catch {
        /* ignore */
      }
    };

    // The browser socket is open before the upstream one: SIP.js sends REGISTER at
    // once, and SIP over WebSocket never retransmits — dropping it leaves the
    // softphone stuck on "Connecting". Hold early frames and flush them in order.
    const pending: Array<{ data: WebSocket.RawData; isBinary: boolean }> = [];
    const openTimer = setTimeout(() => {
      if (upstream.readyState !== WebSocket.OPEN) {
        app.log.warn("asterisk-ws upstream open timed out");
        proxyStats.upstreamTimeouts++;
        closeBoth(1011, "upstream timeout");
      }
    }, UPSTREAM_OPEN_TIMEOUT_MS);

    upstream.on("open", () => {
      clearTimeout(openTimer);
      proxyStats.upstreamOpened++;
      app.log.info("asterisk-ws proxy upstream open");
      try {
        for (const m of pending.splice(0)) upstream.send(m.data, { binary: m.isBinary });
      } catch {
        closeBoth();
      }
    });

    upstream.on("message", (data, isBinary) => {
      proxyStats.upstreamFrames++;
      if (client.readyState !== WebSocket.OPEN) return;
      try {
        client.send(data, { binary: isBinary });
      } catch {
        closeBoth();
      }
    });

    upstream.on("close", () => {
      clearTimeout(openTimer);
      closeBoth();
    });
    upstream.on("error", (err) => {
      app.log.warn({ err }, "asterisk-ws upstream error");
      proxyStats.upstreamErrors++;
      proxyStats.lastUpstreamError = `${new Date().toISOString()} ${err.message}`;
      closeBoth(1011, "upstream error");
    });

    client.on("message", (data, isBinary) => {
      proxyStats.clientFrames++;
      if (upstream.readyState === WebSocket.CONNECTING) {
        proxyStats.bufferedFrames++;
        pending.push({ data, isBinary });
        return;
      }
      if (upstream.readyState !== WebSocket.OPEN) return;
      try {
        upstream.send(data, { binary: isBinary });
      } catch {
        closeBoth();
      }
    });

    client.on("close", () => {
      clearTimeout(openTimer);
      closeBoth();
    });
    client.on("error", () => closeBoth());
  });
}
