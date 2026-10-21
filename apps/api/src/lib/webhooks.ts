import { eq } from "drizzle-orm";
import { createHmac } from "node:crypto";
import { db } from "../db/client.js";
import { webhooks } from "../db/schema.js";

export type WebhookEvent =
  | "call.ringing"
  | "call.answered"
  | "call.ended"
  | "call.missed";

export async function dispatchWebhooks(
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const rows = await db.select().from(webhooks).where(eq(webhooks.active, true));
  const body = JSON.stringify({
    event,
    at: new Date().toISOString(),
    data: payload,
  });
  await Promise.allSettled(
    rows
      .filter((w) => {
        const evs = w.events as string[];
        return Array.isArray(evs) && evs.includes(event);
      })
      .map(async (w) => {
        const sig = createHmac("sha256", w.secret).update(body).digest("hex");
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(w.url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-munasip-signature": sig,
                "x-munasip-event": event,
              },
              body,
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) return;
          } catch {
            /* retry */
          }
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
        console.warn(`[webhook] failed ${event} → ${w.url}`);
      }),
  );
}
