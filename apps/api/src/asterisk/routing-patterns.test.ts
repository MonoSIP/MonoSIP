import { describe, expect, it } from "vitest";
import { destForScheduleStatus, matchBlacklistPattern } from "./routing.js";

describe("matchBlacklistPattern", () => {
  it("matches substring and wildcards", () => {
    expect(matchBlacklistPattern("05321112233", "532")).toBe(true);
    expect(matchBlacklistPattern("05321112233", "0532*")).toBe(true);
    expect(matchBlacklistPattern("05321112233", "0212*")).toBe(false);
  });
});

describe("destForScheduleStatus", () => {
  const sched = {
    openDestType: "flow",
    openDestId: "open-id",
    lunchDestType: "queue",
    lunchDestId: "lunch-q",
    closedDestType: "hangup",
    closedDestId: null,
    holidayDestType: null,
    holidayDestId: null,
  } as Parameters<typeof destForScheduleStatus>[0];

  it("picks open / lunch / closed / holiday fallbacks", () => {
    expect(destForScheduleStatus(sched, "open")).toEqual({ destType: "flow", destId: "open-id" });
    expect(destForScheduleStatus(sched, "lunch")).toEqual({ destType: "queue", destId: "lunch-q" });
    expect(destForScheduleStatus(sched, "closed")).toEqual({ destType: "hangup", destId: null });
    expect(destForScheduleStatus(sched, "holiday")).toEqual({ destType: "hangup", destId: null });
  });
});
