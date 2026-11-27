import { and, eq, isNull, sql } from "drizzle-orm";
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

/** Process-local integrity counters (exposed via health / admin integrity). */
export const cdrMetrics = {
  startOk: 0,
  startExisting: 0,
  startRaceRecovered: 0,
  startErrors: 0,
  endFinalized: 0,
  endNoopFinished: 0,
  endEnriched: 0,
  endErrors: 0,
  answeredOk: 0,
  answeredNoop: 0,
  endedWebhookEmitted: 0,
  endedWebhookDeduped: 0,
};

const endedWebhookSent = new Set<string>();

function hydrateOpenFromRow(
  callId: string,
  row: {
    startedAt: Date;
    answeredAt: Date | null;
    direction: string;
    caller: string | null;
    callee: string | null;
    did: string | null;
    extensionNumber: string | null;
    queueNumber: string | null;
  },
  fallback: {
    caller: string;
    callee: string;
    did?: string;
    extensionNumber?: string;
    queueNumber?: string;
  },
): void {
  open.set(callId, {
    startedAt: row.startedAt,
    answeredAt: row.answeredAt ?? undefined,
    direction: row.direction,
    caller: row.caller ?? fallback.caller,
    callee: row.callee ?? fallback.callee,
    did: row.did ?? fallback.did,
    extensionNumber: row.extensionNumber ?? fallback.extensionNumber,
    queueNumber: row.queueNumber ?? fallback.queueNumber,
  });
}

async function emitCallEndedOnce(
  callId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (endedWebhookSent.has(callId)) {
    cdrMetrics.endedWebhookDeduped++;
    return;
  }
  endedWebhookSent.add(callId);
  if (endedWebhookSent.size > 50_000) {
    // Bound memory on long-lived processes; oldest semantics not required.
    endedWebhookSent.clear();
    endedWebhookSent.add(callId);
  }
  try {
    const { dispatchWebhooks } = await import("./webhooks.js");
    await dispatchWebhooks("call.ended", { callId, ...payload });
    cdrMetrics.endedWebhookEmitted++;
  } catch {
    /* ignore */
  }
}

/**
 * Open (or resume) a CDR keyed by Asterisk UNIQUEID / ARI channel id.
 * Idempotent: retries and concurrent starts never create a second row for the
 * same callId (advisory lock + UNIQUE(call_id)).
 */
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
  if (open.has(opts.callId)) {
    cdrMetrics.startExisting++;
    return;
  }

  let dndFlag = !!opts.dndFlag;
  if (!dndFlag && opts.callee) {
    try {
      const { extensions } = await import("../db/schema.js");
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

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${opts.callId}))`);

      const [existing] = await tx
        .select()
        .from(cdr)
        .where(eq(cdr.callId, opts.callId))
        .limit(1);

      if (existing) {
        cdrMetrics.startExisting++;
        if (!existing.endedAt) {
          hydrateOpenFromRow(opts.callId, existing, opts);
        }
        return;
      }

      const startedAt = new Date();
      await tx.insert(cdr).values({
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
      open.set(opts.callId, {
        startedAt,
        direction: opts.direction,
        caller: opts.caller,
        callee: opts.callee,
        did: opts.did,
        extensionNumber: opts.extensionNumber,
        queueNumber: opts.queueNumber,
      });
      cdrMetrics.startOk++;
    });
  } catch (e) {
    cdrMetrics.startErrors++;
    console.warn("[cdr] start failed", (e as Error).message);
    try {
      const [row] = await db
        .select()
        .from(cdr)
        .where(eq(cdr.callId, opts.callId))
        .limit(1);
      if (row && !row.endedAt) {
        hydrateOpenFromRow(opts.callId, row, opts);
        cdrMetrics.startRaceRecovered++;
      }
    } catch {
      /* ignore */
    }
  }
}

export async function cdrAnswered(callId: string): Promise<void> {
  const mem = open.get(callId);
  if (mem?.answeredAt) {
    cdrMetrics.answeredNoop++;
    return;
  }
  const answeredAt = new Date();
  if (mem) mem.answeredAt = answeredAt;

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${callId}))`);
      const [row] = await tx.select().from(cdr).where(eq(cdr.callId, callId)).limit(1);
      if (!row) return;
      if (row.answeredAt) {
        cdrMetrics.answeredNoop++;
        return;
      }
      // Update by primary key only — never paint multiple historical duplicates.
      await tx
        .update(cdr)
        .set({ answeredAt, disposition: "ANSWERED" })
        .where(eq(cdr.id, row.id));
      cdrMetrics.answeredOk++;
    });
  } catch {
    /* ignore */
  }

  try {
    const { dispatchWebhooks } = await import("./webhooks.js");
    void dispatchWebhooks("call.answered", {
      callId,
      caller: mem?.caller,
      callee: mem?.callee,
      did: mem?.did,
      extension: mem?.extensionNumber,
      queue: mem?.queueNumber,
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

  let finalized = false;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${callId}))`);
      const [row] = await tx.select().from(cdr).where(eq(cdr.callId, callId)).limit(1);
      if (!row) return;

      const existingBill = row.billsec ?? 0;

      // Finished with talk time: never rewrite (retry / late override).
      if (row.endedAt && existingBill > 0) {
        cdrMetrics.endNoopFinished++;
        return;
      }

      // Finished with billsec=0: allow dialplan finalize enrichment once.
      if (row.endedAt && existingBill === 0 && overrides && (overrides.billsec ?? 0) > 0) {
        await tx
          .update(cdr)
          .set({
            billsec: overrides.billsec!,
            duration: overrides.duration ?? row.duration ?? overrides.billsec!,
            disposition: disposition ?? row.disposition ?? "ANSWERED",
            ...(row.answeredAt ? {} : { answeredAt: endedAt }),
          })
          .where(and(eq(cdr.id, row.id), eq(cdr.callId, callId)));
        cdrMetrics.endEnriched++;
        return;
      }

      if (row.endedAt) {
        cdrMetrics.endNoopFinished++;
        return;
      }

      await tx
        .update(cdr)
        .set({
          endedAt,
          duration,
          billsec,
          disposition:
            disposition ?? (answeredAt || billsec > 0 ? "ANSWERED" : "NOANSWER"),
        })
        .where(and(eq(cdr.id, row.id), isNull(cdr.endedAt)));
      finalized = true;
      cdrMetrics.endFinalized++;
    });
  } catch (e) {
    cdrMetrics.endErrors++;
    console.warn("[cdr] end failed", (e as Error).message);
  }

  if (finalized) {
    await emitCallEndedOnce(callId, {
      disposition: disposition ?? (answeredAt || billsec > 0 ? "ANSWERED" : "NOANSWER"),
      billsec,
      duration,
      caller: mem?.caller,
      callee: mem?.callee,
      direction: mem?.direction,
    });
  }

  // Unanswered / zero talk: drop empty wavs after first finalize or enrich-noop paths
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

/** Open in-memory CDR count (long-lived open channels). */
export function cdrOpenCount(): number {
  return open.size;
}

/** Reset process-local webhook dedupe (tests only). */
export function __resetCdrWebhookDedupeForTests(): void {
  endedWebhookSent.clear();
}

/** Snapshot for health / admin integrity. */
export function getCdrMetricsSnapshot(): typeof cdrMetrics & { openCount: number } {
  return { ...cdrMetrics, openCount: open.size };
}
