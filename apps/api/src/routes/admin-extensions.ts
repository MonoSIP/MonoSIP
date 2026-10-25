import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  ExtensionCreateSchema,
  ExtensionUpdateSchema,
  ForwardingRuleSchema,
} from "@monosip/shared";
import { z } from "zod";
import { db } from "../db/client.js";
import { extensionForwarding, extensions, spendLimits } from "../db/schema.js";
import { requireAdmin } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import { encrypt, randomSecret, scryptHash } from "../lib/crypto.js";
import { csvCell } from "../lib/csv.js";
import { tryReloadAsterisk, writeAsteriskConfig } from "../asterisk/config-writer.js";
import { ari } from "../asterisk/ari.js";

/** Portal hash + SIP secret from the one extension password. */
export function extensionCredentials(password: string) {
  return { portalPasswordHash: scryptHash(password), sipSecretEnc: encrypt(password) };
}

export async function adminExtensionRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/extensions", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const rows = await db.select().from(extensions).orderBy(extensions.number);
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      name: r.name,
      email: r.email,
      portalEnabled: r.portalEnabled,
      recordingMode: r.recordingMode,
      recordingListenAllowed: r.recordingListenAllowed,
      outboundCli: r.outboundCli,
      callPermissions: r.callPermissions,
      mobileForwardAllowed: r.mobileForwardAllowed,
      dnd: r.dnd,
      bossSecretaryOf: r.bossSecretaryOf,
      createdAt: r.createdAt,
    }));
  });

  app.post("/api/v1/admin/extensions", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const body = ExtensionCreateSchema.parse(req.body);
    // One password for portal and SIP; generated when the admin leaves it empty.
    const portalPassword = body.portalPassword ?? randomSecret(12);
    const [row] = await db
      .insert(extensions)
      .values({
        number: body.number,
        name: body.name,
        email: body.email,
        ...extensionCredentials(portalPassword),
        portalEnabled: body.portalEnabled,
        recordingMode: body.recordingMode,
        recordingListenAllowed: body.recordingListenAllowed,
        outboundCli: body.outboundCli,
        callPermissions: body.callPermissions,
        mobileForwardAllowed: body.mobileForwardAllowed,
        dnd: body.dnd,
      })
      .returning();
    await writeAudit({
      actor,
      action: "extension.create",
      objectType: "extension",
      objectId: row.id,
      after: { number: row.number, name: row.name },
      ip: req.ip,
    });
    await tryReloadAsterisk();
    return {
      ...row,
      sipSecretEnc: undefined,
      portalPasswordHash: undefined,
      portalPassword,
    };
  });

  app.get("/api/v1/admin/extensions/:id", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(extensions).where(eq(extensions.id, id));
    if (!row) return reply.code(404).send({ error: "Not found" });
    const forwarding = await db
      .select()
      .from(extensionForwarding)
      .where(eq(extensionForwarding.extensionId, id));
    return { ...row, sipSecretEnc: undefined, portalPasswordHash: undefined, forwarding };
  });

  app.patch("/api/v1/admin/extensions/:id", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    const body = ExtensionUpdateSchema.parse(req.body);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.email !== undefined) patch.email = body.email;
    if (body.portalEnabled !== undefined) patch.portalEnabled = body.portalEnabled;
    if (body.recordingMode !== undefined) patch.recordingMode = body.recordingMode;
    if (body.recordingListenAllowed !== undefined)
      patch.recordingListenAllowed = body.recordingListenAllowed;
    if (body.outboundCli !== undefined) patch.outboundCli = body.outboundCli;
    if (body.callPermissions !== undefined) patch.callPermissions = body.callPermissions;
    if (body.mobileForwardAllowed !== undefined)
      patch.mobileForwardAllowed = body.mobileForwardAllowed;
    if (body.dnd !== undefined) patch.dnd = body.dnd;
    if (body.bossSecretaryOf !== undefined) patch.bossSecretaryOf = body.bossSecretaryOf;
    // Setting the password changes the SIP secret too (phones re-register with it).
    if (body.portalPassword) Object.assign(patch, extensionCredentials(body.portalPassword));
    const [row] = await db
      .update(extensions)
      .set(patch)
      .where(eq(extensions.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "Not found" });
    if (body.dnd !== undefined) {
      const { syncDndAstDb } = await import("../lib/astdb-dnd.js");
      await syncDndAstDb(row.number, body.dnd);
      ari.setExtensionState(row.number, body.dnd ? "dnd" : "idle");
    }
    await writeAudit({
      actor,
      action: "extension.update",
      objectType: "extension",
      objectId: id,
      // never store the password (portal + SIP) in the audit log
      after: { ...body, portalPassword: body.portalPassword ? "(changed)" : undefined },
      ip: req.ip,
    });
    await tryReloadAsterisk();
    return { id: row.id, number: row.number, name: row.name, dnd: row.dnd };
  });

  app.delete("/api/v1/admin/extensions/:id", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    await db.delete(extensions).where(eq(extensions.id, id));
    await writeAudit({
      actor,
      action: "extension.delete",
      objectType: "extension",
      objectId: id,
      ip: req.ip,
    });
    await tryReloadAsterisk();
    return { ok: true };
  });

  app.put("/api/v1/admin/extensions/:id/forwarding", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    const rules = z.array(ForwardingRuleSchema).parse(req.body);
    await db.delete(extensionForwarding).where(eq(extensionForwarding.extensionId, id));
    if (rules.length) {
      await db.insert(extensionForwarding).values(
        rules.map((r) => ({
          extensionId: id,
          condition: r.condition,
          ringSeconds: r.ringSeconds,
          destType: r.destType,
          destId: r.destId,
        })),
      );
    }
    await writeAudit({
      actor,
      action: "extension.forwarding",
      objectType: "extension",
      objectId: id,
      after: rules,
      ip: req.ip,
    });
    const { tryReloadAsterisk } = await import("../asterisk/config-writer.js");
    void tryReloadAsterisk();
    return { ok: true };
  });

  app.post("/api/v1/admin/extensions/:id/reset-password", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    const portalPassword = randomSecret(12);
    await db
      .update(extensions)
      .set({ ...extensionCredentials(portalPassword), updatedAt: new Date() })
      .where(eq(extensions.id, id));
    void tryReloadAsterisk();
    await writeAudit({
      actor,
      action: "extension.reset_password",
      objectType: "extension",
      objectId: id,
      ip: req.ip,
    });
    return { portalPassword };
  });

  app.get("/api/v1/admin/extensions/:id/spend-limit", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(spendLimits)
      .where(and(eq(spendLimits.scope, "extension"), eq(spendLimits.scopeId, id)))
      .limit(1);
    return row
      ? {
          dailyLimitMinutes: row.dailyLimitMinutes,
          monthlyLimitMinutes: row.monthlyLimitMinutes,
        }
      : { dailyLimitMinutes: null, monthlyLimitMinutes: null };
  });

  app.put("/api/v1/admin/extensions/:id/spend-limit", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        dailyLimitMinutes: z.number().int().min(0).max(100000).nullable(),
        monthlyLimitMinutes: z.number().int().min(0).max(1000000).nullable(),
      })
      .parse(req.body);
    await db
      .delete(spendLimits)
      .where(and(eq(spendLimits.scope, "extension"), eq(spendLimits.scopeId, id)));
    if (body.dailyLimitMinutes == null && body.monthlyLimitMinutes == null) {
      return { ok: true, cleared: true };
    }
    await db.insert(spendLimits).values({
      scope: "extension",
      scopeId: id,
      dailyLimitMinutes: body.dailyLimitMinutes ?? 1000,
      monthlyLimitMinutes: body.monthlyLimitMinutes ?? 20000,
    });
    return { ok: true };
  });

  app.get("/api/v1/admin/extensions/export", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const rows = await db.select().from(extensions);
    const header = "number,name,email,dnd,portalEnabled\n";
    const csv =
      header +
      rows
        .map((r) =>
          [r.number, r.name, r.email ?? "", r.dnd, r.portalEnabled].map(csvCell).join(","),
        )
        .join("\n");
    reply.header("content-type", "text/csv");
    reply.header("content-disposition", "attachment; filename=extensions.csv");
    return csv;
  });

  app.post("/api/v1/admin/extensions/import", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || "statusCode" in (actor as object)) return;
    const body = z.object({ csv: z.string().min(1) }).parse(req.body);
    const lines = body.csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const start = lines[0]?.toLowerCase().startsWith("number") ? 1 : 0;
    let created = 0;
    let updated = 0;
    // Same contract as the create route: rows that would fail
    // ExtensionCreateSchema (number /^\d{2,6}$/, name 1–100 chars) are skipped
    // and counted, not silently inserted into the generated pjsip/dialplan.
    const importRowSchema = ExtensionCreateSchema.pick({ number: true, name: true });
    let rejected = 0;
    // Passwords for extensions created by this import. One password serves both
    // the portal login and the SIP registration, so they are generated together.
    const credentials: Array<{ number: string; portalPassword: string }> = [];
    for (const line of lines.slice(start)) {
      const [number, name, email, dnd, portalEnabled] = line.split(",").map((s) => s.trim());
      const row = importRowSchema.safeParse({ number: number ?? "", name: name ?? "" });
      if (!row.success) {
        rejected++;
        continue;
      }
      const rowNumber = row.data.number;
      const rowName = row.data.name;
      const existing = await db.select().from(extensions).where(eq(extensions.number, rowNumber));
      if (existing[0]) {
        await db
          .update(extensions)
          .set({
            name: rowName,
            email: email || null,
            dnd: dnd === "true" || dnd === "1",
            portalEnabled: portalEnabled !== "false" && portalEnabled !== "0",
            updatedAt: new Date(),
          })
          .where(eq(extensions.id, existing[0].id));
        updated++;
      } else {
        // Same credential path as the create route: one generated password
        // serves both the portal login and the SIP registration. It is never
        // derived from the extension number, which would be guessable.
        const portalPassword = randomSecret(12);
        await db.insert(extensions).values({
          number: rowNumber,
          name: rowName,
          email: email || null,
          ...extensionCredentials(portalPassword),
          dnd: dnd === "true" || dnd === "1",
          portalEnabled: portalEnabled !== "false" && portalEnabled !== "0",
        });
        created++;
        credentials.push({ number: rowNumber, portalPassword });
      }
    }
    await writeAsteriskConfig();
    await writeAudit({
      actor: actor as never,
      action: "extension.import",
      after: { created, updated, rejected },
      ip: req.ip,
    });
    return { created, updated, rejected, credentials };
  });
}
