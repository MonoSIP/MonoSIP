import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Destination-type coverage for resolveDestination / loadPublishedFlow.
 * DB is mocked so unknown types never hit Postgres with a non-uuid id.
 */

vi.mock("../db/client.js", () => {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    then: (res: (v: unknown[]) => void) => Promise.resolve([]).then(res),
  };
  return {
    db: {
      select: () => chain,
    },
    pool: {},
  };
});

import { loadPublishedFlow, resolveDestination } from "./routing.js";

describe("resolveDestination external / terminal types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns external without querying flows by phone number", async () => {
    const resolved = await resolveDestination({
      destType: "external",
      destId: "908501112233",
    });
    expect(resolved).toEqual({ kind: "external", number: "908501112233" });
  });

  it("hangs up cleanly for announce_hangup and park", async () => {
    expect(await resolveDestination({ destType: "announce_hangup", destId: null })).toEqual({
      kind: "hangup",
      reason: "announce_hangup",
    });
    expect(await resolveDestination({ destType: "park", destId: null })).toEqual({
      kind: "hangup",
      reason: "park",
    });
  });
});

describe("loadPublishedFlow uuid guard", () => {
  it("returns null for a non-uuid id instead of querying Postgres", async () => {
    await expect(loadPublishedFlow("908501112233")).resolves.toBeNull();
  });
});
