import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { trunks } from "../db/schema.js";
import { requireAdmin } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import {
  deactivateIpBan,
  listActiveIpBans,
  upsertIpBan,
} from "../lib/ip-bans.js";
import { listMemoryBans } from "../lib/login-guard.js";
import { loadSecuritySettings } from "../lib/security-settings.js";
import { buildFirewallExport } from "../lib/firewall-export.js";
import { requireInternalSecret } from "../lib/internal-auth.js";
import { tryReloadAsterisk } from "../asterisk/config-writer.js";

export async function securityRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/security/bans", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const s = await loadSecuritySettings();
    const dbBans = await listActiveIpBans();
    const memory = listMemoryBans(s.securityLoginMaxRetry ?? 8);
    return {
      bans: dbBans,
      memoryBans: memory.map((m) => ({
        ip: m.ip,
        count: m.count,
        expiresAt: new Date(m.until).toISOString(),
        source: "login" as const,
      })),
    };
  });

  app.post("/api/v1/admin/security/bans", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const body = z
      .object({
        ip: z.string().min(3).max(64),
        reason: z.string().optional(),
        expiresMinutes: z.number().int().min(0).optional(),
      })
      .parse(req.body);
    const expiresAt =
      body.expiresMinutes && body.expiresMinutes > 0
        ? new Date(Date.now() + body.expiresMinutes * 60_000)
        : null;
    const { id } = await upsertIpBan({
      ip: body.ip.trim(),
      source: "manual",
      reason: body.reason,
      expiresAt,
    });
    await writeAudit({
      actor: actor as never,
      action: "security.ban",
      objectId: id,
      after: { ip: body.ip, expiresAt },
      ip: req.ip,
    });
    void tryReloadAsterisk();
    return { ok: true, id };
  });

  app.delete("/api/v1/admin/security/bans/:id", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    const ok = await deactivateIpBan(id);
    if (!ok) return reply.code(404).send({ error: "Not found" });
    await writeAudit({
      actor: actor as never,
      action: "security.unban",
      objectId: id,
      ip: req.ip,
    });
    void tryReloadAsterisk();
    return { ok: true };
  });

  app.get("/api/v1/admin/security/firewall-export", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const s = await loadSecuritySettings();
    const trks = await db.select().from(trunks).where(eq(trunks.enabled, true));
    const trunkHosts = trks.map((t) => t.host).filter(Boolean);
    const exp = buildFirewallExport({ settings: s, trunkHosts });
    const format = (req.query as { format?: string }).format ?? "json";
    if (format === "nftables") {
      reply.header("content-type", "text/plain; charset=utf-8");
      reply.header("content-disposition", 'attachment; filename="dsip-nftables.conf"');
      return exp.nftables;
    }
    if (format === "ufw") {
      reply.header("content-type", "text/plain; charset=utf-8");
      reply.header("content-disposition", 'attachment; filename="dsip-ufw.sh"');
      return exp.ufw;
    }
    return exp;
  });

  app.get("/api/v1/admin/security/status", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const s = await loadSecuritySettings();
    return {
      adminIpAllowlist: s.adminIpAllowlist ?? [],
      portalIpAllowlist: s.portalIpAllowlist ?? [],
      sipIpAllowlist: s.sipIpAllowlist ?? [],
      sipIpDenylist: s.sipIpDenylist ?? [],
      securityLoginMaxRetry: s.securityLoginMaxRetry ?? 8,
      securityLoginBanMinutes: s.securityLoginBanMinutes ?? 15,
      fail2banHint:
        "Lab: docker compose --profile fail2ban up -d (mounts Asterisk log volume)",
      clientIp: req.ip,
    };
  });

  /** Fail2ban action webhook → panel ban list */
  app.post("/api/v1/internal/security/ban", async (req, reply) => {
    if (!requireInternalSecret(req, reply)) return;
    const body = z
      .object({
        ip: z.string().min(3),
        reason: z.string().optional(),
        bantime: z.coerce.number().int().optional(),
        jail: z.string().optional(),
      })
      .parse(req.body);
    const expiresAt =
      body.bantime && body.bantime > 0
        ? new Date(Date.now() + body.bantime * 1000)
        : new Date(Date.now() + 900_000);
    const { id } = await upsertIpBan({
      ip: body.ip.trim(),
      source: "fail2ban",
      reason: body.reason ?? body.jail ?? "fail2ban",
      expiresAt,
    });
    void tryReloadAsterisk();
    return { ok: true, id };
  });

  /** After security settings change, rewrite Asterisk ACL */
  app.post("/api/v1/admin/security/apply-sip-acl", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const ok = await tryReloadAsterisk();
    await writeAudit({
      actor: actor as never,
      action: "security.apply_sip_acl",
      ip: req.ip,
    });
    return { ok };
  });
}
