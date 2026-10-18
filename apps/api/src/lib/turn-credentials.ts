import { createHmac } from "node:crypto";
import { config } from "../config.js";

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

/** Coturn REST (time-limited) credentials — RFC draft / coturn --use-auth-secret. */
export function mintTurnCredentials(userId = "dsip", ttlSec = 6 * 3600): {
  username: string;
  credential: string;
  ttl: number;
} | null {
  const secret = config.turnSecret;
  if (!secret) return null;
  const ttl = Math.max(60, ttlSec);
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  const username = `${expiry}:${userId}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential, ttl };
}

/**
 * ICE servers for softphone / website widget.
 * Prefer TURNS on 443 (ALPN mux) when compose nginx + coturn TLS are up.
 */
export function buildIceServers(opts?: {
  host?: string;
  userId?: string;
}): { iceServers: IceServer[]; turnsOn443: boolean; turnEnabled: boolean } {
  const host = (opts?.host || config.publicHost || "localhost").replace(/:\d+$/, "");
  const iceServers: IceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const creds = mintTurnCredentials(opts?.userId ?? "dsip");
  const turnEnabled = Boolean(creds);
  const turnsOn443 = turnEnabled && config.turnsOn443;

  if (creds) {
    if (turnsOn443) {
      iceServers.push({
        urls: [`turns:${host}:443?transport=tcp`, `turns:${host}:443`],
        username: creds.username,
        credential: creds.credential,
      });
    }
    // Direct TURN (UDP/TCP 3478) as fallback when ALPN mux is unavailable
    iceServers.push({
      urls: [`turn:${host}:3478?transport=udp`, `turn:${host}:3478?transport=tcp`],
      username: creds.username,
      credential: creds.credential,
    });
  }

  return { iceServers, turnsOn443, turnEnabled };
}
