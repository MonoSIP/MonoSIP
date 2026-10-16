import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { missedCalls, queues } from "../db/schema.js";
import { config } from "../config.js";
import { fetchQueueAvailableAgents, fetchQueueWaiting } from "../lib/ami.js";
import {
  decodeCallbackPlace,
  shouldDialQueueCallback,
} from "../asterisk/flow-logic.js";

/**
 * Process pending queue-callback rows (target `qcb:<queueNumber>`).
 * Callers who opted in keep their place: we only originate when the live
 * queue waiting count is below their saved place (or empty) and an agent is free.
 */
export async function processQueueCallbacks(): Promise<number> {
  const pending = await db.select().from(missedCalls);
  const rows = pending
    .filter((m) => m.status === "pending" && (m.target ?? "").startsWith("qcb:"))
    .sort((a, b) => {
      const pa = decodeCallbackPlace(a.callbackCallId) ?? 9999;
      const pb = decodeCallbackPlace(b.callbackCallId) ?? 9999;
      if (pa !== pb) return pa - pb;
      return a.at.getTime() - b.at.getTime();
    });

  let originated = 0;
  const claimedQueues = new Set<string>();

  for (const row of rows) {
    const queueNumber = (row.target ?? "").replace(/^qcb:/, "");
    if (!queueNumber || claimedQueues.has(queueNumber)) continue;

    const qs = await db.select().from(queues).where(eq(queues.number, queueNumber));
    if (!qs[0]?.callbackEnabled) {
      await db.update(missedCalls).set({ status: "failed" }).where(eq(missedCalls.id, row.id));
      continue;
    }

    const waiting = await fetchQueueWaiting(queueNumber);
    const available = await fetchQueueAvailableAgents(queueNumber);
    const place = decodeCallbackPlace(row.callbackCallId);
    if (!shouldDialQueueCallback(waiting, place) || available < 1) continue;

    claimedQueues.add(queueNumber);
    await db
      .update(missedCalls)
      .set({ status: "calling", callbackCallId: null })
      .where(eq(missedCalls.id, row.id));
    const channelId = await originateQueueCallback(queueNumber, row.number);
    await db
      .update(missedCalls)
      .set({
        status: channelId ? "returned" : "pending",
        callbackCallId: channelId || (place != null ? `place:${place}` : null),
      })
      .where(eq(missedCalls.id, row.id));
    if (channelId) originated++;
  }
  return originated;
}

/** Originate outbound callback to a number, then join queue. Returns ARI channel id or null. */
export async function originateQueueCallback(
  queueNumber: string,
  toNumber: string,
): Promise<string | null> {
  const qs = await db.select().from(queues).where(eq(queues.number, queueNumber));
  if (!qs[0]?.callbackEnabled) {
    console.warn(`[qcb] queue ${queueNumber} callback disabled`);
  }
  const endpoint = /^\d{3,4}$/.test(toNumber)
    ? `PJSIP/${toNumber}`
    : `Local/${toNumber}@from-internal`;
  const params = new URLSearchParams({
    endpoint,
    extension: queueNumber,
    context: "from-internal",
    priority: "1",
    timeout: "45",
    callerId: `Callback <${queueNumber}>`,
  });
  const res = await fetch(`${config.asterisk.ariUrl.replace(/\/$/, "")}/ari/channels?${params}`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${config.asterisk.ariUser}:${config.asterisk.ariPassword}`).toString("base64"),
    },
  });
  if (!res.ok) {
    console.warn("[qcb] originate failed", await res.text());
    return null;
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  console.log(`[qcb] originated ${toNumber} → queue ${queueNumber} ch=${body.id ?? "?"}`);
  return body.id ?? "ok";
}

export function startQueueCallbackJob(intervalMs = 15_000) {
  void processQueueCallbacks();
  return setInterval(() => void processQueueCallbacks(), intervalMs);
}
