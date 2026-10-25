import type { FastifyInstance } from "fastify";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { db } from "../db/client.js";
import { webWidgets, widgetDailyStats, widgetSessions } from "../db/schema.js";
import { config } from "../config.js";
import { encrypt } from "../lib/crypto.js";
import { originAllowed } from "../lib/origin-allow.js";
import { buildIceServers } from "../lib/turn-credentials.js";
import { requireAdmin } from "../lib/auth.js";

const WidgetBody = z.object({
  name: z.string().min(1).max(100),
  number: z.string().regex(/^\d{2,20}$/),
  destType: z.string().min(1).max(32),
  destId: z.string().nullable().optional(),
  allowedOrigins: z.array(z.string().max(255)).max(50).default([]),
  maxConcurrent: z.number().int().min(1).max(50).optional(),
  maxCallSeconds: z.number().int().min(30).max(3600).optional(),
  dailyLimit: z.number().int().min(0).max(10000).optional(),
  requestsPerIpHour: z.number().int().min(1).max(500).optional(),
  buttonText: z.string().max(64).optional(),
  buttonColor: z.string().max(16).optional(),
  position: z.enum(["bottom-right", "bottom-left"]).optional(),
  locale: z.enum(["en", "tr"]).optional(),
  askName: z.boolean().optional(),
  browserCallEnabled: z.boolean().optional(),
  callbackEnabled: z.boolean().optional(),
  callbackPrefixes: z.array(z.string().max(16)).max(20).optional(),
  enabled: z.boolean().optional(),
});

function publicKey(): string {
  return `w_${randomBytes(6).toString("hex")}`;
}

function sipGuestUser(): string {
  return `wg${randomBytes(4).toString("hex")}`;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

const ipHits = new Map<string, { n: number; resetAt: number }>();

function rateOk(key: string, limit: number): boolean {
  const now = Date.now();
  const cur = ipHits.get(key);
  if (!cur || cur.resetAt < now) {
    ipHits.set(key, { n: 1, resetAt: now + 3600_000 });
    return true;
  }
  if (cur.n >= limit) return false;
  cur.n += 1;
  return true;
}

async function bumpStat(widgetId: string, field: "calls" | "callbacks") {
  const day = todayUtc();
  const [ex] = await db
    .select()
    .from(widgetDailyStats)
    .where(and(eq(widgetDailyStats.widgetId, widgetId), eq(widgetDailyStats.day, day)));
  if (ex) {
    await db
      .update(widgetDailyStats)
      .set(
        field === "calls"
          ? { calls: sql`${widgetDailyStats.calls} + 1` }
          : { callbacks: sql`${widgetDailyStats.callbacks} + 1` },
      )
      .where(eq(widgetDailyStats.id, ex.id));
  } else {
    await db.insert(widgetDailyStats).values({
      widgetId,
      day,
      calls: field === "calls" ? 1 : 0,
      callbacks: field === "callbacks" ? 1 : 0,
    });
  }
}

async function dayCount(widgetId: string): Promise<number> {
  const day = todayUtc();
  const [ex] = await db
    .select()
    .from(widgetDailyStats)
    .where(and(eq(widgetDailyStats.widgetId, widgetId), eq(widgetDailyStats.day, day)));
  return (ex?.calls ?? 0) + (ex?.callbacks ?? 0);
}

function reqHost(req: { headers: Record<string, string | string[] | undefined>; hostname: string }) {
  const xf = req.headers["x-forwarded-host"];
  const raw = (Array.isArray(xf) ? xf[0] : xf) || req.hostname;
  return String(raw).split(",")[0]?.trim().split(":")[0] || config.publicHost;
}

export async function widgetRoutes(app: FastifyInstance) {
  // —— Public widget.js ——
  app.get("/widget.js", async (_req, reply) => {
    const file = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../public/widget.js",
    );
    try {
      const body = readFileSync(file, "utf8");
      return reply
        .header("Content-Type", "application/javascript; charset=utf-8")
        .header("Cache-Control", "public, max-age=300")
        .header("Access-Control-Allow-Origin", "*")
        .send(body);
    } catch {
      return reply.code(404).send("// widget.js missing");
    }
  });

  // —— ICE for softphone + widget (public; creds are time-limited) ——
  app.get("/api/v1/ice-servers", async (req) => {
    const host = reqHost(req);
    return buildIceServers({ host, userId: "webrtc" });
  });

  // —— Admin CRUD ——
  app.get("/api/v1/admin/widgets", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    return db.select().from(webWidgets).orderBy(asc(webWidgets.createdAt));
  });

  app.post("/api/v1/admin/widgets", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const body = WidgetBody.parse(req.body);
    const [row] = await db
      .insert(webWidgets)
      .values({
        publicKey: publicKey(),
        name: body.name,
        number: body.number,
        destType: body.destType,
        destId: body.destId ?? null,
        allowedOrigins: body.allowedOrigins,
        maxConcurrent: body.maxConcurrent ?? 5,
        maxCallSeconds: body.maxCallSeconds ?? 600,
        dailyLimit: body.dailyLimit ?? 100,
        requestsPerIpHour: body.requestsPerIpHour ?? 30,
        buttonText: body.buttonText ?? "Call us",
        buttonColor: body.buttonColor ?? "#0f766e",
        position: body.position ?? "bottom-right",
        locale: body.locale ?? "en",
        askName: body.askName ?? false,
        browserCallEnabled: body.browserCallEnabled ?? true,
        callbackEnabled: body.callbackEnabled ?? false,
        callbackPrefixes: body.callbackPrefixes ?? [],
        enabled: body.enabled ?? true,
      })
      .returning();
    void import("../asterisk/config-writer.js").then(({ writeAsteriskConfig }) =>
      writeAsteriskConfig().catch(() => undefined),
    );
    return row;
  });

  app.patch("/api/v1/admin/widgets/:id", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    const body = WidgetBody.partial().parse(req.body);
    const [row] = await db.update(webWidgets).set(body).where(eq(webWidgets.id, id)).returning();
    if (!row) return reply.code(404).send({ error: "Not found" });
    void import("../asterisk/config-writer.js").then(({ writeAsteriskConfig }) =>
      writeAsteriskConfig().catch(() => undefined),
    );
    return row;
  });

  app.delete("/api/v1/admin/widgets/:id", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    await db.delete(webWidgets).where(eq(webWidgets.id, id));
    void import("../asterisk/config-writer.js").then(({ writeAsteriskConfig }) =>
      writeAsteriskConfig().catch(() => undefined),
    );
    return { ok: true };
  });

  // —— Public config (button look) ——
  for (const path of [
    "/api/v1/public/widgets/:key",
    "/api/v1/public/widgets/:key/session",
    "/api/v1/public/widgets/:key/callback",
  ] as const) {
    app.options(path, async (_req, reply) => {
      return reply
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        .header("Access-Control-Allow-Headers", "Content-Type")
        .code(204)
        .send();
    });
  }

  app.get("/api/v1/public/widgets/:key", async (req, reply) => {
    const { key } = req.params as { key: string };
    const origin = req.headers.origin;
    const [w] = await db.select().from(webWidgets).where(eq(webWidgets.publicKey, key));
    if (!w || !w.enabled) return reply.code(404).send({ error: "Not found" });
    if (!originAllowed(w.allowedOrigins, origin)) {
      return reply
        .header("Access-Control-Allow-Origin", origin || "*")
        .code(403)
        .send({ error: "Origin not allowed" });
    }
    return reply.header("Access-Control-Allow-Origin", origin || "*").send({
      name: w.name,
      number: w.number,
      buttonText: w.buttonText,
      buttonColor: w.buttonColor,
      position: w.position,
      locale: w.locale,
      askName: w.askName,
      browserCallEnabled: w.browserCallEnabled,
      callbackEnabled: w.callbackEnabled,
    });
  });

  // —— Browser call session (ephemeral WebRTC SIP) ——
  app.post("/api/v1/public/widgets/:key/session", async (req, reply) => {
    const { key } = req.params as { key: string };
    const origin = req.headers.origin;
    const ip = req.ip;
    const body = z
      .object({ callerName: z.string().max(100).optional() })
      .parse(req.body ?? {});

    const [w] = await db.select().from(webWidgets).where(eq(webWidgets.publicKey, key));
    if (!w || !w.enabled || !w.browserCallEnabled) {
      return reply.code(404).send({ error: "Not found" });
    }
    if (!originAllowed(w.allowedOrigins, origin)) {
      return reply
        .header("Access-Control-Allow-Origin", origin || "*")
        .code(403)
        .send({ error: "Origin not allowed" });
    }
    if (!rateOk(`${w.id}:${ip}`, w.requestsPerIpHour)) {
      return reply
        .header("Access-Control-Allow-Origin", origin || "*")
        .code(429)
        .send({ error: "Too many requests" });
    }
    if (w.dailyLimit > 0 && (await dayCount(w.id)) >= w.dailyLimit) {
      return reply
        .header("Access-Control-Allow-Origin", origin || "*")
        .code(429)
        .send({ error: "Daily call limit reached" });
    }

    const active = await db
      .select()
      .from(widgetSessions)
      .where(and(eq(widgetSessions.widgetId, w.id), gt(widgetSessions.expiresAt, new Date())));
    if (active.length >= w.maxConcurrent) {
      return reply
        .header("Access-Control-Allow-Origin", origin || "*")
        .code(503)
        .send({ error: "Busy — try again shortly" });
    }

    const sipUser = sipGuestUser();
    const sipPass = randomBytes(12).toString("base64url");
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    await db.insert(widgetSessions).values({
      widgetId: w.id,
      sipUser,
      sipPassEnc: encrypt(sipPass),
      callerName: body.callerName ?? null,
      origin: origin ?? null,
      expiresAt,
    });

    try {
      const { writeAsteriskConfig } = await import("../asterisk/config-writer.js");
      await writeAsteriskConfig();
    } catch (e) {
      console.warn("[widget] config reload", (e as Error).message);
    }

    await bumpStat(w.id, "calls");
    const host = reqHost(req);
    const ice = buildIceServers({ host, userId: sipUser });
    const domain =
      config.sipDomain && config.sipDomain !== "localhost" ? config.sipDomain : host;
    const websocketUrl =
      config.sipWssUrl && !config.sipWssUrl.includes("localhost")
        ? config.sipWssUrl
        : `wss://${host}/asterisk-ws`;

    return reply.header("Access-Control-Allow-Origin", origin || "*").send({
      extension: sipUser,
      password: sipPass,
      domain,
      websocketUrl,
      dial: w.number,
      displayName: body.callerName || "Web visitor",
      maxCallSeconds: w.maxCallSeconds,
      iceServers: ice.iceServers,
      expiresAt: expiresAt.toISOString(),
    });
  });

  // —— Call-back form ——
  app.post("/api/v1/public/widgets/:key/callback", async (req, reply) => {
    const { key } = req.params as { key: string };
    const origin = req.headers.origin;
    const ip = req.ip;
    const body = z
      .object({
        phone: z.string().min(7).max(32),
        name: z.string().max(100).optional(),
      })
      .parse(req.body);

    const [w] = await db.select().from(webWidgets).where(eq(webWidgets.publicKey, key));
    if (!w || !w.enabled || !w.callbackEnabled) {
      return reply.code(404).send({ error: "Not found" });
    }
    if (!originAllowed(w.allowedOrigins, origin)) {
      return reply
        .header("Access-Control-Allow-Origin", origin || "*")
        .code(403)
        .send({ error: "Origin not allowed" });
    }
    if (!rateOk(`cb:${w.id}:${ip}`, w.requestsPerIpHour)) {
      return reply
        .header("Access-Control-Allow-Origin", origin || "*")
        .code(429)
        .send({ error: "Too many requests" });
    }
    if (w.dailyLimit > 0 && (await dayCount(w.id)) >= w.dailyLimit) {
      return reply
        .header("Access-Control-Allow-Origin", origin || "*")
        .code(429)
        .send({ error: "Daily call limit reached" });
    }

    const phone = body.phone.replace(/[^\d+]/g, "");
    const prefixes = (w.callbackPrefixes as string[]) ?? [];
    if (prefixes.length) {
      const ok = prefixes.some((p) => phone.replace(/^\+/, "").startsWith(p.replace(/^\+/, "")));
      if (!ok) {
        return reply
          .header("Access-Control-Allow-Origin", origin || "*")
          .code(400)
          .send({ error: "Number prefix not allowed" });
      }
    }

    const dialNum = phone.replace(/^\+/, "");
    const endpoint = `Local/${dialNum}@from-internal`;
    const params = new URLSearchParams({
      endpoint,
      extension: w.number,
      context: "from-widget",
      priority: "1",
      timeout: "45",
      callerId: `${body.name || "Callback"} <${dialNum}>`,
    });
    const res = await fetch(`${config.asterisk.ariUrl.replace(/\/$/, "")}/ari/channels?${params}`, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${config.asterisk.ariUser}:${config.asterisk.ariPassword}`).toString(
            "base64",
          ),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("[widget] callback originate failed", text);
      return reply
        .header("Access-Control-Allow-Origin", origin || "*")
        .code(502)
        .send({ error: "Could not place call-back" });
    }

    await bumpStat(w.id, "callbacks");
    return reply
      .header("Access-Control-Allow-Origin", origin || "*")
      .send({ ok: true, message: "We will call you shortly" });
  });
}

