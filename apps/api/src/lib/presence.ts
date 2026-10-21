import { ari } from "../asterisk/ari.js";

export type Presence = "dnd" | "busy" | "online" | "offline";

/**
 * One presence per extension, everywhere (dashboard, portal directory):
 * DND from the extensions table (the only DND source), otherwise live Asterisk
 * state — on a call → busy, registered → online, else offline.
 */
export async function extensionPresence(
  rows: Array<{ number: string; dnd: boolean | null }>,
): Promise<Map<string, Presence>> {
  const eps = new Map((await ari.listPjsipEndpoints()).map((e) => [e.resource, e]));
  const out = new Map<string, Presence>();
  for (const r of rows) {
    const ep = eps.get(r.number);
    out.set(
      r.number,
      r.dnd ? "dnd" : (ep?.channel_ids?.length ?? 0) > 0 ? "busy" : ep?.state === "online" ? "online" : "offline",
    );
  }
  return out;
}
