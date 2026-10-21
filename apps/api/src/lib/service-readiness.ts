import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** First dialplan write of this process has finished. NineDeploy must not cut over before that. */
let dialplanReady = false;
/** Local `asterisk -rx` has observed a full boot. Cleared when ARI drops. */
let localBooted = false;
/** This container has no Asterisk binary (Compose sidecar). ARI is the signal. */
let noLocalAsterisk = false;
let bootProbe: Promise<boolean | null> | null = null;

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
 * `core waitfullybooted` blocks until Asterisk finishes starting, so a short
 * timeout means "not yet". null: no local binary.
 */
function probeLocalAsteriskBooted(): Promise<boolean | null> {
  if (localBooted) return Promise.resolve(true);
  if (noLocalAsterisk) return Promise.resolve(null);
  if (!bootProbe) {
    bootProbe = execFileAsync("asterisk", ["-rx", "core waitfullybooted"], { timeout: 2000 })
      .then(() => true as boolean | null)
      .catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? null : false))
      .finally(() => {
        bootProbe = null;
      });
  }
  return bootProbe;
}

/** ARI up, and the local daemon fully booted when this container runs Asterisk. */
export async function asteriskUsable(ariUp: boolean): Promise<boolean> {
  if (!ariUp) {
    localBooted = false;
    return false;
  }
  const local = await probeLocalAsteriskBooted();
  if (local === null) {
    noLocalAsterisk = true;
    return true;
  }
  if (local) {
    localBooted = true;
    return true;
  }
  return false;
}
