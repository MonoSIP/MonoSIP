import { describe, expect, it, vi } from "vitest";

vi.mock("../asterisk/ari.js", () => ({
  ari: {
    listPjsipEndpoints: vi.fn(async () => [
      { resource: "101", state: "online", channel_ids: [] },
      { resource: "102", state: "online", channel_ids: ["c1"] },
      { resource: "103", state: "offline", channel_ids: [] },
      { resource: "105", state: "offline", channel_ids: [] },
      { resource: "105w", state: "online", channel_ids: [] },
      { resource: "106w", state: "online", channel_ids: ["c2"] },
    ]),
  },
}));

import { extensionPresence } from "./presence.js";

describe("extensionPresence", () => {
  it("takes DND from the table and the rest from live Asterisk state", async () => {
    const p = await extensionPresence([
      { number: "100", dnd: false },
      { number: "101", dnd: false },
      { number: "102", dnd: false },
      { number: "103", dnd: false },
      { number: "104", dnd: true },
    ]);
    expect(Object.fromEntries(p)).toEqual({ "100": "offline", "101": "online", "102": "busy", "103": "offline", "104": "dnd" });
  });

  it("DND wins over a registered phone", async () => {
    const p = await extensionPresence([{ number: "101", dnd: true }]);
    expect(p.get("101")).toBe("dnd");
  });

  it("counts the browser softphone endpoint (<number>w) as the same extension", async () => {
    const p = await extensionPresence([
      { number: "105", dnd: false },
      { number: "106", dnd: false },
    ]);
    expect(Object.fromEntries(p)).toEqual({ "105": "online", "106": "busy" });
  });
});
