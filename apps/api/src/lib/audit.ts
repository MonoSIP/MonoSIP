import { db } from "../db/client.js";
import { auditLog } from "../db/schema.js";
import type { Actor } from "./auth.js";

export async function writeAudit(opts: {
  actor?: Actor | null;
  action: string;
  objectType?: string;
  objectId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}) {
  await db.insert(auditLog).values({
    actorType: opts.actor?.type ?? "system",
    actorId: opts.actor?.id,
    action: opts.action,
    objectType: opts.objectType,
    objectId: opts.objectId,
    before: opts.before as object | undefined,
    after: opts.after as object | undefined,
    ip: opts.ip,
  });
}
