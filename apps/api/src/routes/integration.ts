import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { apiKeys, cdr, recordings } from "../db/schema.js";
import { hashToken } from "../lib/crypto.js";
import { ari } from "../asterisk/ari.js";
import { createReadStream, existsSync } from "node:fs";

type ApiKeyRow = typeof apiKeys.$inferSelect;

function keyHas(key: ApiKeyRow, perm: string): boolean {
  const perms = (key.permissions as string[]) ?? [];
  return perms.includes(perm) || perms.includes("*");
}

async function requireApiKey(
  req: { headers: { authorization?: string; "x-api-key"?: string } },
  perm?: string,
) {
  const raw =
    (req.headers["x-api-key"] as string | undefined) ??
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined);
  if (!raw) return null;
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashToken(raw)))
    .limit(1);
  if (!key) return null;
  if (perm && !keyHas(key, perm)) return { forbidden: true as const };
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  return key;
}

function audioContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "wav") return "audio/wav";
  if (ext === "ogg" || ext === "opus") return "audio/ogg";
  return "application/octet-stream";
}

export async function integrationRoutes(app: FastifyInstance) {
  app.post("/api/v1/ext/calls/originate", async (req, reply) => {
    const key = await requireApiKey(req, "originate");
    if (!key) return reply.code(401).send({ error: "Invalid API key" });
    if ("forbidden" in key) return reply.code(403).send({ error: "Missing permission: originate" });
    const body = z
      .object({
        extension: z.string(),
        number: z.string(),
        callerId: z.string().optional(),
      })
      .parse(req.body);
    const { SettingsSchema } = await import("@dsip/shared");
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
    const key = await requireApiKey(req, "cdr");
    if (!key) return reply.code(401).send({ error: "Invalid API key" });
    if ("forbidden" in key) return reply.code(403).send({ error: "Missing permission: cdr" });
    return db.select().from(cdr).orderBy(desc(cdr.startedAt)).limit(200);
  });

  app.get("/api/v1/ext/recordings/:id/stream", async (req, reply) => {
    const key = await requireApiKey(req, "recordings");
    if (!key) return reply.code(401).send({ error: "Invalid API key" });
    if ("forbidden" in key) return reply.code(403).send({ error: "Missing permission: recordings" });
    const { id } = req.params as { id: string };
    const [rec] = await db.select().from(recordings).where(eq(recordings.id, id));
    if (!rec || !existsSync(rec.filePath)) return reply.code(404).send({ error: "Not found" });
    reply.header("content-type", audioContentType(rec.filePath));
    return reply.send(createReadStream(rec.filePath));
  });
}
