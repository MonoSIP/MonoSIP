import type { FastifyInstance } from "fastify";
import { and, desc, eq, gt, gte, inArray, like, lte, sql } from "drizzle-orm";
import {
  BlacklistSchema,
  InboundRouteSchema,
  OutboundRouteSchema,
  QueueSchema,
  RingGroupSchema,
  ScheduleSchema,
  SettingsSchema,
  TrunkCreateSchema,
  WebhookSchema,
  emptyFlow,
  FlowCreateSchema,
  FlowUpdateSchema,
  FlowJsonSchema,
} from "@dsip/shared";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  blacklist,
  callEvents,
  cdr,
  devices,
  flows,
  flowVersions,
  holidays,
  inboundRoutes,
  missedCalls,
  mohClasses,
  outboundRoutes,
  prompts,
  queueMembers,
  queues,
  recordingAccessLog,
  recordings,
  ringGroupMembers,
  ringGroups,
  scheduleRanges,
  schedules,
  settings,
  trunks,
  webhooks,
  apiKeys,
  auditLog,
  extensions,
  secrets,
} from "../db/schema.js";
import { requireAdmin } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import { decrypt, encrypt, hashToken, randomSecret } from "../lib/crypto.js";
import { tryReloadAsterisk } from "../asterisk/config-writer.js";
import { validateFlow, simulateFlow } from "../asterisk/flow-engine.js";
import { ari } from "../asterisk/ari.js";
import { config } from "../config.js";
import { dispatchWebhooks } from "../lib/webhooks.js";

async function admin(req: Parameters<typeof requireAdmin>[0], reply: Parameters<typeof requireAdmin>[1]) {
  return requireAdmin(req, reply);
}

export async function adminResourceRoutes(app: FastifyInstance) {
  // Trunks
  app.get("/api/v1/admin/trunks", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return db.select().from(trunks);
  });

  app.post("/api/v1/admin/trunks", async (req, reply) => {
    const actor = await admin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const body = TrunkCreateSchema.parse(req.body);
    const [row] = await db
      .insert(trunks)
      .values({
        name: body.name,
        host: body.host,
        port: body.port,
        transport: body.transport,
        authType: body.authType,
        username: body.username,
        secretEnc: body.secret ? encrypt(body.secret) : null,
        codecs: body.codecs,
        maxChannels: body.maxChannels,
        enabled: body.enabled,
      })
      .returning();
    await writeAudit({ actor: actor as never, action: "trunk.create", objectId: row.id });
    await tryReloadAsterisk();
    return { ...row, secretEnc: undefined };
  });

  app.patch("/api/v1/admin/trunks/:id", async (req, reply) => {
    const actor = await admin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    const body = TrunkCreateSchema.partial().parse(req.body);
    const patch: Record<string, unknown> = { ...body };
    delete patch.secret;
    if (body.secret) patch.secretEnc = encrypt(body.secret);
    // An empty body leaves `patch` empty, and drizzle throws "No values to set"
    // on an empty .set().
    if (!Object.keys(patch).length) {
      await tryReloadAsterisk();
      const [current] = await db.select().from(trunks).where(eq(trunks.id, id));
      return { ...current, secretEnc: undefined };
    }
    const [row] = await db.update(trunks).set(patch).where(eq(trunks.id, id)).returning();
    await tryReloadAsterisk();
    return { ...row, secretEnc: undefined };
  });

  app.delete("/api/v1/admin/trunks/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    await db.delete(trunks).where(eq(trunks.id, id));
    await tryReloadAsterisk();
    return { ok: true };
  });

  app.get("/api/v1/admin/trunks/:id/status", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(trunks).where(eq(trunks.id, id));
    if (!row) return reply.code(404).send({ error: "Not found" });
    const endpoint = `trunk_${id.slice(0, 8)}`;
    const { fetchTrunkEndpointStatus } = await import("../lib/ami.js");
    let live = { status: "unknown", latencyMs: null as number | null };
    try {
      live = await fetchTrunkEndpointStatus(endpoint);
    } catch (e) {
      live = { status: "unreachable", latencyMs: null };
      console.warn("[trunk-status]", (e as Error).message);
    }
    try {
      await db
        .update(trunks)
        .set({ status: live.status.slice(0, 32), latencyMs: live.latencyMs })
        .where(eq(trunks.id, id));
    } catch (e) {
      console.warn("[trunk-status] db update", (e as Error).message);
    }
    return { id, status: live.status, latencyMs: live.latencyMs, endpoint };
  });

  // Routes
  app.get("/api/v1/admin/routes/inbound", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return db.select().from(inboundRoutes).orderBy(inboundRoutes.priority);
  });

  app.post("/api/v1/admin/routes/inbound", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = InboundRouteSchema.parse(req.body);
    const [row] = await db.insert(inboundRoutes).values(body).returning();
    await tryReloadAsterisk();
    return row;
  });

  app.get("/api/v1/admin/routes/outbound", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return db.select().from(outboundRoutes);
  });

  app.post("/api/v1/admin/routes/outbound", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = OutboundRouteSchema.parse(req.body);
    const [row] = await db.insert(outboundRoutes).values(body).returning();
    await tryReloadAsterisk();
    return row;
  });

  app.patch("/api/v1/admin/routes/:kind/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { kind, id } = req.params as { kind: string; id: string };
    if (kind === "inbound") {
      const body = InboundRouteSchema.partial().parse(req.body);
      if (!Object.keys(body).length) return reply.code(400).send({ error: "No fields to update" });
      const [row] = await db.update(inboundRoutes).set(body).where(eq(inboundRoutes.id, id)).returning();
      if (!row) return reply.code(404).send({ error: "Not found" });
      await tryReloadAsterisk();
      return row;
    }
    if (kind === "outbound") {
      const body = OutboundRouteSchema.partial().parse(req.body);
      if (!Object.keys(body).length) return reply.code(400).send({ error: "No fields to update" });
      const [row] = await db.update(outboundRoutes).set(body).where(eq(outboundRoutes.id, id)).returning();
      if (!row) return reply.code(404).send({ error: "Not found" });
      await tryReloadAsterisk();
      return row;
    }
    return reply.code(400).send({ error: "kind must be inbound or outbound" });
  });

  app.delete("/api/v1/admin/routes/:kind/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { kind, id } = req.params as { kind: string; id: string };
    if (kind === "inbound") await db.delete(inboundRoutes).where(eq(inboundRoutes.id, id));
    else await db.delete(outboundRoutes).where(eq(outboundRoutes.id, id));
    await tryReloadAsterisk();
    return { ok: true };
  });

  // Blacklist
  app.get("/api/v1/admin/blacklist", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return db.select().from(blacklist);
  });

  app.post("/api/v1/admin/blacklist", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = BlacklistSchema.parse(req.body);
    const [row] = await db.insert(blacklist).values(body).returning();
    return row;
  });

  app.delete("/api/v1/admin/blacklist/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    await db.delete(blacklist).where(eq(blacklist.id, id));
    return { ok: true };
  });

  // Ring groups
  app.get("/api/v1/admin/ring-groups", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const groups = await db.select().from(ringGroups);
    const members = await db.select().from(ringGroupMembers);
    return groups.map((g) => ({
      ...g,
      memberIds: members.filter((m) => m.ringGroupId === g.id).map((m) => m.extensionId),
    }));
  });

  app.post("/api/v1/admin/ring-groups", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = RingGroupSchema.parse(req.body);
    const [row] = await db
      .insert(ringGroups)
      .values({
        name: body.name,
        number: body.number,
        strategy: body.strategy,
        ringSeconds: body.ringSeconds,
        unansweredDestType: body.unansweredDestType,
        unansweredDestId: body.unansweredDestId,
      })
      .returning();
    if (body.memberIds.length) {
      await db.insert(ringGroupMembers).values(
        body.memberIds.map((extensionId, i) => ({
          ringGroupId: row.id,
          extensionId,
          sortOrder: i,
        })),
      );
    }
    await tryReloadAsterisk();
    return row;
  });

  app.patch("/api/v1/admin/ring-groups/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = RingGroupSchema.partial().parse(req.body);
    const { memberIds, ...rest } = body;
    // A members-only PATCH leaves `rest` empty, and drizzle throws
    // "No values to set" on an empty .set().
    if (Object.keys(rest).length) {
      await db.update(ringGroups).set(rest).where(eq(ringGroups.id, id));
    }
    if (memberIds) {
      await db.delete(ringGroupMembers).where(eq(ringGroupMembers.ringGroupId, id));
      if (memberIds.length) {
        await db.insert(ringGroupMembers).values(
          memberIds.map((extensionId, i) => ({
            ringGroupId: id,
            extensionId,
            sortOrder: i,
          })),
        );
      }
    }
    await tryReloadAsterisk();
    return { ok: true };
  });

  app.delete("/api/v1/admin/ring-groups/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    await db.delete(ringGroups).where(eq(ringGroups.id, id));
    await tryReloadAsterisk();
    return { ok: true };
  });

  // Queues
  app.get("/api/v1/admin/queues", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const qs = await db.select().from(queues);
    const members = await db.select().from(queueMembers);
    return qs.map((q) => ({
      ...q,
      members: members.filter((m) => m.queueId === q.id),
    }));
  });

  app.post("/api/v1/admin/queues", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = QueueSchema.parse(req.body);
    const { members, ...rest } = body;
    const [row] = await db.insert(queues).values(rest).returning();
    if (members.length) {
      await db.insert(queueMembers).values(
        members.map((m) => ({
          queueId: row.id,
          extensionId: m.extensionId,
          penalty: m.penalty,
          paused: m.paused,
        })),
      );
    }
    await tryReloadAsterisk();
    return row;
  });

  app.patch("/api/v1/admin/queues/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = QueueSchema.partial().parse(req.body);
    const { members, ...rest } = body;
    // A members-only PATCH leaves `rest` empty, and drizzle throws
    // "No values to set" on an empty .set().
    if (Object.keys(rest).length) {
      await db.update(queues).set(rest).where(eq(queues.id, id));
    }
    if (members) {
      await db.delete(queueMembers).where(eq(queueMembers.queueId, id));
      if (members.length) {
        await db.insert(queueMembers).values(
          members.map((m) => ({
            queueId: id,
            extensionId: m.extensionId,
            penalty: m.penalty,
            paused: m.paused,
          })),
        );
      }
    }
    await tryReloadAsterisk();
    return { ok: true };
  });

  app.delete("/api/v1/admin/queues/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    await db.delete(queues).where(eq(queues.id, id));
    await tryReloadAsterisk();
    return { ok: true };
  });

  app.put("/api/v1/admin/queues/:id/members", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const MemberList = z.array(
      z.object({
        extensionId: z.string(),
        penalty: z.number().int().default(0),
        paused: z.boolean().default(false),
      }),
    );
    const raw = req.body;
    const members = Array.isArray(raw)
      ? MemberList.parse(raw)
      : MemberList.parse((raw as { members?: unknown })?.members ?? []);
    await db.delete(queueMembers).where(eq(queueMembers.queueId, id));
    if (members.length) {
      await db.insert(queueMembers).values(
        members.map((m) => ({
          queueId: id,
          extensionId: m.extensionId,
          penalty: m.penalty,
          paused: m.paused,
        })),
      );
    }
    await tryReloadAsterisk();
    return { ok: true, count: members.length };
  });

  app.post("/api/v1/admin/queues/:id/members/:ext/pause", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id, ext } = req.params as { id: string; ext: string };
    const body = z.object({ paused: z.boolean(), reason: z.string().optional() }).parse(req.body);
    await db
      .update(queueMembers)
      .set({ paused: body.paused, pauseReason: body.reason })
      .where(and(eq(queueMembers.queueId, id), eq(queueMembers.extensionId, ext)));
    await tryReloadAsterisk();
    return { ok: true };
  });

  // Schedules
  app.get("/api/v1/admin/schedules", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const rows = await db.select().from(schedules);
    const ranges = await db.select().from(scheduleRanges);
    return rows.map((s) => ({
      ...s,
      ranges: ranges.filter((r) => r.scheduleId === s.id),
    }));
  });

  app.post("/api/v1/admin/schedules", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = ScheduleSchema.parse(req.body);
    const { ranges, overrideUntil, ...rest } = body;
    const [row] = await db
      .insert(schedules)
      .values({
        ...rest,
        overrideUntil: overrideUntil ? new Date(overrideUntil) : null,
      })
      .returning();
    if (ranges.length) {
      await db.insert(scheduleRanges).values(
        ranges.map((r) => ({
          scheduleId: row.id,
          dayOfWeek: r.dayOfWeek,
          startTime: r.startTime,
          endTime: r.endTime,
          status: r.status,
        })),
      );
    }
    return row;
  });

  app.patch("/api/v1/admin/schedules/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = ScheduleSchema.partial().parse(req.body);
    const { ranges, overrideUntil, ...rest } = body;
    const patch: Record<string, unknown> = {
      ...rest,
      ...(overrideUntil !== undefined
        ? { overrideUntil: overrideUntil ? new Date(overrideUntil) : null }
        : {}),
    };
    // A ranges-only PATCH leaves nothing to set, and drizzle throws
    // "No values to set" on an empty .set().
    if (Object.keys(patch).length) {
      await db.update(schedules).set(patch).where(eq(schedules.id, id));
    }
    if (ranges) {
      await db.delete(scheduleRanges).where(eq(scheduleRanges.scheduleId, id));
      if (ranges.length) {
        await db.insert(scheduleRanges).values(
          ranges.map((r) => ({
            scheduleId: id,
            dayOfWeek: r.dayOfWeek,
            startTime: r.startTime,
            endTime: r.endTime,
            status: r.status,
          })),
        );
      }
    }
    return { ok: true };
  });

  app.put("/api/v1/admin/schedules/:id/override", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        overrideMode: z.enum(["auto", "open", "closed"]),
        overrideUntil: z.string().datetime().nullable().optional(),
      })
      .parse(req.body);
    await db
      .update(schedules)
      .set({
        overrideMode: body.overrideMode,
        overrideUntil: body.overrideUntil ? new Date(body.overrideUntil) : null,
      })
      .where(eq(schedules.id, id));
    return { ok: true };
  });

  app.get("/api/v1/admin/holidays", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return db.select().from(holidays);
  });

  app.post("/api/v1/admin/holidays", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = z
      .object({
        scheduleId: z.string().uuid().optional().nullable(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        name: z.string().min(1),
        halfDay: z.boolean().default(false),
      })
      .parse(req.body);
    const [row] = await db
      .insert(holidays)
      .values({
        scheduleId: body.scheduleId ?? null,
        date: body.date,
        name: body.name,
        halfDay: body.halfDay,
      })
      .returning();
    return row;
  });

  app.delete("/api/v1/admin/holidays/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    await db.delete(holidays).where(eq(holidays.id, id));
    return { ok: true };
  });

  app.delete("/api/v1/admin/schedules/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    await db.delete(schedules).where(eq(schedules.id, id));
    return { ok: true };
  });

  // Flows
  app.get("/api/v1/admin/flows", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return db.select().from(flows);
  });

  app.post("/api/v1/admin/flows", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = FlowCreateSchema.parse(req.body);
    const num = body.extensionNumber ?? null;
    if (num) {
      const clash = await db.select().from(flows).where(eq(flows.extensionNumber, num)).limit(1);
      if (clash.length) return reply.code(409).send({ error: `Extension ${num} already used by another flow` });
      const [extClash] = await db.select().from(extensions).where(eq(extensions.number, num)).limit(1);
      if (extClash) return reply.code(409).send({ error: `Extension ${num} is a SIP extension` });
      const [qClash] = await db.select().from(queues).where(eq(queues.number, num)).limit(1);
      if (qClash) return reply.code(409).send({ error: `Extension ${num} is a queue` });
      const [rgClash] = await db.select().from(ringGroups).where(eq(ringGroups.number, num)).limit(1);
      if (rgClash) return reply.code(409).send({ error: `Extension ${num} is a ring group` });
    }
    const [row] = await db
      .insert(flows)
      .values({
        name: body.name,
        extensionNumber: num,
        draftJson: emptyFlow(),
      })
      .returning();
    if (num) await tryReloadAsterisk();
    return row;
  });

  app.patch("/api/v1/admin/flows/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = FlowUpdateSchema.parse(req.body);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.extensionNumber !== undefined) {
      const num = body.extensionNumber;
      if (num) {
        const clash = await db.select().from(flows).where(eq(flows.extensionNumber, num));
        if (clash.some((f) => f.id !== id)) {
          return reply.code(409).send({ error: `Extension ${num} already used by another flow` });
        }
        const [extClash] = await db.select().from(extensions).where(eq(extensions.number, num)).limit(1);
        if (extClash) return reply.code(409).send({ error: `Extension ${num} is a SIP extension` });
        const [qClash] = await db.select().from(queues).where(eq(queues.number, num)).limit(1);
        if (qClash) return reply.code(409).send({ error: `Extension ${num} is a queue` });
        const [rgClash] = await db.select().from(ringGroups).where(eq(ringGroups.number, num)).limit(1);
        if (rgClash) return reply.code(409).send({ error: `Extension ${num} is a ring group` });
      }
      patch.extensionNumber = num;
    }
    const [row] = await db.update(flows).set(patch).where(eq(flows.id, id)).returning();
    if (!row) return reply.code(404).send({ error: "Not found" });
    if (body.extensionNumber !== undefined) await tryReloadAsterisk();
    return row;
  });

  app.get("/api/v1/admin/flows/:id/draft", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(flows).where(eq(flows.id, id));
    if (!row) return reply.code(404).send({ error: "Not found" });
    return row;
  });

  app.put("/api/v1/admin/flows/:id/draft", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const draft = FlowJsonSchema.parse(req.body);
    await db
      .update(flows)
      .set({ draftJson: draft, updatedAt: new Date() })
      .where(eq(flows.id, id));
    return { ok: true };
  });

  app.post("/api/v1/admin/flows/:id/validate", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(flows).where(eq(flows.id, id));
    if (!row) return reply.code(404).send({ error: "Not found" });
    const errors = validateFlow(row.draftJson as never);
    return { ok: errors.length === 0, errors };
  });

  app.post("/api/v1/admin/flows/:id/publish", async (req, reply) => {
    const actor = await admin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(flows).where(eq(flows.id, id));
    if (!row) return reply.code(404).send({ error: "Not found" });
    const errors = validateFlow(row.draftJson as never);
    if (errors.length) return reply.code(400).send({ errors });
    const versions = await db
      .select()
      .from(flowVersions)
      .where(eq(flowVersions.flowId, id))
      .orderBy(desc(flowVersions.version));
    const next = (versions[0]?.version ?? 0) + 1;
    const [ver] = await db
      .insert(flowVersions)
      .values({ flowId: id, version: next, json: row.draftJson })
      .returning();
    await db.update(flows).set({ publishedVersionId: ver.id }).where(eq(flows.id, id));
    await tryReloadAsterisk();
    await writeAudit({
      actor: actor as never,
      action: "flow.publish",
      objectId: id,
      after: { version: next },
    });
    return { version: next, versionId: ver.id };
  });

  app.get("/api/v1/admin/flows/:id/versions", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    return db
      .select()
      .from(flowVersions)
      .where(eq(flowVersions.flowId, id))
      .orderBy(desc(flowVersions.version));
  });

  app.post("/api/v1/admin/flows/:id/rollback", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z.object({ versionId: z.string().uuid() }).parse(req.body);
    const [ver] = await db
      .select()
      .from(flowVersions)
      .where(eq(flowVersions.id, body.versionId));
    if (!ver) return reply.code(404).send({ error: "Not found" });
    await db
      .update(flows)
      .set({ draftJson: ver.json, publishedVersionId: ver.id, updatedAt: new Date() })
      .where(eq(flows.id, id));
    return { ok: true };
  });

  app.post("/api/v1/admin/flows/:id/simulate", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        caller: z.string(),
        did: z.string(),
        time: z.string().optional(),
        dtmfSequence: z.array(z.string()).optional(),
        mockApiResponses: z.record(z.unknown()).optional(),
      })
      .parse(req.body);
    const [row] = await db.select().from(flows).where(eq(flows.id, id));
    if (!row) return reply.code(404).send({ error: "Not found" });
    const steps = await simulateFlow(row.draftJson as never, body);
    return { steps };
  });

  app.post("/api/v1/admin/flows/test-http", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = z
      .object({
        method: z.string().default("GET"),
        url: z.string().url(),
        headers: z.record(z.string()).optional(),
        body: z.string().optional(),
        timeoutMs: z.number().max(10000).default(3000),
      })
      .parse(req.body);
    try {
      const res = await fetch(body.url, {
        method: body.method,
        headers: body.headers,
        body: body.body,
        signal: AbortSignal.timeout(body.timeoutMs),
      });
      const text = await res.text();
      return { status: res.status, body: text.slice(0, 8000) };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  // Prompts / MOH / Piper TTS
  app.get("/api/v1/admin/prompts", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return db.select().from(prompts);
  });

  app.get("/api/v1/admin/tts/status", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { ttsHealth } = await import("../lib/tts.js");
    return ttsHealth();
  });

  app.post("/api/v1/admin/prompts", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = z
      .object({
        name: z.string(),
        language: z.enum(["en", "tr"]).default("en"),
        ttsText: z.string().optional(),
        filePath: z.string().optional(),
        /** base64 audio (wav) — written under Asterisk sounds/dsip */
        audioBase64: z.string().optional(),
        /** Generate WAV via Piper TTS from ttsText */
        synthesize: z.boolean().optional(),
        lengthScale: z.number().min(0.7).max(1.6).optional(),
      })
      .parse(req.body);
    let filePath = body.filePath ?? null;
    const id = crypto.randomUUID();
    if (body.audioBase64) {
      const { writePromptWav } = await import("../lib/tts.js");
      const written = await writePromptWav(id, Buffer.from(body.audioBase64, "base64"));
      filePath = written.filePath;
    } else if (body.synthesize && body.ttsText?.trim()) {
      const { synthesizeSpeech, writePromptWav } = await import("../lib/tts.js");
      const wav = await synthesizeSpeech(
        body.ttsText,
        body.language,
        body.lengthScale ?? 1.05,
      );
      const written = await writePromptWav(id, wav);
      filePath = written.filePath;
    }
    const [row] = await db
      .insert(prompts)
      .values({
        id,
        name: body.name,
        language: body.language,
        ttsText: body.ttsText,
        filePath,
      })
      .returning();
    return row;
  });

  app.post("/api/v1/admin/prompts/:id/synthesize", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        text: z.string().optional(),
        language: z.enum(["en", "tr"]).optional(),
        lengthScale: z.number().min(0.7).max(1.6).optional(),
      })
      .parse(req.body ?? {});
    const [row] = await db.select().from(prompts).where(eq(prompts.id, id));
    if (!row) return reply.code(404).send({ error: "Not found" });
    const text = (body.text ?? row.ttsText ?? "").trim();
    if (!text) return reply.code(400).send({ error: "No text to synthesize" });
    const language = (body.language ?? (row.language === "tr" ? "tr" : "en")) as "en" | "tr";
    try {
      const { synthesizeSpeech, writePromptWav } = await import("../lib/tts.js");
      const wav = await synthesizeSpeech(text, language, body.lengthScale ?? 1.05);
      const written = await writePromptWav(id, wav);
      await db
        .update(prompts)
        .set({
          filePath: written.filePath,
          ttsText: text,
          language,
        })
        .where(eq(prompts.id, id));
      return { ok: true, filePath: written.filePath, media: written.media, language };
    } catch (e) {
      return reply.code(503).send({ error: (e as Error).message });
    }
  });

  function fieldValue(
    fields: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined {
    const raw = fields?.[key];
    if (!raw) return undefined;
    const part = Array.isArray(raw) ? raw[0] : raw;
    if (part && typeof part === "object" && "value" in part) {
      return String((part as { value: unknown }).value);
    }
    if (typeof part === "string") return part;
    return undefined;
  }

  /** Multipart audio upload — create new prompt. */
  app.post("/api/v1/admin/prompts/upload", async (req, reply) => {
    const actor = await admin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    // A non-multipart body makes req.file() throw; treat it as a missing file
    // so the caller gets 400 instead of an unhandled 500.
    const file = await req
      .file({ limits: { fileSize: 25 * 1024 * 1024 } })
      .catch(() => null);
    if (!file) return reply.code(400).send({ error: "audio file required (field: file)" });
    const buf = await file.toBuffer();
    if (buf.length < 44) return reply.code(400).send({ error: "File too small" });
    const { writePromptWav, extFromUpload, isLikelyWav } = await import("../lib/tts.js");
    const ext = extFromUpload(file.filename, file.mimetype, buf);
    if (ext === "wav" && !isLikelyWav(buf)) {
      return reply.code(400).send({
        error: "Not a valid WAV file. Prefer mono WAV (8–22 kHz) for Asterisk.",
      });
    }
    const fields = file.fields as Record<string, unknown> | undefined;
    const name =
      fieldValue(fields, "name") ||
      file.filename?.replace(/\.[^.]+$/, "") ||
      "Uploaded prompt";
    const language = fieldValue(fields, "language") === "en" ? "en" : "tr";
    const ttsText = fieldValue(fields, "ttsText") ?? null;
    const id = crypto.randomUUID();
    const written = await writePromptWav(id, buf, ext);
    const [row] = await db
      .insert(prompts)
      .values({
        id,
        name,
        language,
        ttsText,
        filePath: written.filePath,
      })
      .returning();
    await writeAudit({
      actor: actor as never,
      action: "prompt.upload",
      objectType: "prompt",
      objectId: id,
      ip: req.ip,
    });
    return row;
  });

  app.post("/api/v1/admin/prompts/:id/upload", async (req, reply) => {
    const actor = await admin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    const [existing] = await db.select().from(prompts).where(eq(prompts.id, id));
    if (!existing) return reply.code(404).send({ error: "Not found" });
    // A non-multipart body makes req.file() throw; treat it as a missing file
    // so the caller gets 400 instead of an unhandled 500.
    const file = await req
      .file({ limits: { fileSize: 25 * 1024 * 1024 } })
      .catch(() => null);
    if (!file) return reply.code(400).send({ error: "audio file required (field: file)" });
    const buf = await file.toBuffer();
    if (buf.length < 44) return reply.code(400).send({ error: "File too small" });
    const { writePromptWav, extFromUpload, isLikelyWav } = await import("../lib/tts.js");
    const ext = extFromUpload(file.filename, file.mimetype, buf);
    if (ext === "wav" && !isLikelyWav(buf)) {
      return reply.code(400).send({
        error: "Not a valid WAV file. Prefer mono WAV (8–22 kHz) for Asterisk.",
      });
    }
    const written = await writePromptWav(id, buf, ext);
    await db.update(prompts).set({ filePath: written.filePath }).where(eq(prompts.id, id));
    await writeAudit({
      actor: actor as never,
      action: "prompt.upload",
      objectType: "prompt",
      objectId: id,
      ip: req.ip,
    });
    return { ok: true, filePath: written.filePath, media: written.media };
  });

  app.get("/api/v1/admin/prompts/:id/stream", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(prompts).where(eq(prompts.id, id));
    if (!row?.filePath) return reply.code(404).send({ error: "No audio" });
    const { createReadStream, existsSync } = await import("node:fs");
    if (!existsSync(row.filePath)) return reply.code(404).send({ error: "File missing" });
    const ext = row.filePath.split(".").pop()?.toLowerCase() ?? "wav";
    reply.header("content-type", ext === "wav" ? "audio/wav" : "application/octet-stream");
    return reply.send(createReadStream(row.filePath));
  });

  app.post("/api/v1/internal/queue-callback", async (req, reply) => {
    const { requireInternalSecret } = await import("../lib/internal-auth.js");
    if (!requireInternalSecret(req, reply)) return;
    const body = z
      .object({ queue: z.string(), number: z.string(), place: z.coerce.number().int().optional() })
      .parse(req.body);
    const target = `qcb:${body.queue}`;
    // Dedupe: skip if same number+queue already pending/calling
    const existing = await db.select().from(missedCalls);
    const dup = existing.find(
      (m) =>
        m.number === body.number &&
        m.target === target &&
        (m.status === "pending" || m.status === "calling"),
    );
    if (dup) return reply.send({ ok: true, id: dup.id, deduped: true });
    // Stay pending — job originates when place is due (agents free, queue empty).
    // Place is stored in callbackCallId as `place:N` until dial starts.
    const { encodeCallbackPlace } = await import("../asterisk/flow-logic.js");
    const [row] = await db
      .insert(missedCalls)
      .values({
        number: body.number,
        target,
        status: "pending",
        callbackCallId: encodeCallbackPlace(body.place) ?? undefined,
      })
      .returning();
    console.log(
      `[qcb] queued callback ${body.number} → ${body.queue} place=${body.place ?? "?"}`,
    );
    return reply.send({ ok: true, id: row.id, place: body.place ?? null });
  });

  /** Dialplan peer-to-peer / queue Dial completion → CDR row */
  app.post("/api/v1/internal/cdr", async (req, reply) => {
    const { requireInternalSecret } = await import("../lib/internal-auth.js");
    if (!requireInternalSecret(req, reply)) return;
    const body = z
      .object({
        callId: z.string().min(1),
        caller: z.string().optional().default(""),
        callee: z.string().optional().default(""),
        disposition: z.string().optional().default("NOANSWER"),
        billsec: z.coerce.number().int().min(0).optional().default(0),
        duration: z.coerce.number().int().min(0).optional(),
        direction: z.enum(["inbound", "outbound", "internal"]).optional().default("internal"),
        queueNumber: z.string().optional(),
        extension: z.string().optional(),
        mos: z.union([z.coerce.number(), z.string()]).optional(),
        jitter: z.union([z.coerce.number(), z.string()]).optional(),
        packetLoss: z.union([z.coerce.number(), z.string()]).optional(),
      })
      .parse(req.body);
    // Map Asterisk DIALSTATUS / QUEUESTATUS → CDR disposition
    const dialMap: Record<string, string> = {
      ANSWER: "ANSWERED",
      ANSWERED: "ANSWERED",
      NOANSWER: "NOANSWER",
      BUSY: "BUSY",
      CANCEL: "NOANSWER",
      CHANUNAVAIL: "FAILED",
      CONGESTION: "FAILED",
      DONTCALL: "FAILED",
      TORTURE: "FAILED",
      INVALIDARGS: "FAILED",
      TIMEOUT: "NOANSWER",
      FULL: "FAILED",
      JOINEMPTY: "FAILED",
      LEAVEEMPTY: "FAILED",
      CONTINUE: "ANSWERED",
    };
    const disposition = dialMap[body.disposition.toUpperCase()] ?? body.disposition.toUpperCase();
    const parseQos = (v: unknown): number | null => {
      if (v === undefined || v === null || v === "") return null;
      const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const qosPatch = {
      mos: parseQos(body.mos),
      jitter: parseQos(body.jitter),
      packetLoss: parseQos(body.packetLoss),
    };
    const applyQos = async () => {
      if (qosPatch.mos == null && qosPatch.jitter == null && qosPatch.packetLoss == null) return;
      await db
        .update(cdr)
        .set({
          ...(qosPatch.mos != null ? { mos: qosPatch.mos } : {}),
          ...(qosPatch.jitter != null ? { jitter: qosPatch.jitter } : {}),
          ...(qosPatch.packetLoss != null ? { packetLoss: qosPatch.packetLoss } : {}),
        })
        .where(eq(cdr.callId, body.callId));
    };
    const { cdrStart, cdrAnswered, cdrEnd } = await import("../lib/cdr.js");
    const existing = await db.select().from(cdr).where(eq(cdr.callId, body.callId)).limit(1);
    if (existing[0]) {
      // Always prefer dialplan durations (redirect left Stasis before talk time)
      if (disposition === "ANSWERED" || body.billsec > 0) await cdrAnswered(body.callId);
      if (!existing[0].endedAt) {
        await cdrEnd(body.callId, disposition, {
          billsec: body.billsec,
          duration: body.duration ?? body.billsec,
        });
      } else {
        await db
          .update(cdr)
          .set({
            disposition,
            billsec: body.billsec,
            duration: body.duration ?? body.billsec,
            ...(disposition === "ANSWERED" || body.billsec > 0
              ? { answeredAt: existing[0].answeredAt ?? new Date() }
              : {}),
          })
          .where(eq(cdr.callId, body.callId));
      }
      await applyQos();
      if (body.queueNumber) {
        await db
          .update(cdr)
          .set({ queueNumber: body.queueNumber })
          .where(eq(cdr.callId, body.callId));
      }
      // Queue answering agent (MEMBERINTERFACE → extension) for portal call list
      const agentExt = (body.extension ?? "").replace(/\D/g, "");
      if (agentExt) {
        await db
          .update(cdr)
          .set({ extensionNumber: agentExt })
          .where(eq(cdr.callId, body.callId));
      }
      if (disposition === "ANSWERED" && body.callee) {
        try {
          await db
            .update(missedCalls)
            .set({ status: "returned" })
            .where(
              and(eq(missedCalls.number, body.callee), eq(missedCalls.status, "pending")),
            );
        } catch {
          /* ignore */
        }
      }
      return { ok: true, updated: true };
    }
    const agentExtNew = (body.extension ?? "").replace(/\D/g, "");
    await cdrStart({
      callId: body.callId,
      direction: body.direction,
      caller: body.caller,
      callee: body.callee,
      extensionNumber: agentExtNew || body.caller || undefined,
      queueNumber: body.queueNumber,
    });
    if (disposition === "ANSWERED" || body.billsec > 0) await cdrAnswered(body.callId);
    await cdrEnd(body.callId, disposition);
    await applyQos();
    // Prefer dialplan-provided durations when present
    if (body.duration != null || body.billsec > 0 || agentExtNew) {
      await db
        .update(cdr)
        .set({
          ...(body.duration != null || body.billsec > 0
            ? { duration: body.duration ?? body.billsec, billsec: body.billsec }
            : {}),
          ...(agentExtNew ? { extensionNumber: agentExtNew } : {}),
        })
        .where(eq(cdr.callId, body.callId));
    }
    // Agent returned a missed call by dialing that number successfully
    if (disposition === "ANSWERED" && body.callee) {
      try {
        await db
          .update(missedCalls)
          .set({ status: "returned" })
          .where(
            and(
              eq(missedCalls.number, body.callee),
              eq(missedCalls.status, "pending"),
            ),
          );
      } catch {
        /* ignore */
      }
    }
    return { ok: true, created: true };
  });

  /** Dialplan MixMonitor hangup → register recording row for panel/portal */
  app.post("/api/v1/internal/recording", async (req, reply) => {
    const { requireInternalSecret } = await import("../lib/internal-auth.js");
    if (!requireInternalSecret(req, reply)) return;
    const body = z
      .object({
        callId: z.string().min(1),
        file: z.string().min(1),
        extension: z.string().optional(),
        duration: z.coerce.number().int().min(0).optional(),
      })
      .parse(req.body);
    const { existsSync, statSync } = await import("node:fs");
    const { wavDurationSeconds, deleteRecordingFile } = await import("../lib/recording-files.js");
    // Asterisk spool and API share the recordings volume (spool ↔ /data/recordings)
    const candidates = [
      body.file,
      body.file.replace("/var/spool/asterisk/recording/", "/data/recordings/"),
      body.file.replace("/data/recordings/", "/var/spool/asterisk/recording/"),
    ];
    const filePath = candidates.find((p) => existsSync(p)) ?? body.file;
    if (!existsSync(filePath)) {
      console.warn(`[recording] file missing: ${body.file}`);
      return reply.code(400).send({ error: "recording file missing" });
    }
    let sizeBytes = 0;
    try {
      sizeBytes = statSync(filePath).size;
    } catch {
      /* ignore */
    }
    const fromWav = wavDurationSeconds(filePath);
    const duration = Math.max(body.duration ?? 0, fromWav);
    // Do not keep empty / 0-second recordings
    if (duration < 1 || sizeBytes < 500) {
      deleteRecordingFile(filePath);
      const existing = await db
        .select()
        .from(recordings)
        .where(eq(recordings.callId, body.callId))
        .limit(1);
      if (existing[0]) {
        await db.delete(recordings).where(eq(recordings.id, existing[0].id));
        await db
          .update(cdr)
          .set({ recordingId: null })
          .where(eq(cdr.callId, body.callId));
      }
      console.log(`[recording] discarded 0s callId=${body.callId} size=${sizeBytes}`);
      return { ok: true, discarded: true, reason: "zero_duration" };
    }
    const apiPath = filePath.includes("/data/recordings/")
      ? filePath
      : filePath.replace("/var/spool/asterisk/recording/", "/data/recordings/");
    const existing = await db
      .select()
      .from(recordings)
      .where(eq(recordings.callId, body.callId))
      .limit(1);
    if (existing[0]) {
      await db
        .update(recordings)
        .set({ filePath: apiPath, sizeBytes, duration })
        .where(eq(recordings.id, existing[0].id));
      return { ok: true, id: existing[0].id, updated: true, duration };
    }
    const [row] = await db
      .insert(recordings)
      .values({
        callId: body.callId,
        filePath: apiPath,
        duration,
        sizeBytes,
      })
      .returning();
    if (body.callId) {
      await db
        .update(cdr)
        .set({ recordingId: row.id })
        .where(eq(cdr.callId, body.callId));
    }
    return { ok: true, id: row.id, duration };
  });

  /** Phone *78 / *79 → sync Postgres + AstDB + queue membership reload */
  app.post("/api/v1/internal/dnd", async (req, reply) => {
    const { requireInternalSecret } = await import("../lib/internal-auth.js");
    if (!requireInternalSecret(req, reply)) return;
    const body = z.object({ extension: z.string().min(1), dnd: z.boolean() }).parse(req.body);
    const [ext] = await db
      .select()
      .from(extensions)
      .where(eq(extensions.number, body.extension))
      .limit(1);
    if (!ext) return reply.code(404).send({ error: "extension not found" });
    await db.update(extensions).set({ dnd: body.dnd }).where(eq(extensions.id, ext.id));
    const { syncDndAstDb } = await import("../lib/astdb-dnd.js");
    await syncDndAstDb(ext.number, body.dnd);
    ari.setExtensionState(ext.number, body.dnd ? "dnd" : "idle");
    void tryReloadAsterisk();
    return { ok: true, extension: ext.number, dnd: body.dnd };
  });

  /** Dialplan NOANSWER → missed + optional SMTP */
  app.post("/api/v1/internal/missed", async (req, reply) => {
    const { requireInternalSecret } = await import("../lib/internal-auth.js");
    if (!requireInternalSecret(req, reply)) return;
    const body = z.object({ caller: z.string(), target: z.string() }).parse(req.body);
    const [row] = await db
      .insert(missedCalls)
      .values({
        number: body.caller,
        target: body.target,
        status: "pending",
      })
      .returning();
    void dispatchWebhooks("call.missed", { caller: body.caller, target: body.target });
    const { emitPortalEvent } = await import("../lib/live-events.js");
    emitPortalEvent("missed.new", {
      id: row.id,
      caller: body.caller,
      target: body.target,
    });
    try {
      const [srow] = await db.select().from(settings).limit(1);
      const s = SettingsSchema.parse(srow?.data ?? {});
      if (s.smtpHost && s.smtpTo) {
        const { sendSmtpMail } = await import("../lib/smtp.js");
        await sendSmtpMail(
          {
            host: s.smtpHost,
            port: s.smtpPort,
            user: s.smtpUser,
            password: s.smtpPassword,
            from: s.emailFrom,
            to: s.smtpTo,
          },
          `DSip missed call from ${body.caller}`,
          `Missed call\nCaller: ${body.caller}\nTarget: ${body.target}\nAt: ${new Date().toISOString()}`,
        );
      }
    } catch (e) {
      console.warn("[missed] email failed", (e as Error).message);
    }
    return reply.send({ ok: true, id: row.id });
  });

  /** Dialplan Record() → portal voicemail inbox */
  app.post("/api/v1/internal/voicemail", async (req, reply) => {
    const { requireInternalSecret } = await import("../lib/internal-auth.js");
    if (!requireInternalSecret(req, reply)) return;
    const body = z
      .object({
        extension: z.string(),
        caller: z.string().optional(),
        file: z.string(),
      })
      .parse(req.body);
    const [ext] = await db
      .select()
      .from(extensions)
      .where(eq(extensions.number, body.extension))
      .limit(1);
    if (!ext) return reply.code(404).send({ error: "extension not found" });
    const { existsSync } = await import("node:fs");
    if (!existsSync(body.file)) {
      return reply.code(400).send({ error: "recording file missing" });
    }
    const { voicemails } = await import("../db/schema.js");
    const [row] = await db
      .insert(voicemails)
      .values({
        extensionId: ext.id,
        caller: body.caller ?? "unknown",
        filePath: body.file,
        read: false,
      })
      .returning();
    if (ext.email) {
      try {
        const [srow] = await db.select().from(settings).where(eq(settings.id, 1));
        const s = SettingsSchema.parse(srow?.data ?? {});
        if (s.smtpHost) {
          const { sendSmtpMail } = await import("../lib/smtp.js");
          const fname = body.file.split("/").pop() ?? "voicemail.wav";
          await sendSmtpMail(
            {
              host: s.smtpHost,
              port: s.smtpPort,
              user: s.smtpUser,
              password: s.smtpPassword,
              from: s.emailFrom,
              to: ext.email,
            },
            `DSip voicemail for ${ext.number}`,
            `New voicemail\nFrom: ${body.caller ?? "unknown"}\nExt: ${ext.number}\nAt: ${new Date().toISOString()}`,
            [{ filename: fname, contentType: "audio/wav", path: body.file }],
          );
        }
      } catch (e) {
        console.warn("[vm] email failed", (e as Error).message);
      }
    }
    const { emitPortalEvent } = await import("../lib/live-events.js");
    emitPortalEvent("voicemail.new", {
      id: row.id,
      extension: ext.number,
      caller: body.caller ?? "unknown",
    });
    return { ok: true, id: row.id };
  });

  app.get("/api/v1/admin/moh", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const rows = await db.select().from(mohClasses);
    // Reconcile DB file list with disk (legacy rows may list .mp3 after convert to .wav)
    const { mohClassDir } = await import("../lib/moh-audio.js");
    const { existsSync, readdirSync } = await import("node:fs");
    const out = [];
    for (const row of rows) {
      const dir = mohClassDir(row.name);
      let files = Array.isArray(row.files) ? [...(row.files as string[])] : [];
      if (existsSync(dir)) {
        const onDisk = readdirSync(dir).filter((f) => !f.startsWith(".") && /\.(wav|mp3|ogg)$/i.test(f));
        const healed = files
          .map((f) => {
            if (onDisk.includes(f)) return f;
            const wav = f.replace(/\.[^.]+$/, ".wav");
            return onDisk.includes(wav) ? wav : null;
          })
          .filter((f): f is string => !!f);
        for (const f of onDisk) {
          if (!healed.includes(f)) healed.push(f);
        }
        if (JSON.stringify(healed) !== JSON.stringify(files)) {
          files = healed;
          await db.update(mohClasses).set({ files }).where(eq(mohClasses.id, row.id));
        }
      }
      out.push({ ...row, files });
    }
    return out;
  });

  app.post("/api/v1/admin/moh", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = z.object({ name: z.string(), files: z.array(z.string()).default([]) }).parse(req.body);
    const [row] = await db.insert(mohClasses).values(body).returning();
    await tryReloadAsterisk();
    return row;
  });

  app.post("/api/v1/admin/moh/:id/upload", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(mohClasses).where(eq(mohClasses.id, id));
    if (!row) return reply.code(404).send({ error: "Not found" });
    // A non-multipart body makes req.file() throw; treat it as a missing file
    // so the caller gets 400 instead of an unhandled 500.
    const file = await req
      .file({ limits: { fileSize: 40 * 1024 * 1024 } })
      .catch(() => null);
    if (!file) return reply.code(400).send({ error: "file required" });
    const buf = await file.toBuffer();
    if (buf.length < 64) return reply.code(400).send({ error: "File too small" });
    try {
      const { writeMohAudioFile } = await import("../lib/moh-audio.js");
      const written = await writeMohAudioFile(row.name, file.filename || "moh.wav", buf);
      const files = Array.isArray(row.files) ? [...(row.files as string[])] : [];
      // Drop prior non-wav twin of same basename if present
      const base = written.file.replace(/\.wav$/i, "");
      const cleaned = files.filter((f) => f !== written.file && !f.startsWith(`${base}.`));
      cleaned.push(written.file);
      await db.update(mohClasses).set({ files: cleaned }).where(eq(mohClasses.id, id));
      await tryReloadAsterisk();
      return {
        ok: true,
        file: written.file,
        files: cleaned,
        converted: written.converted,
      };
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
  });

  /** Preview MOH file in browser (credentials cookie). */
  app.get("/api/v1/admin/moh/:id/files/:filename/stream", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id, filename } = req.params as { id: string; filename: string };
    const decoded = decodeURIComponent(filename);
    const safe = decoded.replace(/[/\\]/g, "");
    if (!safe) return reply.code(400).send({ error: "Invalid filename" });
    const [row] = await db.select().from(mohClasses).where(eq(mohClasses.id, id));
    if (!row) return reply.code(404).send({ error: "Not found" });
    const { mohClassDir } = await import("../lib/moh-audio.js");
    const { createReadStream, existsSync, readdirSync } = await import("node:fs");
    const path = await import("node:path");
    const dir = mohClassDir(row.name);
    // Prefer exact name; fall back to converted .wav (uploads always store 8 kHz WAV)
    const candidates = [
      path.join(dir, safe),
      path.join(dir, safe.replace(/\.[^.]+$/, ".wav")),
    ];
    let filePath = candidates.find((p) => existsSync(p));
    if (!filePath && existsSync(dir)) {
      // Legacy DB row may list .mp3 while only basename.wav exists
      const base = safe.replace(/\.[^.]+$/, "").toLowerCase();
      const hit = readdirSync(dir).find(
        (f) => f.toLowerCase() === `${base}.wav` || f.toLowerCase() === safe.toLowerCase(),
      );
      if (hit) filePath = path.join(dir, hit);
    }
    if (!filePath) return reply.code(404).send({ error: "File missing — re-upload the MOH track" });
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "wav";
    const ctype =
      ext === "wav"
        ? "audio/wav"
        : ext === "mp3"
          ? "audio/mpeg"
          : ext === "ogg"
            ? "audio/ogg"
            : "application/octet-stream";
    reply.header("content-type", ctype);
    reply.header("accept-ranges", "bytes");
    reply.header("cache-control", "private, max-age=60");
    return reply.send(createReadStream(filePath));
  });

  app.delete("/api/v1/admin/moh/:id/files/:filename", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id, filename } = req.params as { id: string; filename: string };
    const safe = filename.replace(/[/\\]/g, "");
    const [row] = await db.select().from(mohClasses).where(eq(mohClasses.id, id));
    if (!row) return reply.code(404).send({ error: "Not found" });
    const { mohClassDir } = await import("../lib/moh-audio.js");
    const { unlink } = await import("node:fs/promises");
    const path = await import("node:path");
    const filePath = path.join(mohClassDir(row.name), safe);
    await unlink(filePath).catch(() => undefined);
    const files = (Array.isArray(row.files) ? (row.files as string[]) : []).filter((f) => f !== safe);
    await db.update(mohClasses).set({ files }).where(eq(mohClasses.id, id));
    await tryReloadAsterisk();
    return { ok: true, files };
  });

  // CDR / recordings / missed
  app.get("/api/v1/admin/cdr", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const q = req.query as {
      from?: string;
      to?: string;
      caller?: string;
      disposition?: string;
      direction?: string;
      limit?: string;
    };
    const clauses = [];
    if (q.from) clauses.push(gte(cdr.startedAt, new Date(q.from)));
    if (q.to) clauses.push(lte(cdr.startedAt, new Date(q.to)));
    if (q.caller) clauses.push(like(cdr.caller, `%${q.caller}%`));
    if (q.disposition) clauses.push(eq(cdr.disposition, q.disposition));
    if (q.direction) clauses.push(eq(cdr.direction, q.direction));
    const lim = Math.min(Number(q.limit ?? 500), 2000);
    const rows = clauses.length
      ? await db
          .select()
          .from(cdr)
          .where(and(...clauses))
          .orderBy(desc(cdr.startedAt))
          .limit(lim)
      : await db.select().from(cdr).orderBy(desc(cdr.startedAt)).limit(lim);
    if (!rows.length) return rows;
    const callIds = rows.map((r) => r.callId);
    const recs = await db
      .select({ id: recordings.id, callId: recordings.callId })
      .from(recordings)
      .where(inArray(recordings.callId, callIds));
    const byCall = new Map(recs.map((r) => [r.callId, r.id]));
    return rows.map((r) => ({ ...r, recordingId: byCall.get(r.callId) ?? null }));
  });

  app.get("/api/v1/admin/cdr/export", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const q = req.query as { from?: string; to?: string };
    let rows;
    if (q.from || q.to) {
      const clauses = [];
      if (q.from) clauses.push(gte(cdr.startedAt, new Date(q.from)));
      if (q.to) clauses.push(lte(cdr.startedAt, new Date(q.to)));
      rows = await db
        .select()
        .from(cdr)
        .where(and(...clauses))
        .orderBy(desc(cdr.startedAt))
        .limit(5000);
    } else {
      rows = await db.select().from(cdr).orderBy(desc(cdr.startedAt)).limit(5000);
    }
    const header =
      "callId,startedAt,direction,caller,callee,disposition,duration,billsec,dnd\n";
    const csv =
      header +
      rows
        .map(
          (r) =>
            `${r.callId},${r.startedAt.toISOString()},${r.direction},${r.caller},${r.callee},${r.disposition},${r.duration},${r.billsec},${r.dndFlag ? 1 : 0}`,
        )
        .join("\n");
    reply.header("content-type", "text/csv");
    reply.header("content-disposition", 'attachment; filename="cdr.csv"');
    return csv;
  });

  app.get("/api/v1/admin/cdr/:id/timeline", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(cdr).where(eq(cdr.id, id)).limit(1);
    if (!row) return reply.code(404).send({ error: "Not found" });
    const events = await db
      .select()
      .from(callEvents)
      .where(eq(callEvents.callId, row.callId))
      .orderBy(callEvents.at);
    return { cdr: row, events };
  });

  app.get("/api/v1/admin/recordings", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return db
      .select()
      .from(recordings)
      .where(gt(recordings.duration, 0))
      .orderBy(desc(recordings.createdAt))
      .limit(200);
  });

  app.get("/api/v1/admin/recordings/:id/stream", async (req, reply) => {
    const actor = await admin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    const [rec] = await db.select().from(recordings).where(eq(recordings.id, id));
    if (!rec) return reply.code(404).send({ error: "Not found" });
    const { createReadStream, existsSync, statSync } = await import("node:fs");
    if (!existsSync(rec.filePath)) return reply.code(404).send({ error: "File missing" });
    const st = statSync(rec.filePath);
    if (st.size < 128) return reply.code(404).send({ error: "Recording file is empty" });
    await db.insert(recordingAccessLog).values({
      recordingId: id,
      actorType: "admin",
      actorId: (actor as { id: string }).id,
      action: "stream",
    });
    {
      const { audioContentType } = await import("../lib/audio-mime.js");
      reply.header("content-type", audioContentType(rec.filePath));
    }
    reply.header("content-length", String(st.size));
    reply.header("accept-ranges", "bytes");
    reply.header("cache-control", "private, max-age=60");
    return reply.send(createReadStream(rec.filePath));
  });

  app.get("/api/v1/admin/recordings/:id/download", async (req, reply) => {
    const actor = await admin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    const [rec] = await db.select().from(recordings).where(eq(recordings.id, id));
    if (!rec) return reply.code(404).send({ error: "Not found" });
    const { createReadStream, existsSync } = await import("node:fs");
    if (!existsSync(rec.filePath)) return reply.code(404).send({ error: "File missing" });
    await db.insert(recordingAccessLog).values({
      recordingId: id,
      actorType: "admin",
      actorId: (actor as { id: string }).id,
      action: "download",
    });
    {
      const { audioContentType, audioFilename } = await import("../lib/audio-mime.js");
      reply.header("content-type", audioContentType(rec.filePath));
      reply.header("content-disposition", `attachment; filename="${audioFilename(id, rec.filePath)}"`);
    }
    return reply.send(createReadStream(rec.filePath));
  });

  app.get("/api/v1/admin/recordings/:id/access-log", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    return db
      .select()
      .from(recordingAccessLog)
      .where(eq(recordingAccessLog.recordingId, id))
      .orderBy(desc(recordingAccessLog.at));
  });

  app.get("/api/v1/admin/missed-calls", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return db.select().from(missedCalls).orderBy(desc(missedCalls.at)).limit(200);
  });

  app.patch("/api/v1/admin/missed-calls/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z.object({ status: z.enum(["pending", "returned", "ignored"]) }).parse(req.body);
    await db.update(missedCalls).set({ status: body.status }).where(eq(missedCalls.id, id));
    return { ok: true };
  });

  // Live
  app.get("/api/v1/admin/live/calls", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const qs = await db.select().from(queues);
    const members = await db.select().from(queueMembers);
    const { fetchQueueWaiting } = await import("../lib/ami.js");
    const queueSummary = await Promise.all(
      qs.map(async (q) => ({
        number: q.number,
        name: q.name,
        members: members.filter((m) => m.queueId === q.id).length,
        paused: members.filter((m) => m.queueId === q.id && m.paused).length,
        waiting: await fetchQueueWaiting(q.number),
      })),
    );
    const trunkRows = await db.select().from(trunks);
    const { fetchTrunkEndpointStatus } = await import("../lib/ami.js");
    const trunkSummary = await Promise.all(
      trunkRows.map(async (t) => {
        const endpoint = `trunk_${t.id.slice(0, 8)}`;
        let state = "unknown";
        try {
          const live = await fetchTrunkEndpointStatus(endpoint);
          state = live?.status ?? "unknown";
        } catch {
          state = "error";
        }
        return { id: t.id, name: t.name, host: t.host, endpoint, state: String(state) };
      }),
    );
    return {
      asteriskConnected: ari.connected,
      calls: [...ari.calls.values()],
      extensions: [...ari.extensionStates.values()],
      queues: queueSummary,
      trunks: trunkSummary,
    };
  });

  app.get("/api/v1/admin/schedules/:id/status", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const { evaluateScheduleStatus } = await import("../asterisk/routing.js");
    const status = await evaluateScheduleStatus(id);
    return { status, at: new Date().toISOString() };
  });

  function cdrRangeWhere(q: { from?: string; to?: string }) {
    const clauses = [];
    if (q.from) clauses.push(gte(cdr.startedAt, new Date(q.from)));
    if (q.to) clauses.push(lte(cdr.startedAt, new Date(q.to)));
    return clauses.length ? and(...clauses) : undefined;
  }

  app.get("/api/v1/admin/reports/quality", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const where = cdrRangeWhere(req.query as { from?: string; to?: string });
    const rows = await db
      .select({
        total: sql<number>`count(*)::int`,
        avgMos: sql<number>`coalesce(avg(${cdr.mos}),0)`,
        avgJitter: sql<number>`coalesce(avg(${cdr.jitter}),0)`,
        avgLoss: sql<number>`coalesce(avg(${cdr.packetLoss}),0)`,
      })
      .from(cdr)
      .where(where);
    return rows[0] ?? { total: 0, avgMos: 0, avgJitter: 0, avgLoss: 0 };
  });

  app.post("/api/v1/admin/live/calls/:id/hangup", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    await ari.hangup(id);
    // Also clear any snoop children left from failed spy
    void ari.hangupOrphanSnoops();
    return { ok: true };
  });

  app.post("/api/v1/admin/live/cleanup", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const snoops = await ari.hangupOrphanSnoops();
    return { ok: true, hungupSnoops: snoops };
  });

  app.post("/api/v1/admin/live/calls/:id/spy", async (req, reply) => {
    const actor = await admin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        mode: z.enum(["listen", "whisper", "barge"]),
        listenerExtension: z.string().min(2).max(16),
      })
      .parse(req.body);
    const mode =
      body.mode === "whisper" ? "whisper" : body.mode === "barge" ? "barge" : "spy";
    try {
      await ari.chanspy({
        spyChannelId: id,
        listenerEndpoint: `PJSIP/${body.listenerExtension}`,
        mode,
      });
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    await writeAudit({
      actor: actor as never,
      action: `live.spy.${body.mode}`,
      objectId: id,
      ip: req.ip,
    });
    return { ok: true };
  });

  // Reports
  app.get("/api/v1/admin/reports/summary", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const where = cdrRangeWhere(req.query as { from?: string; to?: string });
    const [stats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        answered: sql<number>`count(*) filter (where ${cdr.disposition} = 'ANSWERED')::int`,
        missed: sql<number>`count(*) filter (where ${cdr.disposition} != 'ANSWERED')::int`,
        abandoned: sql<number>`count(*) filter (where ${cdr.disposition} in ('NOANSWER','BUSY','CANCEL') and ${cdr.queueNumber} is not null)::int`,
        avgDuration: sql<number>`coalesce(avg(${cdr.billsec}),0)::int`,
        // SLA: answered within 20s (billsec proxy when wait not stored separately on non-queue)
        slaAnswered: sql<number>`count(*) filter (where ${cdr.disposition} = 'ANSWERED' and coalesce(${cdr.duration} - ${cdr.billsec}, 0) <= 20)::int`,
      })
      .from(cdr)
      .where(where);
    const total = stats?.total ?? 0;
    const answered = stats?.answered ?? 0;
    const slaPct = answered > 0 ? Math.round(((stats?.slaAnswered ?? 0) / answered) * 100) : 0;
    return {
      ...stats,
      slaPercent: slaPct,
      abandonRate: total > 0 ? Math.round(((stats?.abandoned ?? 0) / total) * 100) : 0,
    };
  });

  app.get("/api/v1/admin/reports/queues", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const where = cdrRangeWhere(req.query as { from?: string; to?: string });
    return db
      .select({
        queue: cdr.queueNumber,
        total: sql<number>`count(*)::int`,
        answered: sql<number>`count(*) filter (where ${cdr.disposition} = 'ANSWERED')::int`,
        abandoned: sql<number>`count(*) filter (where ${cdr.disposition} != 'ANSWERED')::int`,
        avgWait: sql<number>`coalesce(avg(${cdr.duration} - ${cdr.billsec}),0)::int`,
      })
      .from(cdr)
      .where(where)
      .groupBy(cdr.queueNumber);
  });

  app.get("/api/v1/admin/reports/extensions", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const where = cdrRangeWhere(req.query as { from?: string; to?: string });
    return db
      .select({
        extension: cdr.extensionNumber,
        total: sql<number>`count(*)::int`,
        talk: sql<number>`coalesce(sum(${cdr.billsec}),0)::int`,
      })
      .from(cdr)
      .where(where)
      .groupBy(cdr.extensionNumber);
  });

  app.get("/api/v1/admin/reports/ivr", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const q = req.query as { from?: string; to?: string };
    const inRange = (at: Date | null) => {
      if (!at) return true;
      if (q.from && at < new Date(q.from)) return false;
      if (q.to && at > new Date(q.to)) return false;
      return true;
    };
    const events = await db
      .select()
      .from(callEvents)
      .where(eq(callEvents.type, "ivr.dtmf"))
      .orderBy(desc(callEvents.at))
      .limit(500);
    const filtered = events.filter((e) => inRange(e.at));
    const counts: Record<string, number> = {};
    for (const e of filtered) {
      const digit = String((e.data as { digit?: string })?.digit ?? "?");
      counts[digit] = (counts[digit] ?? 0) + 1;
    }
    const exits = await db
      .select()
      .from(callEvents)
      .where(eq(callEvents.type, "flow.exit"))
      .orderBy(desc(callEvents.at))
      .limit(500);
    const hangups: Record<string, number> = {};
    for (const e of exits.filter((x) => inRange(x.at))) {
      const d = e.data as { nodeId?: string; reason?: string; nodeType?: string };
      const key = d.nodeType
        ? `${d.nodeType}:${d.nodeId ?? "?"}`
        : d.nodeId
          ? `node:${d.nodeId}`
          : d.reason ?? "hangup";
      hangups[key] = (hangups[key] ?? 0) + 1;
    }
    return {
      items: Object.entries(counts).map(([digit, count]) => ({ digit, count })),
      hangups: Object.entries(hangups).map(([where, count]) => ({ where, count })),
      recent: filtered.slice(0, 50),
    };
  });

  // Settings / webhooks / api keys / audit
  app.get("/api/v1/admin/settings", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const [row] = await db.select().from(settings).where(eq(settings.id, 1));
    return row?.data ?? SettingsSchema.parse({});
  });

  app.patch("/api/v1/admin/settings", async (req, reply) => {
    const actor = await admin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const body = SettingsSchema.partial().parse(req.body);
    // Normalize blank hostname/email to null
    if (body.hostname !== undefined) {
      body.hostname = body.hostname?.trim() ? body.hostname.trim().toLowerCase() : null;
    }
    if (body.sslEmail !== undefined) {
      body.sslEmail = body.sslEmail?.trim() ? body.sslEmail.trim() : null;
    }
    const [row] = await db.select().from(settings).where(eq(settings.id, 1));
    const next = SettingsSchema.parse({ ...(row?.data as object), ...body });
    if (row) await db.update(settings).set({ data: next }).where(eq(settings.id, 1));
    else await db.insert(settings).values({ id: 1, data: next });
    await writeAudit({
      actor: actor as never,
      action: "settings.update",
      after: body,
      ip: req.ip,
    });
    // SIP ACL / denylist live in generated PJSIP — rewrite when security nets change
    if (
      body.sipIpAllowlist !== undefined ||
      body.sipIpDenylist !== undefined ||
      body.adminIpAllowlist !== undefined
    ) {
      await tryReloadAsterisk();
    }
    // Auto-SSL: issue/renew when enabled or hostname changes
    if (body.autoSsl === true || (next.autoSsl && body.hostname !== undefined)) {
      void import("../lib/ssl-certs.js")
        .then(({ issueOrRenewCertificate }) => issueOrRenewCertificate({ force: true }))
        .catch((e) => console.warn("[ssl] issue after settings", (e as Error).message));
    } else if (body.autoSsl === false) {
      const cleared = SettingsSchema.parse({
        ...next,
        sslStatus: "none",
        sslLastError: null,
        sslLastCheckAt: new Date().toISOString(),
      });
      await db.update(settings).set({ data: cleared }).where(eq(settings.id, 1));
      return cleared;
    }
    return next;
  });

  app.get("/api/v1/admin/ssl/status", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { getSslStatus } = await import("../lib/ssl-certs.js");
    return getSslStatus();
  });

  app.post("/api/v1/admin/ssl/renew", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { issueOrRenewCertificate } = await import("../lib/ssl-certs.js");
    return issueOrRenewCertificate({ force: true });
  });

  // Encrypted secrets for API-node auth (never returned in plaintext after create)
  app.get("/api/v1/admin/secrets", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const rows = await db.select({ id: secrets.id, name: secrets.name, createdAt: secrets.createdAt }).from(secrets);
    return rows;
  });

  app.post("/api/v1/admin/secrets", async (req, reply) => {
    const actor = await admin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const body = z.object({ name: z.string().min(1).max(100), value: z.string().min(1) }).parse(req.body);
    const [row] = await db
      .insert(secrets)
      .values({ name: body.name, valueEnc: encrypt(body.value) })
      .returning({ id: secrets.id, name: secrets.name });
    await writeAudit({
      actor: actor as never,
      action: "secret.create",
      objectType: "secret",
      objectId: row.id,
      ip: req.ip,
    });
    return row;
  });

  app.delete("/api/v1/admin/secrets/:id", async (req, reply) => {
    const actor = await admin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    await db.delete(secrets).where(eq(secrets.id, id));
    await writeAudit({
      actor: actor as never,
      action: "secret.delete",
      objectType: "secret",
      objectId: id,
      ip: req.ip,
    });
    return { ok: true };
  });

  app.get("/api/v1/admin/webhooks", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return db.select().from(webhooks);
  });

  app.post("/api/v1/admin/webhooks", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = WebhookSchema.parse(req.body);
    const [row] = await db
      .insert(webhooks)
      .values({ ...body, secret: randomSecret(24) })
      .returning();
    return row;
  });

  app.get("/api/v1/admin/api-keys", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        permissions: apiKeys.permissions,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys);
  });

  app.post("/api/v1/admin/api-keys", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = z.object({ name: z.string(), permissions: z.array(z.string()).optional() }).parse(req.body);
    const raw = `dsip_${randomSecret(32)}`;
    const [row] = await db
      .insert(apiKeys)
      .values({
        name: body.name,
        keyHash: hashToken(raw),
        keyPrefix: raw.slice(0, 12),
        permissions: body.permissions ?? ["cdr", "originate"],
      })
      .returning();
    return { id: row.id, name: row.name, key: raw, keyPrefix: row.keyPrefix, permissions: row.permissions };
  });

  app.patch("/api/v1/admin/api-keys/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().optional(),
        permissions: z.array(z.string()).optional(),
      })
      .parse(req.body);
    // An empty body leaves nothing to set, and drizzle throws "No values to set"
    // on an empty .set().
    if (body.name == null && body.permissions == null) {
      const [current] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
      if (!current) return reply.code(404).send({ error: "Not found" });
      return {
        id: current.id,
        name: current.name,
        keyPrefix: current.keyPrefix,
        permissions: current.permissions,
      };
    }
    const [row] = await db
      .update(apiKeys)
      .set({
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.permissions != null ? { permissions: body.permissions } : {}),
      })
      .where(eq(apiKeys.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "Not found" });
    return {
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      permissions: row.permissions,
    };
  });

  app.delete("/api/v1/admin/api-keys/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
    return { ok: true };
  });

  app.get("/api/v1/admin/audit-log", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(200);
  });

  app.post("/api/v1/admin/system/reload", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const ok = await tryReloadAsterisk();
    return { ok, asterisk: ari.connected };
  });

  async function buildBackup() {
    return {
      at: new Date().toISOString(),
      extensions: await db.select().from(extensions),
      trunks: await db.select().from(trunks),
      queues: await db.select().from(queues),
      flows: await db.select().from(flows),
      settings: await db.select().from(settings),
      inboundRoutes: await db.select().from(inboundRoutes),
      outboundRoutes: await db.select().from(outboundRoutes),
      blacklist: await db.select().from(blacklist),
    };
  }

  app.get("/api/v1/admin/backups", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const data = await buildBackup();
    reply.header("content-type", "application/json");
    reply.header("content-disposition", `attachment; filename="dsip-backup-${Date.now()}.json"`);
    return data;
  });

  app.post("/api/v1/admin/backups", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const data = await buildBackup();
    reply.header("content-type", "application/json");
    reply.header("content-disposition", `attachment; filename="dsip-backup-${Date.now()}.json"`);
    return data;
  });

  /** Run recording archive once (local path + optional SFTP). */
  app.post("/api/v1/admin/archive/run", async (req, reply) => {
    const actor = await admin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { runRecordingArchive } = await import("../jobs/archive.js");
    const n = await runRecordingArchive();
    await writeAudit({
      actor: actor as never,
      action: "archive.run",
      after: { archived: n },
      ip: req.ip,
    });
    return { ok: true, archived: n };
  });

  /** Probe SFTP URI from settings (or body.uri override). */
  app.post("/api/v1/admin/archive/test-sftp", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = z.object({ uri: z.string().optional() }).parse(req.body ?? {});
    let uri = body.uri?.trim() || "";
    if (!uri) {
      const [row] = await db.select().from(settings).limit(1);
      const s = SettingsSchema.parse(row?.data ?? {});
      uri = s.recordingArchiveSftp?.trim() || "";
    }
    if (!uri) return reply.code(400).send({ error: "No SFTP URI configured" });
    const { testSftpUri } = await import("../jobs/archive.js");
    return testSftpUri(uri);
  });

  app.post("/api/v1/admin/backups/restore", async (req, reply) => {
    const actor = await admin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const body = z
      .object({
        settings: z.array(z.any()).optional(),
        blacklist: z.array(z.any()).optional(),
        trunks: z.array(z.any()).optional(),
        flows: z.array(z.any()).optional(),
        inboundRoutes: z.array(z.any()).optional(),
        outboundRoutes: z.array(z.any()).optional(),
        queues: z.array(z.any()).optional(),
        extensions: z.array(z.any()).optional(),
      })
      .parse(req.body);

    let restored = 0;

    if (body.settings?.[0]?.data) {
      const [existing] = await db.select().from(settings).where(eq(settings.id, 1));
      if (existing) {
        await db.update(settings).set({ data: body.settings[0].data }).where(eq(settings.id, 1));
      } else {
        await db.insert(settings).values({ id: 1, data: body.settings[0].data });
      }
      restored += 1;
    }

    if (body.blacklist?.length) {
      await db.delete(blacklist);
      for (const b of body.blacklist) {
        await db.insert(blacklist).values({
          id: b.id,
          pattern: b.pattern,
          direction: b.direction ?? "inbound",
          note: b.note ?? null,
        });
      }
      restored += body.blacklist.length;
    }

    if (body.trunks?.length) {
      for (const t of body.trunks) {
        const [ex] = await db.select().from(trunks).where(eq(trunks.id, t.id));
        const row = {
          name: t.name,
          host: t.host,
          port: t.port ?? 5060,
          transport: t.transport ?? "udp",
          authType: t.authType ?? t.auth_type ?? "userpass",
          username: t.username ?? null,
          secretEnc: t.secretEnc ?? t.secret_enc ?? null,
          codecs: t.codecs ?? ["ulaw", "alaw", "opus"],
          maxChannels: t.maxChannels ?? t.max_channels ?? 10,
          enabled: t.enabled ?? true,
        };
        if (ex) await db.update(trunks).set(row).where(eq(trunks.id, t.id));
        else await db.insert(trunks).values({ id: t.id, ...row });
      }
      restored += body.trunks.length;
    }

    if (body.flows?.length) {
      for (const f of body.flows) {
        const [ex] = await db.select().from(flows).where(eq(flows.id, f.id));
        const row = {
          name: f.name,
          draftJson: f.draftJson ?? f.draft_json ?? emptyFlow(),
          publishedVersionId: f.publishedVersionId ?? f.published_version_id ?? null,
          updatedAt: new Date(),
        };
        if (ex) await db.update(flows).set(row).where(eq(flows.id, f.id));
        else await db.insert(flows).values({ id: f.id, ...row });
      }
      restored += body.flows.length;
    }

    if (body.inboundRoutes?.length) {
      for (const r of body.inboundRoutes) {
        const [ex] = await db.select().from(inboundRoutes).where(eq(inboundRoutes.id, r.id));
        const row = {
          did: r.did,
          callerPattern: r.callerPattern ?? r.caller_pattern ?? null,
          destType: r.destType ?? r.dest_type,
          destId: r.destId ?? r.dest_id ?? null,
          priority: r.priority ?? 100,
        };
        if (ex) await db.update(inboundRoutes).set(row).where(eq(inboundRoutes.id, r.id));
        else await db.insert(inboundRoutes).values({ id: r.id, ...row });
      }
      restored += body.inboundRoutes.length;
    }

    if (body.outboundRoutes?.length) {
      for (const r of body.outboundRoutes) {
        const [ex] = await db.select().from(outboundRoutes).where(eq(outboundRoutes.id, r.id));
        const row = {
          name: r.name,
          pattern: r.pattern,
          trunkIds: r.trunkIds ?? r.trunk_ids ?? [],
          stripPrefix: r.stripPrefix ?? r.strip_prefix ?? r.strip ?? 0,
          prepend: r.prepend ?? "",
          requiredPermission: r.requiredPermission ?? r.required_permission ?? "localFixed",
          enabled: r.enabled ?? true,
        };
        if (ex) await db.update(outboundRoutes).set(row).where(eq(outboundRoutes.id, r.id));
        else await db.insert(outboundRoutes).values({ id: r.id, ...row });
      }
      restored += body.outboundRoutes.length;
    }

    if (body.queues?.length) {
      for (const q of body.queues) {
        const [ex] = await db.select().from(queues).where(eq(queues.id, q.id));
        const row = {
          name: q.name,
          number: q.number,
          strategy: q.strategy ?? "rrmemory",
          memberTimeout: q.memberTimeout ?? q.member_timeout ?? 15,
          wrapup: q.wrapup ?? 5,
          maxWait: q.maxWait ?? q.max_wait ?? 300,
          maxCallers: q.maxCallers ?? q.max_callers ?? 20,
          announceHoldtime: q.announceHoldtime ?? q.announce_holdtime ?? true,
          announcePosition: q.announcePosition ?? q.announce_position ?? true,
          mohId: q.mohId ?? q.moh_id ?? null,
          scheduleId: q.scheduleId ?? q.schedule_id ?? null,
          timeoutDestType: q.timeoutDestType ?? q.timeout_dest_type ?? null,
          timeoutDestId: q.timeoutDestId ?? q.timeout_dest_id ?? null,
          fullDestType: q.fullDestType ?? q.full_dest_type ?? null,
          fullDestId: q.fullDestId ?? q.full_dest_id ?? null,
          joinemptyDestType: q.joinemptyDestType ?? q.joinempty_dest_type ?? null,
          joinemptyDestId: q.joinemptyDestId ?? q.joinempty_dest_id ?? null,
          callbackEnabled: q.callbackEnabled ?? q.callback_enabled ?? false,
        };
        if (ex) await db.update(queues).set(row).where(eq(queues.id, q.id));
        else await db.insert(queues).values({ id: q.id, ...row });
      }
      restored += body.queues.length;
    }

    if (body.extensions?.length) {
      for (const e of body.extensions) {
        const [ex] = await db.select().from(extensions).where(eq(extensions.id, e.id));
        if (!ex) continue; // do not create extensions from backup (secrets/passwords)
        await db
          .update(extensions)
          .set({
            name: e.name ?? ex.name,
            dnd: e.dnd ?? ex.dnd,
            callPermissions: e.callPermissions ?? e.call_permissions ?? ex.callPermissions,
            bossSecretaryOf: e.bossSecretaryOf ?? e.boss_secretary_of ?? ex.bossSecretaryOf,
          })
          .where(eq(extensions.id, e.id));
      }
      restored += body.extensions.length;
    }

    await writeAudit({
      actor: actor as never,
      action: "backup.restore",
      after: { restored },
      ip: req.ip,
    });
    await tryReloadAsterisk();
    return { ok: true, restored };
  });

  // Devices + softphone QR
  app.get("/api/v1/admin/devices", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    return db.select().from(devices);
  });

  app.post("/api/v1/admin/devices", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = z
      .object({
        extensionId: z.string().uuid(),
        model: z.string().optional(),
        mac: z.string().optional(),
        provisioningProfile: z.string().optional(),
      })
      .parse(req.body);
    const [row] = await db.insert(devices).values(body).returning();
    return row;
  });

  app.get("/api/v1/admin/devices/:id/qr", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const [dev] = await db.select().from(devices).where(eq(devices.id, id));
    if (!dev) return reply.code(404).send({ error: "Not found" });
    const [ext] = await db.select().from(extensions).where(eq(extensions.id, dev.extensionId));
    if (!ext) return reply.code(404).send({ error: "Extension missing" });
    let sipPass = "";
    try {
      sipPass = decrypt(ext.sipSecretEnc);
    } catch {
      sipPass = "";
    }
    const host = config.publicUrl.replace(/^https?:\/\//, "").split("/")[0];
    const uri = `sip:${ext.number}@${host}`;
    const payload = JSON.stringify({
      uri,
      user: ext.number,
      password: sipPass,
      wss: config.sipWssUrl,
      displayName: ext.name,
    });
    const QRCode = (await import("qrcode")).default;
    const qr = await QRCode.toDataURL(payload);
    const macNorm = (dev.mac ?? "").replace(/[^a-fA-F0-9]/g, "").toLowerCase();
    const provisionUrl = macNorm
      ? `${config.publicUrl}/cfg/${macNorm}.cfg`
      : null;
    return { qr, uri, user: ext.number, displayName: ext.name, provisionUrl };
  });

  /** Public desk-phone autoprovision (Yealink/Fanvil/Grandstream-style). MAC from path. */
  app.get("/cfg/:mac", async (req, reply) => {
    const raw = (req.params as { mac: string }).mac.replace(/\.cfg$/i, "");
    const macNorm = raw.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
    if (macNorm.length < 12) return reply.code(404).send("not found");
    const all = await db.select().from(devices);
    const dev = all.find(
      (d) => (d.mac ?? "").replace(/[^a-fA-F0-9]/g, "").toLowerCase() === macNorm,
    );
    if (!dev) return reply.code(404).send("not found");
    const [ext] = await db.select().from(extensions).where(eq(extensions.id, dev.extensionId));
    if (!ext) return reply.code(404).send("not found");
    let sipPass = "";
    try {
      sipPass = decrypt(ext.sipSecretEnc);
    } catch {
      sipPass = "";
    }
    const host = config.sipDomain || config.publicHost;
    const profile = (dev.provisioningProfile ?? "yealink").toLowerCase();
    // BLF peers: other extensions (max 8) for busy-lamp keys
    const peers = (await db.select().from(extensions))
      .filter((e) => e.number !== ext.number)
      .sort((a, b) => a.number.localeCompare(b.number))
      .slice(0, 8);
    let body = "";
    // Prefer SIP TLS (5061) for desk phones; UDP fallback documented in Devices UI
    if (profile === "fanvil" || profile === "grandstream") {
      const lines = [
        `Account.1.Enable = 1`,
        `Account.1.Account = ${ext.number}`,
        `Account.1.Password = ${sipPass}`,
        `Account.1.SipServer.1.Address = ${host}`,
        `Account.1.SipServer.1.Port = 5061`,
        `Account.1.DisplayName = ${ext.name}`,
        `Account.1.LocalSipPort = 5061`,
        `Account.1.Transport = 2`,
        `Account.1.SrtpEncryption = 1`,
      ];
      peers.forEach((p, i) => {
        const n = i + 1;
        lines.push(
          `MemoryKey.${n}.Type = 1`,
          `MemoryKey.${n}.Value = ${p.number}`,
          `MemoryKey.${n}.Label = ${p.name || p.number}`,
          `MemoryKey.${n}.PickupValue = *8${p.number}`,
        );
      });
      body = lines.join("\n");
    } else {
      // Yealink / generic — transport_type 2 = TLS; linekey type 16 = BLF
      const lines = [
        `#!version:1.0.0.1`,
        `account.1.enable = 1`,
        `account.1.label = ${ext.name}`,
        `account.1.display_name = ${ext.name}`,
        `account.1.auth_name = ${ext.number}`,
        `account.1.user_name = ${ext.number}`,
        `account.1.password = ${sipPass}`,
        `account.1.sip_server.1.address = ${host}`,
        `account.1.sip_server.1.port = 5061`,
        `account.1.sip_server.1.transport_type = 2`,
        `account.1.srtp_encryption = 1`,
        `account.1.outbound_proxy_enable = 0`,
      ];
      peers.forEach((p, i) => {
        const n = i + 1;
        lines.push(
          `linekey.${n}.type = 16`,
          `linekey.${n}.line = 1`,
          `linekey.${n}.value = ${p.number}`,
          `linekey.${n}.label = ${p.name || p.number}`,
          `linekey.${n}.extension = ${p.number}`,
        );
      });
      body = lines.join("\n");
    }
    reply.header("content-type", "text/plain; charset=utf-8");
    return body;
  });

  app.post("/api/v1/admin/holidays/import", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = z
      .object({
        scheduleId: z.string().uuid().optional(),
        items: z.array(
          z.object({
            date: z.string(),
            name: z.string(),
            halfDay: z.boolean().optional(),
          }),
        ),
      })
      .parse(req.body);
    for (const it of body.items) {
      await db.insert(holidays).values({
        scheduleId: body.scheduleId ?? null,
        date: it.date,
        name: it.name,
        halfDay: it.halfDay ?? false,
      });
    }
    return { ok: true, count: body.items.length };
  });

  /** Fixed TR public holidays for the given year (+ half-day arife for major bayrams when known). */
  app.post("/api/v1/admin/holidays/tr-pack", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const body = z
      .object({
        scheduleId: z.string().uuid().optional().nullable(),
        year: z.coerce.number().int().min(2024).max(2035).optional(),
      })
      .parse(req.body ?? {});
    const year = body.year ?? new Date().getFullYear();
    // Shifting bayrams (Diyanet-style published dates) + fixed national days
    const bayrams: Record<number, Array<{ date: string; name: string; halfDay?: boolean }>> = {
      2025: [
        { date: "2025-03-29", name: "Ramazan Bayramı arifesi", halfDay: true },
        { date: "2025-03-30", name: "Ramazan Bayramı 1. gün" },
        { date: "2025-03-31", name: "Ramazan Bayramı 2. gün" },
        { date: "2025-04-01", name: "Ramazan Bayramı 3. gün" },
        { date: "2025-06-05", name: "Kurban Bayramı arifesi", halfDay: true },
        { date: "2025-06-06", name: "Kurban Bayramı 1. gün" },
        { date: "2025-06-07", name: "Kurban Bayramı 2. gün" },
        { date: "2025-06-08", name: "Kurban Bayramı 3. gün" },
        { date: "2025-06-09", name: "Kurban Bayramı 4. gün" },
      ],
      2026: [
        { date: "2026-03-19", name: "Ramazan Bayramı arifesi", halfDay: true },
        { date: "2026-03-20", name: "Ramazan Bayramı 1. gün" },
        { date: "2026-03-21", name: "Ramazan Bayramı 2. gün" },
        { date: "2026-03-22", name: "Ramazan Bayramı 3. gün" },
        { date: "2026-05-26", name: "Kurban Bayramı arifesi", halfDay: true },
        { date: "2026-05-27", name: "Kurban Bayramı 1. gün" },
        { date: "2026-05-28", name: "Kurban Bayramı 2. gün" },
        { date: "2026-05-29", name: "Kurban Bayramı 3. gün" },
        { date: "2026-05-30", name: "Kurban Bayramı 4. gün" },
      ],
      2027: [
        { date: "2027-03-09", name: "Ramazan Bayramı arifesi", halfDay: true },
        { date: "2027-03-10", name: "Ramazan Bayramı 1. gün" },
        { date: "2027-03-11", name: "Ramazan Bayramı 2. gün" },
        { date: "2027-03-12", name: "Ramazan Bayramı 3. gün" },
        { date: "2027-05-15", name: "Kurban Bayramı arifesi", halfDay: true },
        { date: "2027-05-16", name: "Kurban Bayramı 1. gün" },
        { date: "2027-05-17", name: "Kurban Bayramı 2. gün" },
        { date: "2027-05-18", name: "Kurban Bayramı 3. gün" },
        { date: "2027-05-19", name: "Kurban Bayramı 4. gün" },
      ],
    };
    const fixed: Array<{ date: string; name: string; halfDay?: boolean }> = [
      { date: `${year}-01-01`, name: "Yılbaşı" },
      { date: `${year}-04-23`, name: "Ulusal Egemenlik ve Çocuk Bayramı" },
      { date: `${year}-05-01`, name: "Emek ve Dayanışma Günü" },
      { date: `${year}-05-19`, name: "Atatürk’ü Anma, Gençlik ve Spor Bayramı" },
      { date: `${year}-07-15`, name: "Demokrasi ve Millî Birlik Günü" },
      { date: `${year}-08-30`, name: "Zafer Bayramı" },
      { date: `${year}-10-29`, name: "Cumhuriyet Bayramı" },
      { date: `${year}-10-28`, name: "Cumhuriyet Bayramı arifesi", halfDay: true },
      ...(bayrams[year] ?? []),
    ];
    let inserted = 0;
    for (const it of fixed) {
      const existing = await db
        .select()
        .from(holidays)
        .where(
          and(
            eq(holidays.date, it.date),
            body.scheduleId
              ? eq(holidays.scheduleId, body.scheduleId)
              : sql`${holidays.scheduleId} IS NULL`,
          ),
        )
        .limit(1);
      if (existing[0]) continue;
      await db.insert(holidays).values({
        scheduleId: body.scheduleId ?? null,
        date: it.date,
        name: it.name,
        halfDay: it.halfDay ?? false,
      });
      inserted++;
    }
    return { ok: true, year, inserted, total: fixed.length };
  });

  app.get("/api/v1/admin/flows/:id/export", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(flows).where(eq(flows.id, id)).limit(1);
    if (!row) return reply.code(404).send({ error: "Not found" });
    return {
      format: "dsip-flow-v1",
      exportedAt: new Date().toISOString(),
      name: row.name,
      extensionNumber: row.extensionNumber,
      draftJson: row.draftJson,
    };
  });

  app.post("/api/v1/admin/flows/:id/import", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        draftJson: FlowJsonSchema,
        name: z.string().optional(),
      })
      .parse(req.body);
    const errors = validateFlow(body.draftJson as never);
    if (errors.length) return reply.code(400).send({ error: "Invalid flow", errors });
    await db
      .update(flows)
      .set({
        draftJson: body.draftJson,
        ...(body.name ? { name: body.name } : {}),
        updatedAt: new Date(),
      })
      .where(eq(flows.id, id));
    return { ok: true };
  });

  app.post("/api/v1/admin/webhooks/:id/test", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    const [hook] = await db.select().from(webhooks).where(eq(webhooks.id, id));
    if (!hook) return reply.code(404).send({ error: "Not found" });
    const { createHmac } = await import("node:crypto");
    const body = JSON.stringify({
      event: "call.ringing",
      at: new Date().toISOString(),
      data: { test: true, webhookId: id },
    });
    const sig = createHmac("sha256", hook.secret).update(body).digest("hex");
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dsip-signature": sig,
          "x-dsip-event": "call.ringing",
        },
        body,
        signal: AbortSignal.timeout(5000),
      });
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

  app.delete("/api/v1/admin/devices/:id", async (req, reply) => {
    if (!(await admin(req, reply))) return;
    const { id } = req.params as { id: string };
    await db.delete(devices).where(eq(devices.id, id));
    return { ok: true };
  });

  app.get("/api/v1/health", async () => {
    let dbOk = false;
    try {
      await db.execute(sql`select 1`);
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const asteriskOk = await ari.health();
    return {
      ok: dbOk,
      db: dbOk,
      asterisk: asteriskOk,
      publicUrl: config.publicUrl,
    };
  });
}
