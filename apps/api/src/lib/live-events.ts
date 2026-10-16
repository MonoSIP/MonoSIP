import { EventEmitter } from "node:events";

/** Process-wide bus for portal/admin live WS events (voicemail, missed, etc.). */
export const liveEvents = new EventEmitter();
liveEvents.setMaxListeners(100);

export function emitPortalEvent(
  type: "voicemail.new" | "missed.new" | "presence.update",
  payload: unknown,
) {
  liveEvents.emit(type, payload);
}
