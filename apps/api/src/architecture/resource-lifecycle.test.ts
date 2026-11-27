/**
 * Resource lifecycle: timers, WS teardown, job error handlers, unbounded Maps.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(fileURLToPath(new URL("..", import.meta.url)));

function read(rel: string) {
  return readFileSync(join(SRC, rel), "utf8");
}

describe("resource lifecycle architecture", () => {
  it("ws route installs teardown before await and clears intervals", () => {
    const ws = read("routes/ws.ts");
    expect(ws).toContain("socket.on(\"close\", () => teardown())");
    expect(ws).toContain("clearInterval(tick)");
    expect(ws).toContain("clearInterval(ping)");
    expect(ws).toContain("liveEvents.off");
  });

  it("every background job start* guards the cycle against unhandled rejection", () => {
    const jobsDir = join(SRC, "jobs");
    const files = readdirSync(jobsDir).filter(
      (f) => f.endsWith(".ts") && !f.includes(".test."),
    );
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const f of files) {
      const text = read(`jobs/${f}`);
      if (!text.includes("export function start")) continue;
      const guarded = /\.catch\(/.test(text) || /catch\s*\(/.test(text);
      expect(guarded, `${f} must catch job cycle failures`).toBe(true);
    }
  });

  it("liveEvents caps max listeners to avoid EventEmitter warnings under many WS clients", () => {
    const live = read("lib/live-events.ts");
    expect(live).toContain("setMaxListeners(100)");
  });

  it("retention prunes expired sessions (unbounded growth guard)", () => {
    const ret = read("jobs/retention.ts");
    expect(ret).toContain("pruneExpiredSessions");
    expect(ret).toContain("lt(sessions.expiresAt");
  });

  it("boot starts retention + recording purge + TTS cache purge", () => {
    const index = read("index.ts");
    expect(index).toContain("startRetentionJob");
    expect(index).toContain("purgeZeroSecondRecordings");
    expect(index).toContain("purgeExpiredTtsCache");
  });
});
