import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions } from "../db/schema.js";
import { pruneExpiredSessions } from "./retention.js";

/**
 * Regression for the unbounded `sessions` growth: expired rows must be deleted,
 * live rows must be kept. (resolveActor already ignores expired rows, but they
 * were never purged.)
 */
describe("pruneExpiredSessions", () => {
  const tokens: string[] = [];

  afterEach(async () => {
    if (tokens.length) await db.delete(sessions).where(inArray(sessions.token, tokens));
    tokens.length = 0;
  });

  it("deletes expired sessions and keeps live ones", async () => {
    const expiredToken = `exp-${randomUUID()}`;
    const liveToken = `live-${randomUUID()}`;
    tokens.push(expiredToken, liveToken);

    await db.insert(sessions).values([
      {
        token: expiredToken,
        actorType: "admin",
        actorId: randomUUID(),
        expiresAt: new Date(Date.now() - 60_000), // 1 min in the past
      },
      {
        token: liveToken,
        actorType: "extension",
        actorId: randomUUID(),
        expiresAt: new Date(Date.now() + 3_600_000), // 1 h in the future
      },
    ]);

    const pruned = await pruneExpiredSessions();
    expect(pruned).toBeGreaterThanOrEqual(1);

    const [expired] = await db.select().from(sessions).where(eq(sessions.token, expiredToken));
    const [live] = await db.select().from(sessions).where(eq(sessions.token, liveToken));
    expect(expired).toBeUndefined();
    expect(live?.token).toBe(liveToken);
  });
});
