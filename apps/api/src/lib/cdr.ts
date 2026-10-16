import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { cdr } from "../db/schema.js";

const open = new Map<
  string,
  {
    startedAt: Date;
    answeredAt?: Date;
    direction: string;
    caller: string;
    callee: string;
    did?: string;
    extensionNumber?: string;
    queueNumber?: string;
  }
>();

export async function cdrStart(opts: {
  callId: string;
  direction: "inbound" | "outbound" | "internal";
  caller: string;
  callee: string;
  did?: string;
  extensionNumber?: string;
  queueNumber?: string;
  dndFlag?: boolean;
}): Promise<void> {
  const startedAt = new Date();
  let dndFlag = !!opts.dndFlag;
  if (!dndFlag && opts.callee) {
    try {
      const { extensions } = await import("../db/schema.js");
      const { eq } = await import("drizzle-orm");
      const [ext] = await db
        .select()
        .from(extensions)
        .where(eq(extensions.number, opts.callee))
        .limit(1);
      if (ext?.dnd) dndFlag = true;
    } catch {
      /* ignore */
    }
  }
  open.set(opts.callId, {
    startedAt,
    direction: opts.direction,
    caller: opts.caller,
    callee: opts.callee,
    did: opts.did,
    extensionNumber: opts.extensionNumber,
    queueNumber: opts.queueNumber,
  });
  try {
    await db.insert(cdr).values({
      callId: opts.callId,
      startedAt,
      direction: opts.direction,
      caller: opts.caller,
      callee: opts.callee,
      did: opts.did ?? null,
      extensionNumber: opts.extensionNumber ?? null,
      queueNumber: opts.queueNumber ?? null,
      disposition: "NOANSWER",
      duration: 0,
      billsec: 0,
      dndFlag,
    });
  } catch (e) {
    console.warn("[cdr] start failed", (e as Error).message);
  }
}

export async function cdrAnswered(callId: string): Promise<void> {
  const row = open.get(callId);
  if (row?.answeredAt) return; // already answered — avoid duplicate webhooks
  if (row) row.answeredAt = new Date();
  try {
    await db
      .update(cdr)
      .set({ answeredAt: new Date(), disposition: "ANSWERED" })
      .where(eq(cdr.callId, callId));
  } catch {
    /* ignore */
  }
  try {
    const { dispatchWebhooks } = await import("./webhooks.js");
    void dispatchWebhooks("call.answered", {
      callId,
      caller: row?.caller,
      callee: row?.callee,
      did: row?.did,
      extension: row?.extensionNumber,
      queue: row?.queueNumber,
    });
  } catch {
    /* ignore */
  }
}

export async function cdrEnd(
  callId: string,
  disposition?: string,
  overrides?: { billsec?: number; duration?: number },
): Promise<void> {
  const mem = open.get(callId);
  open.delete(callId);
  const endedAt = new Date();
  const startedAt = mem?.startedAt ?? endedAt;
  const answeredAt = mem?.answeredAt;
  const duration =
    overrides?.duration ??
    Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  const billsec =
    overrides?.billsec ??
    (answeredAt
      ? Math.max(0, Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000))
      : 0);
  try {
    await db
      .update(cdr)
      .set({
        endedAt,
        duration,
        billsec,
        disposition: disposition ?? (answeredAt ? "ANSWERED" : "NOANSWER"),
      })
      .where(eq(cdr.callId, callId));
  } catch (e) {
    console.warn("[cdr] end failed", (e as Error).message);
  }
  // Drop empty recordings tied to this call (unanswered / 0 talk time)
  if (billsec < 1) {
    try {
      const { discardEmptyRecordingsForCall } = await import("./recording-files.js");
      await discardEmptyRecordingsForCall(callId);
    } catch {
      /* ignore */
    }
  }
}

/** True if a CDR row is still open in memory (redirected calls awaiting hangup). */
export function cdrIsOpen(callId: string): boolean {
  return open.has(callId);
}
