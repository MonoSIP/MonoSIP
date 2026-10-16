import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { AdminLoginSchema, PortalLoginSchema } from "@dsip/shared";
import {
  COOKIE,
  destroySession,
  getSessionToken,
  loginAdmin,
  loginExtension,
  requireAdmin,
  resolveActor,
} from "../lib/auth.js";
import { db } from "../db/client.js";
import { admins } from "../db/schema.js";
import { generateTotpSecret, totpQrDataUrl, verifyTotp } from "../lib/totp.js";
import { writeAudit } from "../lib/audit.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/v1/admin/auth/login", async (req, reply) => {
    const { isIpBanned, recordLoginFailure, clearLoginFailures } = await import(
      "../lib/login-guard.js"
    );
    const { loadSecuritySettings } = await import("../lib/security-settings.js");
    const { isIpActivelyBanned, upsertIpBan } = await import("../lib/ip-bans.js");
    const ip = req.ip || "unknown";
    let maxRetry = 8;
    let banMinutes = 15;
    try {
      const s = await loadSecuritySettings();
      maxRetry = s.securityLoginMaxRetry ?? 8;
      banMinutes = s.securityLoginBanMinutes ?? 15;
      const { ipAllowed } = await import("../lib/ip-allowlist.js");
      if (!ipAllowed(ip, s.adminIpAllowlist ?? [])) {
        return reply.code(403).send({ error: "Admin login not allowed from this IP" });
      }
    } catch {
      /* allow if settings unreadable */
    }
    if (await isIpActivelyBanned(ip) || isIpBanned(ip, maxRetry)) {
      return reply.code(429).send({ error: "Too many failed logins — try later" });
    }
    const body = AdminLoginSchema.parse(req.body);
    const result = await loginAdmin(body.email, body.password, body.totpCode);
    if ("error" in result) {
      const { banned } = recordLoginFailure(ip, { maxRetry, banMinutes });
      const { securityLog } = await import("../lib/security-log.js");
      await securityLog(
        `POST /api/v1/admin/auth/login HTTP/1.1" 401 remoteAddress:${ip}`,
      );
      if (banned) {
        await upsertIpBan({
          ip,
          source: "login",
          reason: "admin login flood",
          expiresAt: new Date(Date.now() + banMinutes * 60_000),
        });
        await securityLog(`[security] admin login ban ip=${ip}`);
        console.warn(`[security] admin login ban ip=${ip}`);
      }
      return reply.code(401).send(result);
    }
    clearLoginFailures(ip);
    reply.setCookie(COOKIE, result.token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 7 * 86400,
    });
    return { ok: true };
  });

  app.post("/api/v1/admin/auth/totp/setup", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const secret = generateTotpSecret();
    await db
      .update(admins)
      .set({ totpSecret: secret, totpEnabled: false })
      .where(eq(admins.id, actor.id));
    const qr = await totpQrDataUrl(actor.email, secret);
    return { secret, qr, otpauth: `otpauth://totp/DSip:${actor.email}?secret=${secret}&issuer=DSip` };
  });

  app.post("/api/v1/admin/auth/totp/enable", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const body = z.object({ code: z.string().min(6) }).parse(req.body);
    const [admin] = await db.select().from(admins).where(eq(admins.id, actor.id));
    if (!admin?.totpSecret || !verifyTotp(body.code, admin.totpSecret)) {
      return reply.code(400).send({ error: "Invalid TOTP code" });
    }
    await db.update(admins).set({ totpEnabled: true }).where(eq(admins.id, actor.id));
    await writeAudit({
      actor: actor as never,
      action: "admin.totp_enable",
      objectId: actor.id,
      ip: req.ip,
    });
    return { ok: true };
  });

  app.post("/api/v1/admin/auth/totp/disable", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const body = z.object({ code: z.string().min(6) }).parse(req.body);
    const [admin] = await db.select().from(admins).where(eq(admins.id, actor.id));
    if (!admin?.totpSecret || !verifyTotp(body.code, admin.totpSecret)) {
      return reply.code(400).send({ error: "Invalid TOTP code" });
    }
    await db
      .update(admins)
      .set({ totpEnabled: false, totpSecret: null })
      .where(eq(admins.id, actor.id));
    return { ok: true };
  });

  app.get("/api/v1/admin/auth/totp/status", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const [admin] = await db.select().from(admins).where(eq(admins.id, actor.id));
    return { enabled: !!admin?.totpEnabled };
  });

  app.post("/api/v1/auth/login", async (req, reply) => {
    const { isIpBanned, recordLoginFailure, clearLoginFailures } = await import(
      "../lib/login-guard.js"
    );
    const { loadSecuritySettings } = await import("../lib/security-settings.js");
    const { isIpActivelyBanned, upsertIpBan } = await import("../lib/ip-bans.js");
    const { ipAllowed } = await import("../lib/ip-allowlist.js");
    const ip = req.ip || "unknown";
    let maxRetry = 8;
    let banMinutes = 15;
    try {
      const s = await loadSecuritySettings();
      maxRetry = s.securityLoginMaxRetry ?? 8;
      banMinutes = s.securityLoginBanMinutes ?? 15;
      if (!ipAllowed(ip, s.portalIpAllowlist ?? [])) {
        return reply.code(403).send({ error: "Portal login not allowed from this IP" });
      }
    } catch {
      /* allow */
    }
    if (await isIpActivelyBanned(ip) || isIpBanned(ip, maxRetry)) {
      return reply.code(429).send({ error: "Too many failed logins — try later" });
    }
    const body = PortalLoginSchema.parse(req.body);
    const result = await loginExtension(body.extension, body.password);
    if ("error" in result) {
      const { banned } = recordLoginFailure(ip, { maxRetry, banMinutes });
      if (banned) {
        await upsertIpBan({
          ip,
          source: "login",
          reason: "portal login flood",
          expiresAt: new Date(Date.now() + banMinutes * 60_000),
        });
      }
      return reply.code(401).send(result);
    }
    clearLoginFailures(ip);
    reply.setCookie(COOKIE, result.token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 7 * 86400,
    });
    return { ok: true };
  });

  app.post("/api/v1/auth/logout", async (req, reply) => {
    const token = getSessionToken(req);
    if (token) await destroySession(token);
    // Must match setCookie attrs or browsers keep the Secure cookie
    reply.clearCookie(COOKIE, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
    return { ok: true };
  });

  app.get("/api/v1/auth/me", async (req, reply) => {
    const actor = await resolveActor(getSessionToken(req));
    if (!actor) return reply.code(401).send({ error: "Unauthorized" });
    return { actor };
  });
}
