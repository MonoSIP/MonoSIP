import { describe, expect, it } from "vitest";
import { pageWindow } from "../components/ui";
import { pbxLocalToIso, setSystemTimezone } from "./datetime";

describe("pageWindow", () => {
  it("lists every page when there are few", () => {
    expect(pageWindow(1, 4)).toEqual([1, 2, 3, 4]);
  });

  it("keeps first, last and two either side, with gaps", () => {
    expect(pageWindow(10, 20)).toEqual([1, "gap", 8, 9, 10, 11, 12, "gap", 20]);
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, "gap", 20]);
    expect(pageWindow(20, 20)).toEqual([1, "gap", 18, 19, 20]);
  });
});

describe("pbxLocalToIso", () => {
  it("reads a filter date in the PBX zone, not the browser's", () => {
    setSystemTimezone("Europe/Istanbul");
    expect(pbxLocalToIso("2026-11-26")).toBe("2026-11-25T21:00:00.000Z");
    expect(pbxLocalToIso("2026-11-26", true)).toBe("2026-11-26T20:59:59.999Z");
    expect(pbxLocalToIso("2026-11-26T09:30")).toBe("2026-11-26T06:30:00.000Z");
  });

  it("follows daylight saving in zones that have it", () => {
    setSystemTimezone("Europe/Berlin");
    expect(pbxLocalToIso("2026-07-01T12:00")).toBe("2026-07-01T10:00:00.000Z");
    expect(pbxLocalToIso("2026-12-01T12:00")).toBe("2026-12-01T11:00:00.000Z");
    setSystemTimezone("Europe/Istanbul");
  });

  it("ignores text that is not a date", () => {
    expect(pbxLocalToIso("yesterday")).toBeNull();
  });
});
