import { vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { settings } from "../db/schema.js";

/**
 * Shared harness for the timer-driven job modules in src/jobs/*.
 *
 * Two lessons from jobs.int.test.ts are baked in here:
 *
 * 1. Fake ONLY Date and setInterval. Faking every timer leaves no real event
 *    loop, and these jobs are fire-and-forget (`void runX()`), so their
 *    Postgres/AMI round-trip can never complete. Leaving setTimeout and
 *    setImmediate real lets `settle()` poll on real I/O.
 *
 * 2. `settings` is a suite-wide singleton (id = 1). Every job reads policy from
 *    it, so it must be snapshotted before a test and written back afterwards or
 *    the job tests silently corrupt every other suite.
 */

export const NOW = new Date("2026-06-15T12:00:00Z");

export function installJobTimers(): void {
  vi.useFakeTimers({ now: NOW, toFake: ["Date", "setInterval", "clearInterval"] });
}

/** Poll `fn` on the real event loop until it returns true, or give up. */
export async function settle(fn: () => Promise<boolean>, tries = 50): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

/** Merge a patch into the settings singleton (what the admin UI effectively does). */
export async function setSettings(data: Record<string, unknown>): Promise<void> {
  await db
    .insert(settings)
    .values({ id: 1, data })
    .onConflictDoUpdate({ target: settings.id, set: { data } });
}

export async function snapshotSettings(): Promise<unknown> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return row ? structuredClone(row.data) : null;
}

export async function restoreSettings(snapshot: unknown): Promise<void> {
  if (snapshot === null) {
    await db.delete(settings).where(eq(settings.id, 1));
    return;
  }
  await db
    .insert(settings)
    .values({ id: 1, data: snapshot })
    .onConflictDoUpdate({ target: settings.id, set: { data: snapshot } });
}

/**
 * Capture what a `start*Job` wrapper registers instead of racing the real
 * clock. Returns the period and a handle to invoke the callback directly, which
 * is the deterministic way to prove the periodic run does real work.
 */
export function captureInterval(): {
  restore: () => void;
  period: () => number;
  tick: () => () => void;
} {
  let cb: (() => void) | undefined;
  let ms = 0;
  const spy = vi.spyOn(globalThis, "setInterval").mockImplementation(((
    fn: () => void,
    delay: number,
  ) => {
    cb = fn;
    ms = delay;
    return 0 as unknown as NodeJS.Timeout;
  }) as never);
  return {
    restore: () => spy.mockRestore(),
    period: () => ms,
    tick: () => {
      if (!cb) throw new Error("no interval callback was registered");
      return cb;
    },
  };
}