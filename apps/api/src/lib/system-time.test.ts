import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ db: {} }));

import { applyTimezone, sntpOffset, systemTimezone, utcOffsetLabel } from "./system-time.js";

describe("sntpOffset", () => {
  it("is zero for a server that agrees with the local clock", () => {
    // 20 ms each way, server holds 5 ms
    expect(sntpOffset(1000, 1020, 1025, 1045)).toEqual({ offsetMs: 0, roundTripMs: 40 });
  });

  it("is positive when the local clock runs ahead of the server", () => {
    // Local clock 3 s ahead: server stamps read 3000 ms earlier
    expect(sntpOffset(10_000, 7_020, 7_025, 10_045)).toEqual({ offsetMs: 3000, roundTripMs: 40 });
  });

  it("is negative when the local clock is behind", () => {
    expect(sntpOffset(10_000, 12_020, 12_025, 10_045).offsetMs).toBe(-2000);
  });
});

describe("applyTimezone", () => {
  it("switches the process zone and ignores unknown names", () => {
    expect(applyTimezone("Europe/Berlin")).toBe("Europe/Berlin");
    expect(process.env.TZ).toBe("Europe/Berlin");
    expect(applyTimezone("Mars/Olympus")).toBe("Europe/Berlin");
    expect(applyTimezone("  ")).toBe("Europe/Berlin");
    expect(applyTimezone("Europe/Istanbul")).toBe("Europe/Istanbul");
    expect(systemTimezone()).toBe("Europe/Istanbul");
  });

  it("labels the UTC offset", () => {
    expect(utcOffsetLabel("Europe/Istanbul", new Date("2026-11-26T12:00:00Z"))).toBe("+03:00");
    expect(utcOffsetLabel("UTC", new Date("2026-11-26T12:00:00Z"))).toBe("+00:00");
  });
});
