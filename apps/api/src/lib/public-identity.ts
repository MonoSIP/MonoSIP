import { config } from "../config.js";

function isLocalHost(h: string): boolean {
  const x = h.trim().toLowerCase();
  return !x || x === "localhost" || x === "127.0.0.1" || x === "::1" || x === "0.0.0.0";
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
