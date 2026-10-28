import { config } from "../config.js";

function isLocalHost(h: string): boolean {
  const x = h.trim().toLowerCase();
  return !x || x === "localhost" || x === "127.0.0.1" || x === "::1" || x === "0.0.0.0";
}

/** The scheme the browser actually used. A Secure cookie on plain HTTP is dropped, so login looks like it failed. */
export function clientIsHttps(
  headers: { "x-forwarded-proto"?: string | string[] | undefined },
  protocol: string,
): boolean {
  const raw = headers["x-forwarded-proto"];
  const proto = String(Array.isArray(raw) ? raw[0] : (raw ?? ""))
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  if (proto === "https" || proto === "http") return proto === "https";
  return protocol === "https";
}

/**
 * Softphone socket for this page. An HTTP page must stay on ws:// — wss:// is a
 * second certificate check, and an untrusted cert closes the socket before register.
 */
export function browserWebsocketUrl(host: string, https: boolean, configured: string): string {
  const same = host ? `${https ? "wss" : "ws"}://${host}/asterisk-ws` : "";
  if (!https) return same || configured;
  if (
    configured &&
    !configured.includes("localhost") &&
    !configured.includes("127.0.0.1")
  ) {
    return configured;
  }
  return same || configured;
}

/**
 * When vault forgot PUBLIC_HOST (NineDeploy often ships with localhost defaults),
 * adopt the browser-facing host so SIP domain / WSS URL match the softphone.
 */
export function adoptPublicIdentityFromHost(rawHost: string | undefined): void {
  if (!isLocalHost(config.publicHost) && config.sipDomain !== "localhost") return;
  const host = (rawHost ?? "")
    .split(",")[0]
    ?.trim()
    .replace(/^\[|\]$/g, "")
    .split(":")[0]
    ?.trim();
  if (!host || isLocalHost(host)) return;

  config.publicHost = host;
  if (isLocalHost(config.publicUrl.replace(/^https?:\/\//i, "").split("/")[0] ?? "localhost")) {
    config.publicUrl = `https://${host}`;
  }
  if (isLocalHost(config.sipDomain)) {
    config.sipDomain = host;
  }
  if (
    !config.sipWssUrl ||
    config.sipWssUrl.includes("localhost") ||
    config.sipWssUrl.includes("127.0.0.1")
  ) {
    config.sipWssUrl = `wss://${host}/asterisk-ws`;
  }
}
