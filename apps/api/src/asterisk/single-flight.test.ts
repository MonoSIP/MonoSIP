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

import { sipFromDomain, trunkCallerLines } from "./config-writer.js";

describe("trunkCallerLines", () => {
  it("sends the operator number instead of the SIP login", () => {
    expect(trunkCallerLines({ username: "936494", callerId: "+442045773102" })).toEqual([
      "from_user=+442045773102",
      "callerid=+442045773102",
    ]);
  });

  it("keeps the SIP username when no caller ID is set", () => {
    expect(trunkCallerLines({ username: "936494", callerId: "  " })).toEqual(["from_user=936494"]);
    expect(trunkCallerLines({ username: null, callerId: null })).toEqual([]);
  });

  it("quotes a display name and keeps the number in From", () => {
    expect(trunkCallerLines({ username: "936494", callerId: "Acme <+442045773102>" })).toEqual([
      "from_user=+442045773102",
      'callerid="Acme" <+442045773102>',
    ]);
    expect(trunkCallerLines({ username: "936494", callerId: '"Acme Ltd" <+442045773102>' })).toEqual([
      "from_user=+442045773102",
      'callerid="Acme Ltd" <+442045773102>',
    ]);
  });

  it("uses a name alone as the display name and the SIP username as the number", () => {
    expect(trunkCallerLines({ username: "936494", callerId: "Acme Ltd" })).toEqual([
      "from_user=936494",
      'callerid="Acme Ltd" <936494>',
    ]);
  });

  it("drops a caller ID that would break the config line", () => {
    expect(trunkCallerLines({ username: "936494", callerId: "Acme;injection" })).toEqual([
      "from_user=936494",
    ]);
  });
});

describe("sipFromDomain", () => {
  it("keeps valid hostnames and IPv4 addresses", () => {
    expect(sipFromDomain("pbx.example.com")).toBe("pbx.example.com");
    expect(sipFromDomain("PBX.Example.com.")).toBe("pbx.example.com");
    expect(sipFromDomain("46.20.6.254")).toBe("46.20.6.254");
    expect(sipFromDomain("3cx.example.com")).toBe("3cx.example.com");
  });

  it("rejects hostnames SIP.js cannot parse (top label must start with a letter)", () => {
    expect(sipFromDomain("20579c14dcc0")).toBe("localhost");
    expect(sipFromDomain("pbx.123")).toBe("localhost");
    expect(sipFromDomain("")).toBe("localhost");
    expect(sipFromDomain("bad_host")).toBe("localhost");
  });
});

import { reloadPlan, reloadScript } from "./config-writer.js";

const none = { pjsip: false, acl: false, queues: false, extensions: false, moh: false };

describe("reloadPlan", () => {
  it("never reloads acl and res_pjsip together (that overlap wedged PJSIP)", () => {
    for (const firstRun of [true, false]) {
      const cmds = reloadPlan({ pjsip: true, acl: true, queues: true, extensions: true, moh: true }, firstRun);
      expect(cmds).toContain("module reload acl");
      expect(cmds).not.toContain("module reload res_pjsip.so");
    }
  });

  it("reloads only what changed — a DND toggle does not touch res_pjsip", () => {
    expect(reloadPlan({ ...none, queues: true, extensions: true }, false)).toEqual([
      "module reload app_queue.so",
      "module reload pbx_config.so",
    ]);
    expect(reloadPlan(none, false)).toEqual([]);
    expect(reloadPlan({ ...none, pjsip: true }, false)).toEqual(["module reload res_pjsip.so"]);
  });

  it("revives declined modules with `module load` on the first run only", () => {
    expect(reloadPlan(none, true).slice(0, 3)).toEqual([
      "module load res_pjsip.so",
      "module load app_queue.so",
      "module load pbx_config.so",
    ]);
    expect(reloadPlan(none, false).some((c) => c.startsWith("module load"))).toBe(false);
  });
});

describe("reloadScript", () => {
  it("waits for full boot, retries refused reloads and settles after an ACL reload", () => {
    const sh = reloadScript(["module reload acl", "module reload app_queue.so"]);
    expect(sh.split("\n")[0]).toContain("core waitfullybooted");
    expect(sh).toContain("didn't finish yet");
    expect(sh).toContain("rl 'module reload acl'; sleep 5");
    expect(sh).toContain("rl 'module reload app_queue.so'");
  });
});
