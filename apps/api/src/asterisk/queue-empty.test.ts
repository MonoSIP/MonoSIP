import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ db: {} }));

import { queueEmptyRules } from "./config-writer.js";

describe("queueEmptyRules", () => {
  it("lets callers join and stay when no empty destination is set", () => {
    expect(queueEmptyRules(false)).toEqual({ joinempty: "yes", leavewhenempty: "no" });
  });

  it("treats unregistered (unavailable) agents as empty when an empty destination is set", () => {
    const r = queueEmptyRules(true);
    for (const v of [r.joinempty, r.leavewhenempty]) {
      expect(v.split(",")).toEqual(expect.arrayContaining(["unavailable", "paused", "invalid"]));
      // Busy agents still count as present: callers wait for them.
      expect(v.split(",")).not.toContain("inuse");
    }
  });
});
