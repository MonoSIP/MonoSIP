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
    // Desk phone (101) and browser softphone (101w) are separate endpoints of one
    // extension. Only the desk one was read, so a web-only user showed offline.
    const both = [eps.get(r.number), eps.get(`${r.number}w`)];
    const busy = both.some((ep) => (ep?.channel_ids?.length ?? 0) > 0);
    const online = both.some((ep) => ep?.state === "online");
    out.set(r.number, r.dnd ? "dnd" : busy ? "busy" : online ? "online" : "offline");
  }
  return out;
}
