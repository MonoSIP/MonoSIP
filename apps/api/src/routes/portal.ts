import type { FastifyInstance } from "fastify";
import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { ForwardingRuleSchema } from "@dsip/shared";
import { db } from "../db/client.js";
import {
  cdr,
  extensionForwarding,
  extensions,
  missedCalls,
  recordingAccessLog,
  recordings,
  voicemails,
} from "../db/schema.js";
import { requireExtension } from "../lib/auth.js";
import { decrypt, scryptHash } from "../lib/crypto.js";
import { config } from "../config.js";
import { ari } from "../asterisk/ari.js";
import { createReadStream, existsSync } from "node:fs";

export async function portalRoutes(app: FastifyInstance) {
  app.get("/api/v1/me", async (req, reply) => {
    const actor = await requireExtension(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const a = actor as { id: string; number: string };
    const [ext] = await db.select().from(extensions).where(eq(extensions.id, a.id));
    if (!ext) return reply.code(404).send({ error: "Not found" });
    return {
      id: ext.id,
      number: ext.number,
      name: ext.name,
      dnd: ext.dnd,
      email: ext.email,
      mobileForwardAllowed: ext.mobileForwardAllowed,
    };
  });

  app.get("/api/v1/me/sip-credentials", async (req, reply) => {
    const actor = await requireExtension(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const a = actor as { id: string; number: string };
    const [ext] = await db.select().from(extensions).where(eq(extensions.id, a.id));
    if (!ext) return reply.code(404).send({ error: "Not found" });
    let password = "";
    try {
      password = decrypt(ext.sipSecretEnc);
    } catch {
      return reply.code(500).send({ error: "SIP secret unavailable" });
    }
    // Prefer live public identity (adopted from Host when vault left localhost).
    const hostHdr = req.headers["x-forwarded-host"];
    const hostRaw = (Array.isArray(hostHdr) ? hostHdr[0] : hostHdr) || req.hostname;
    const host = String(hostRaw)
      .split(",")[0]
      ?.trim()
      .split(":")[0];
    const domain =
      config.sipDomain && config.sipDomain !== "localhost"
        ? config.sipDomain
        : host || config.sipDomain;
    const websocketUrl =
      config.sipWssUrl && !config.sipWssUrl.includes("localhost")
        ? config.sipWssUrl
        : host
          ? `wss://${host}/asterisk-ws`
          : config.sipWssUrl;

    return {
      extension: ext.number,
      password,
      domain,
      websocketUrl,
      displayName: ext.name,
      expiresIn: 300,
    };
  });

  app.get("/api/v1/me/calls", async (req, reply) => {
    const actor = await requireExtension(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const a = actor as { number: string };
    return db
      .select()
      .from(cdr)
      .where(
        or(eq(cdr.extensionNumber, a.number), eq(cdr.caller, a.number), eq(cdr.callee, a.number)),
      )
      .orderBy(desc(cdr.startedAt))
      .limit(100);
  });

  app.get("/api/v1/me/missed-calls", async (req, reply) => {
    const actor = await requireExtension(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const a = actor as { number: string };
    return db
      .select()
      .from(missedCalls)
      .where(eq(missedCalls.target, a.number))
      .orderBy(desc(missedCalls.at))
      .limit(50);
  });

  app.get("/api/v1/me/recordings", async (req, reply) => {
    const actor = await requireExtension(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const a = actor as { id: string; number: string };
    const [ext] = await db.select().from(extensions).where(eq(extensions.id, a.id));
    if (!ext?.recordingListenAllowed) return [];
    const myCalls = await db
      .select()
      .from(cdr)
      .where(
        or(eq(cdr.extensionNumber, a.number), eq(cdr.caller, a.number), eq(cdr.callee, a.number)),
      )
      .limit(200);
    const callIds = new Set(myCalls.map((c) => c.callId));
    const all = await db.select().from(recordings).orderBy(desc(recordings.createdAt)).limit(200);
    return all.filter((r) => callIds.has(r.callId) && (r.duration ?? 0) > 0);
  });

  app.get("/api/v1/me/recordings/:id/stream", async (req, reply) => {
    const actor = await requireExtension(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const a = actor as { id: string; number: string };
    const { id } = req.params as { id: string };
    const [extRow] = await db.select().from(extensions).where(eq(extensions.id, a.id));
    if (!extRow?.recordingListenAllowed) {
      return reply.code(403).send({ error: "Recording listen not allowed" });
    }
    const [rec] = await db.select().from(recordings).where(eq(recordings.id, id));
    if (!rec || !existsSync(rec.filePath)) return reply.code(404).send({ error: "Not found" });
    // Ownership: recording must belong to a CDR involving this extension
    const [owned] = await db
      .select({ id: cdr.id })
      .from(cdr)
      .where(
        and(
          eq(cdr.callId, rec.callId),
          or(
            eq(cdr.extensionNumber, a.number),
            eq(cdr.caller, a.number),
            eq(cdr.callee, a.number),
          ),
        ),
      )
      .limit(1);
    if (!owned) return reply.code(404).send({ error: "Not found" });
    const { statSync } = await import("node:fs");
    const st = statSync(rec.filePath);
    if (st.size < 128) return reply.code(404).send({ error: "Recording file is empty" });
    await db.insert(recordingAccessLog).values({
      recordingId: id,
      actorType: "extension",
      actorId: a.id,
      action: "stream",
    });
    {
      const ext = rec.filePath.split(".").pop()?.toLowerCase();
      reply.header(
        "content-type",
        ext === "wav"
          ? "audio/wav"
          : ext === "ogg" || ext === "opus"
            ? "audio/ogg"
            : "application/octet-stream",
      );
    }
    reply.header("content-disposition", "inline");
    reply.header("content-length", String(st.size));
    reply.header("accept-ranges", "bytes");
    return reply.send(createReadStream(rec.filePath));
  });

  app.get("/api/v1/me/voicemails", async (req, reply) => {
    const actor = await requireExtension(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const a = actor as { id: string };
    return db
      .select()
      .from(voicemails)
      .where(eq(voicemails.extensionId, a.id))
      .orderBy(desc(voicemails.at));
  });

  app.patch("/api/v1/me/voicemails/:id", async (req, reply) => {
    const actor = await requireExtension(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const a = actor as { id: string };
    const { id } = req.params as { id: string };
    const body = z.object({ read: z.boolean() }).parse(req.body);
    await db
      .update(voicemails)
      .set({ read: body.read })
      .where(and(eq(voicemails.id, id), eq(voicemails.extensionId, a.id)));
    return { ok: true };
  });

  app.get("/api/v1/me/voicemails/:id/stream", async (req, reply) => {
    const actor = await requireExtension(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const a = actor as { id: string };
    const { id } = req.params as { id: string };
    const [vm] = await db
      .select()
      .from(voicemails)
      .where(and(eq(voicemails.id, id), eq(voicemails.extensionId, a.id)));
    if (!vm || !existsSync(vm.filePath)) return reply.code(404).send({ error: "Not found" });
    reply.header("content-type", "audio/wav");
    return reply.send(createReadStream(vm.filePath));
  });

  app.get("/api/v1/me/forwarding", async (req, reply) => {
    const actor = await requireExtension(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const a = actor as { id: string };
    return db
      .select()
      .from(extensionForwarding)
      .where(eq(extensionForwarding.extensionId, a.id));
  });

  app.put("/api/v1/me/forwarding", async (req, reply) => {
    const actor = await requireExtension(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const a = actor as { id: string };
    const rules = z.array(ForwardingRuleSchema).parse(req.body);
    const [extRow] = await db.select().from(extensions).where(eq(extensions.id, a.id)).limit(1);
    if (rules.some((r) => r.destType === "external") && !extRow?.mobileForwardAllowed) {
      return reply.code(403).send({ error: "Mobile/external forward not allowed for this extension" });
    }
    await db.delete(extensionForwarding).where(eq(extensionForwarding.extensionId, a.id));
    if (rules.length) {
      await db.insert(extensionForwarding).values(
        rules.map((r) => ({
          extensionId: a.id,
          condition: r.condition,
          ringSeconds: r.ringSeconds,
          destType: r.destType,
          destId: r.destId,
        })),
      );
    }
    const { tryReloadAsterisk } = await import("../asterisk/config-writer.js");
    void tryReloadAsterisk();
    return { ok: true };
  });

  app.put("/api/v1/me/dnd", async (req, reply) => {
    const actor = await requireExtension(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const a = actor as { id: string; number: string };
    const body = z.object({ dnd: z.boolean() }).parse(req.body);
    await db.update(extensions).set({ dnd: body.dnd }).where(eq(extensions.id, a.id));
    ari.setExtensionState(a.number, body.dnd ? "dnd" : "idle");
    const { syncDndAstDb } = await import("../lib/astdb-dnd.js");
    await syncDndAstDb(a.number, body.dnd);
    // Rebuild queues so DND agents are skipped (same as admin DND)
    const { tryReloadAsterisk } = await import("../asterisk/config-writer.js");
    void tryReloadAsterisk();
    return { ok: true, dnd: body.dnd };
  });

  app.get("/api/v1/me/directory", async (req, reply) => {
    const actor = await requireExtension(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const rows = await db.select().from(extensions).orderBy(extensions.number);
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      name: r.name,
      dnd: r.dnd,
      state: ari.extensionStates.get(r.number)?.state ?? (r.dnd ? "dnd" : "idle"),
    }));
  });

  app.patch("/api/v1/me/password", async (req, reply) => {
    const actor = await requireExtension(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const a = actor as { id: string };
    const body = z.object({ password: z.string().min(8) }).parse(req.body);
    await db
      .update(extensions)
      .set({ portalPasswordHash: scryptHash(body.password) })
      .where(eq(extensions.id, a.id));
    return { ok: true };
  });
}
