import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ db: {} }));

import { singleFlight } from "./config-writer.js";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("singleFlight (config write + Asterisk reload)", () => {
  it("never overlaps runs and coalesces a burst into one follow-up", async () => {
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    const run = singleFlight(async () => {
      runs++;
      active++;
      maxActive = Math.max(maxActive, active);
      await tick();
      active--;
    });
    // A burst like four quick DND toggles: one run now + exactly one follow-up.
    await Promise.all([run(), run(), run(), run()]);
    expect(maxActive).toBe(1);
    expect(runs).toBe(2);
  });

  it("a call made during a run waits for a run that starts after it", async () => {
    const order: string[] = [];
    let n = 0;
    const run = singleFlight(async () => {
      const id = ++n;
      order.push(`start${id}`);
      await tick();
      order.push(`end${id}`);
    });
    const first = run();
    await Promise.resolve();
    const second = run(); // made while run 1 is active → must see run 2
    await second;
    await first;
    expect(order).toEqual(["start1", "end1", "start2", "end2"]);
  });

  it("keeps working after a failed run", async () => {
    let fail = true;
    const run = singleFlight(async () => {
      if (fail) {
        fail = false;
        throw new Error("asterisk down");
      }
    });
    await expect(run()).rejects.toThrow("asterisk down");
    await expect(run()).resolves.toBeUndefined();
  });
});
