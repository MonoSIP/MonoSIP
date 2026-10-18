import { afterAll, afterEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { outboundRoutes, trunks } from "../db/schema.js";
import { closeDb } from "../test/helpers.js";
import { resolveOutboundDial } from "./call-policy.js";

/** Outbound route → trunk selection, including provider failover order. */

const created: { trunkIds: string[]; routeIds: string[] } = { trunkIds: [], routeIds: [] };

async function trunk(name: string, enabled = true) {
  const [t] = await db.insert(trunks).values({ name, host: `${name}.example.test`, enabled }).returning();
  created.trunkIds.push(t.id);
  return t;
}

async function route(pattern: string, trunkIds: string[]) {
  const [r] = await db
    .insert(outboundRoutes)
    .values({ name: `failover ${pattern}`, pattern, trunkIds })
    .returning();
  created.routeIds.push(r.id);
  return r;
}

afterEach(async () => {
  if (created.routeIds.length) await db.delete(outboundRoutes).where(inArray(outboundRoutes.id, created.routeIds));
  if (created.trunkIds.length) await db.delete(trunks).where(inArray(trunks.id, created.trunkIds));
  created.trunkIds = [];
  created.routeIds = [];
});

afterAll(async () => {
  await closeDb();
});

describe("resolveOutboundDial — provider failover", () => {
  it("returns the first enabled trunk and the rest as ordered fallbacks", async () => {
    const a = await trunk("fo-a");
    const off = await trunk("fo-off", false);
    const b = await trunk("fo-b");
    const c = await trunk("fo-c");
    const r = await route("77771234", [a.id, off.id, b.id, c.id]);

    const res = await resolveOutboundDial("777712345678");
    expect(res).toEqual({
      trunkEndpoint: `trunk_${a.id.slice(0, 8)}`,
      dialNumber: "777712345678",
      routeId: r.id,
      fallbackEndpoints: [`trunk_${b.id.slice(0, 8)}`, `trunk_${c.id.slice(0, 8)}`],
    });
  });

  it("skips a disabled primary and has no fallbacks for a single usable trunk", async () => {
    const off = await trunk("fo-off2", false);
    const a = await trunk("fo-a2");
    await route("77771235", [off.id, a.id]);

    const res = await resolveOutboundDial("777712350000");
    expect(res?.trunkEndpoint).toBe(`trunk_${a.id.slice(0, 8)}`);
    expect(res?.fallbackEndpoints).toEqual([]);
  });
});
