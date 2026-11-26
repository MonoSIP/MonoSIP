import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { safeEqual } from "./crypto.js";

/**
 * The all-in-one image embeds Asterisk on loopback, so every legitimate
 * dialplan/fail2ban hook reaches the API from 127.0.0.1. In that topology the
 * internal routes must never be callable from a forwarded external peer — the
 * shared secret is the authenticator, but a loopback check removes the route
 * from the internet-facing surface entirely (defense in depth).
 *
 * Compose runs Asterisk in its own container (ARI on a service host, not
 * localhost), so hooks arrive from the bridge network rather than loopback;
 * there the deny lives in nginx instead and this check is skipped.
 */
function embeddedAsterisk(): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(config.asterisk.ariUrl);
}

function isLoopback(addr: string | undefined): boolean {
  if (!addr) return false;
  const ip = addr.startsWith("::ffff:") ? addr.slice(7) : addr;
  return ip === "::1" || ip === "127.0.0.1" || ip.startsWith("127.");
}

/** Validate X-MonoSIP-Internal header from dialplan curls. */
export function requireInternalSecret(req: FastifyRequest, reply: FastifyReply): boolean {
  // Raw socket peer, never the spoofable X-Forwarded-For-derived req.ip.
  if (embeddedAsterisk() && !isLoopback(req.socket.remoteAddress)) {
    void reply.code(403).send({ error: "Internal hook not allowed from this address" });
    return false;
  }
  const hdr =
    (req.headers["x-monosip-internal"] as string | undefined) ??
    // name before the rename (older fail2ban actions)
    (req.headers["x-dsip-internal"] as string | undefined) ??
    (req.headers["x-internal-secret"] as string | undefined);
  // Constant-time compare: the rest of the codebase never leaks a secret via
  // early-exit string equality, and neither should this hot path.
  if (!hdr || !safeEqual(hdr, config.internalApiSecret)) {
    void reply.code(401).send({ error: "Unauthorized internal hook" });
    return false;
  }
  return true;
}
