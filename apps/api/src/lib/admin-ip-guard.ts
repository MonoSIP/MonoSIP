import type { FastifyReply, FastifyRequest } from "fastify";
import { ipAllowed } from "./ip-allowlist.js";
import { isIpActivelyBanned } from "./ip-bans.js";
import { loadSecuritySettings } from "./security-settings.js";

/** Paths that skip admin IP allowlist (login must still check allowlist itself). */
const SKIP_PREFIXES = [
  "/api/v1/admin/auth/login",
  "/api/v1/health",
  "/api/v1/internal/",
];

export function shouldSkipAdminIpGuard(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return SKIP_PREFIXES.some((p) => path === p || path.startsWith(p));
}

/**
 * Enforce adminIpAllowlist + active DB bans on admin API routes.
 * Empty allowlist = allow all (lab). Ban list always applies.
 */
export async function enforceAdminIpAccess(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const path = req.url.split("?")[0] ?? req.url;
  if (!path.startsWith("/api/v1/admin")) return true;
  if (shouldSkipAdminIpGuard(path)) return true;

  const ip = req.ip || "unknown";
  try {
    if (await isIpActivelyBanned(ip)) {
      reply.code(403).send({ error: "IP temporarily banned" });
      return false;
    }
    const s = await loadSecuritySettings();
    if (!ipAllowed(ip, s.adminIpAllowlist ?? [])) {
      reply.code(403).send({ error: "Admin access not allowed from this IP" });
      return false;
    }
  } catch {
    /* settings unreadable — allow (boot / lab) */
  }
  return true;
}
