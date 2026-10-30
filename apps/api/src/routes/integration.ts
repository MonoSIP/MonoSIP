import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { announceCalls, apiKeys, cdr, recordings } from "../db/schema.js";
import { hashToken } from "../lib/crypto.js";
import { ari } from "../asterisk/ari.js";
import { createReadStream, existsSync } from "node:fs";
import { ipAllowed } from "../lib/ip-allowlist.js";
import { announcePublic, openRecording, placeAnnounceCall } from "../lib/announce-call.js";
import { dialNumberPattern } from "../lib/announce-policy.js";
import { authBlocked, clearAuthFailure, keyExpired, noteAuthFailure, verifyBarrier } from "../lib/api-key-auth.js";

type ApiKeyRow = typeof apiKeys.$inferSelect;

function keyHas(key: ApiKeyRow, perm: string): boolean {
  const perms = (key.permissions as string[]) ?? [];
  return perms.includes(perm) || perms.includes("*");
}

type KeyAuth =
  | { ok: true; key: ApiKeyRow }
  | { ok: false; status: 401 | 403 | 429; error: string };

function presented(req: FastifyRequest): { key: string; barrier?: string } | null {
  const headerKey = req.headers["x-api-key"];
  const fromHeader = Array.isArray(headerKey) ? headerKey[0] : headerKey;
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : undefined;
  const key = (fromHeader ?? bearer)?.trim();
  if (!key) return null;
  const headerBarrier = req.headers["x-api-barrier"];
  const barrier = (Array.isArray(headerBarrier) ? headerBarrier[0] : headerBarrier)?.trim();
  return { key, barrier: barrier || undefined };
}

async function authenticate(req: FastifyRequest, perm?: string): Promise<KeyAuth> {
  const ip = req.ip || "unknown";
  if (authBlocked(ip)) return { ok: false, status: 429, error: "Too many attempts" };
  const creds = presented(req);
  if (!creds) return { ok: false, status: 401, error: "Invalid API key" };

  const [byId] = await db.select().from(apiKeys).where(eq(apiKeys.keyId, creds.key)).limit(1);
  let key = byId;
  if (key) {
    if (!verifyBarrier(creds.barrier, key.barrierHash)) {
      noteAuthFailure(ip);
      return { ok: false, status: 401, error: "Invalid API key" };
    }
  } else {
    const [legacy] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, hashToken(creds.key)), isNull(apiKeys.keyId)))
      .limit(1);
    if (!legacy) {
      noteAuthFailure(ip);
      return { ok: false, status: 401, error: "Invalid API key" };
    }
    key = legacy;
  }

  if (keyExpired(key.expiresAt)) return { ok: false, status: 401, error: "API key expired" };
  if (!ipAllowed(req.ip, (key.allowedIps as string[]) ?? [])) {
    return { ok: false, status: 403, error: "IP not allowed" };
  }
  if (perm && !keyHas(key, perm)) return { ok: false, status: 403, error: `Missing permission: ${perm}` };
  clearAuthFailure(ip);
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  return { ok: true, key };
}

function audioContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "wav") return "audio/wav";
  if (ext === "ogg" || ext === "opus") return "audio/ogg";
  return "application/octet-stream";
}

export async function integrationRoutes(app: FastifyInstance) {
  app.post("/api/v1/ext/calls/originate", async (req, reply) => {
    const authn = await authenticate(req, "originate");
    if (!authn.ok) return reply.code(authn.status).send({ error: authn.error });
    const body = z
      .object({
        extension: z.string(),
        number: z.string().regex(dialNumberPattern),
        callerId: z.string().optional(),
      })
      .parse(req.body);
    const { SettingsSchema } = await import("@monosip/shared");
    const { settings } = await import("../db/schema.js");
    const { checkExtensionOutbound, isAnonymousCaller } = await import("../lib/call-policy.js");
    const { isBlacklisted } = await import("../asterisk/routing.js");
    const [srow] = await db.select().from(settings).limit(1);
    const s = SettingsSchema.parse(srow?.data ?? {});
    if (await isBlacklisted(body.number, "outbound")) {
      return reply.code(403).send({ error: "Number blacklisted" });
    }
    if (isAnonymousCaller(body.number)) {
      return reply.code(400).send({ error: "Invalid destination" });
    }
    const policy = await checkExtensionOutbound(body.extension, body.number, s);
    if (!policy.ok) {
      return reply.code(403).send({ error: policy.reason });
    }
    let callerId = body.callerId;
    if (!callerId) {
      const { extensions } = await import("../db/schema.js");
      const [ext] = await db
        .select()
        .from(extensions)
        .where(eq(extensions.number, body.extension))
        .limit(1);
      if (ext?.outboundCli) callerId = `${ext.name || ext.number} <${ext.outboundCli}>`;
    }
    const result = await ari.originate({
      endpoint: `PJSIP/${body.extension}`,
      extension: body.number,
      callerId,
    });
    return { ok: true, result };
  });

  app.get("/api/v1/ext/cdr", async (req, reply) => {
    const authn = await authenticate(req, "cdr");
    if (!authn.ok) return reply.code(authn.status).send({ error: authn.error });
    return db.select().from(cdr).orderBy(desc(cdr.startedAt)).limit(200);
  });

  app.get("/api/v1/ext/recordings/:id/stream", async (req, reply) => {
    const authn = await authenticate(req, "recordings");
    if (!authn.ok) return reply.code(authn.status).send({ error: authn.error });
    const { id } = req.params as { id: string };
    const [rec] = await db.select().from(recordings).where(eq(recordings.id, id));
    if (!rec || !existsSync(rec.filePath)) return reply.code(404).send({ error: "Not found" });
    reply.header("content-type", audioContentType(rec.filePath));
    return reply.send(createReadStream(rec.filePath));
  });

  app.post("/api/v1/ext/calls/announce", async (req, reply) => {
    const authn = await authenticate(req, "announce");
    if (!authn.ok) return reply.code(authn.status).send({ error: authn.error });
    const key = authn.key;
    const body = z
      .object({
        number: z.string().regex(dialNumberPattern),
        text: z.string().trim().min(1).max(1000),
        language: z.enum(["en", "tr"]),
        voice: z.enum(["female", "male", "ema"]),
        mode: z.enum(["answered", "played", "dtmf"]),
        callerId: z
          .string()
          .regex(/^\+?[0-9]{6,20}$/)
          .optional(),
        webhookUrl: z.string().optional(),
      })
      .parse(req.body);
    const { isBlacklisted } = await import("../asterisk/routing.js");
    if (await isBlacklisted(body.number, "outbound")) {
      return reply.code(403).send({ error: "Number blacklisted" });
    }
    const placed = await placeAnnounceCall(key, body);
    if (!placed.ok) return reply.code(placed.status).send({ error: placed.error });
    return reply.code(placed.status).send(placed.body);
  });

  app.get("/api/v1/ext/calls/:id", async (req, reply) => {
    const authn = await authenticate(req, "announce");
    if (!authn.ok) return reply.code(authn.status).send({ error: authn.error });
    const key = authn.key;
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(announceCalls)
      .where(and(eq(announceCalls.id, id), eq(announceCalls.apiKeyId, key.id)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "Not found" });
    return announcePublic(row);
  });

  app.get("/api/v1/ext/calls/:id/recording", async (req, reply) => {
    const authn = await authenticate(req, "announce");
    if (!authn.ok) return reply.code(authn.status).send({ error: authn.error });
    const key = authn.key;
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(announceCalls)
      .where(and(eq(announceCalls.id, id), eq(announceCalls.apiKeyId, key.id)))
      .limit(1);
    if (!row?.recordingId) return reply.code(404).send({ error: "Not found" });
    const [rec] = await db.select().from(recordings).where(eq(recordings.id, row.recordingId));
    const audio = rec ? openRecording(rec.filePath) : null;
    if (!audio) return reply.code(404).send({ error: "Not found" });
    reply.header("content-type", audio.type);
    return reply.send(audio.stream);
  });
}
