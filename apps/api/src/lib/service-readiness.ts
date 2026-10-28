/** First dialplan write of this process has finished. NineDeploy must not cut over before that. */
let dialplanReady = false;

export function markDialplanReady(): void {
  dialplanReady = true;
}

export function isDialplanReady(): boolean {
  return dialplanReady;
}

/** True only when the PBX can take calls: database, Asterisk, and a loaded dialplan. */
export function isServingReady(parts: { db: boolean; asterisk: boolean; dialplan: boolean }): boolean {
  return parts.db && parts.asterisk && parts.dialplan;
}

/**
 * ARI answering is enough. Probing with `asterisk -rx` on every health check
 * opens a CLI socket each time, and Asterisk logs "Remote UNIX connection" /
 * "disconnected" for every one of those.
 */
export async function asteriskUsable(ariUp: boolean): Promise<boolean> {
  return ariUp;
}
