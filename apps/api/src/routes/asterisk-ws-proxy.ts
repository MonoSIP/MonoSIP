import type { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { config } from "../config.js";

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

    let upstream: WebSocket;
    try {
      upstream = new WebSocket(upstreamUrl(), protocols?.length ? protocols : undefined);
    } catch (err) {
      app.log.error({ err }, "asterisk-ws upstream connect failed");
      try {
        client.close(1011, "upstream unavailable");
      } catch {
        /* ignore */
      }
      return;
    }

    const closeBoth = (code?: number, reason?: string) => {
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

    upstream.on("open", () => {
      app.log.info("asterisk-ws proxy upstream open");
    });

    upstream.on("message", (data, isBinary) => {
      if (client.readyState !== WebSocket.OPEN) return;
      try {
        client.send(data, { binary: isBinary });
      } catch {
        closeBoth();
      }
    });

    upstream.on("close", () => closeBoth());
    upstream.on("error", (err) => {
      app.log.warn({ err }, "asterisk-ws upstream error");
      closeBoth(1011, "upstream error");
    });

    client.on("message", (data, isBinary) => {
      if (upstream.readyState !== WebSocket.OPEN) return;
      try {
        upstream.send(data, { binary: isBinary });
      } catch {
        closeBoth();
      }
    });

    client.on("close", () => closeBoth());
    client.on("error", () => closeBoth());
  });
}
