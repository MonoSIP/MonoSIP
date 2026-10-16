import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { ipBans } from "../db/schema.js";

export type BanSource = "login" | "fail2ban" | "manual";

export async function isIpActivelyBanned(ip: string): Promise<boolean> {
  const now = new Date();
  const rows = await db
    .select()
    .from(ipBans)
    .where(and(eq(ipBans.ip, ip), eq(ipBans.active, true)))
    .limit(20);
  for (const r of rows) {
    if (!r.expiresAt || r.expiresAt > now) return true;
  }
  return false;
}

export async function upsertIpBan(opts: {
  ip: string;
  source: BanSource;
  reason?: string;
  expiresAt?: Date | null;
}): Promise<{ id: string }> {
  const existing = await db
    .select()
    .from(ipBans)
    .where(and(eq(ipBans.ip, opts.ip), eq(ipBans.active, true)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(ipBans)
      .set({
        source: opts.source,
        reason: opts.reason ?? existing[0].reason,
        expiresAt: opts.expiresAt === undefined ? existing[0].expiresAt : opts.expiresAt,
        active: true,
      })
      .where(eq(ipBans.id, existing[0].id));
    return { id: existing[0].id };
  }
  const [row] = await db
    .insert(ipBans)
    .values({
      ip: opts.ip,
      source: opts.source,
      reason: opts.reason ?? null,
      expiresAt: opts.expiresAt ?? null,
      active: true,
    })
    .returning();
  return { id: row.id };
}

export async function deactivateIpBan(id: string): Promise<boolean> {
  const [row] = await db
    .update(ipBans)
    .set({ active: false })
    .where(eq(ipBans.id, id))
    .returning();
  return !!row;
}

export async function listActiveIpBans(limit = 200) {
  const now = new Date();
  const rows = await db
    .select()
    .from(ipBans)
    .where(
      and(
        eq(ipBans.active, true),
        or(isNull(ipBans.expiresAt), gt(ipBans.expiresAt, now)),
      ),
    )
    .orderBy(desc(ipBans.createdAt))
    .limit(limit);
  return rows;
}
