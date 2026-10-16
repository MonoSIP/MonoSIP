import { describe, expect, it } from "vitest";
import { destForScheduleStatus, matchBlacklistPattern, resolveExtensionNumber } from "./routing.js";

/**
 * Pure-logic coverage for asterisk/routing.ts. The DB-backed exports
 * (isBlacklisted, evaluateScheduleStatus, resolveInbound, resolveExtensionDial,
 * forwardingOnStatus) need a live Postgres and are exercised separately.
 */

describe("matchBlacklistPattern", () => {
  const number = "05321112233";

  it.each([
    // Digit substring and wildcard forms.
    ["532", true],
    ["05321112233", true],
    ["0532*", true],
    ["*12233", true],
    ["0532111?233", true],
    ["0212*", false],
    ["0212", false],
    ["999", false],
    // Formatted patterns: digits are stripped before substring comparison.
    ["(0532)", true],
    // A pattern with no digits must never match, otherwise every caller is
    // blacklisted: "abc" stripped of non-digits is "" and x.includes("") is true.
    ["abc", false],
    ["+", false],
    ["--", false],
    ["blocked", false],
    // Empty / whitespace-only patterns are inert.
    ["", false],
    ["   ", false],
  ])("pattern %j -> %s", (pattern, expected) => {
    expect(matchBlacklistPattern(number, pattern as string)).toBe(expected);
  });

  it("anchors wildcard patterns to the whole number", () => {
    // "53*" must not match a number that merely contains 53 in the middle.
    expect(matchBlacklistPattern("05321112233", "532*")).toBe(false);
    expect(matchBlacklistPattern("05321112233", "*2111*")).toBe(true);
  });

  it("escapes regex metacharacters even in a wildcard pattern", () => {
    // Without escaping, "." would match any character and this would match.
    expect(matchBlacklistPattern("05321112233", "0532.11*")).toBe(false);
    expect(matchBlacklistPattern("05321112233", "0532*")).toBe(true);
  });
});

describe("resolveExtensionNumber", () => {
  const exts = [
    { id: "uuid-101", number: "101" },
    { id: "uuid-102", number: "102" },
  ];

  it.each([
    ["101", "101"],
    ["102", "102"],
    ["12", "12"],
    ["  101  ", "101"],
    ["uuid-102", "102"],
    ["uuid-101", "101"],
    ["unknown-uuid", null],
    // Any 2-8 digit value is an extension number by contract, even if no such
    // extension exists — it passes through rather than resolving to null.
    ["999", "999"],
    ["", null],
  ])("destId %j -> %j", (destId, expected) => {
    expect(resolveExtensionNumber(destId as string, exts)).toBe(expected);
  });

  it("returns null for a nullish destId", () => {
    expect(resolveExtensionNumber(null, exts)).toBeNull();
    expect(resolveExtensionNumber(undefined, exts)).toBeNull();
  });

  it("prefers a literal 2-8 digit number over an id lookup", () => {
    // A numeric destId is an extension number by contract.
    expect(resolveExtensionNumber("101", exts)).toBe("101");
  });
});

describe("destForScheduleStatus", () => {
  const full = {
    openDestType: "flow",
    openDestId: "open-id",
    lunchDestType: "queue",
    lunchDestId: "lunch-q",
    closedDestType: "hangup",
    closedDestId: null,
    holidayDestType: null,
    holidayDestId: null,
  } as Parameters<typeof destForScheduleStatus>[0];

  const sparse = {
    openDestType: null,
    openDestId: null,
    lunchDestType: null,
    lunchDestId: null,
    closedDestType: "hangup",
    closedDestId: "closed-id",
    holidayDestType: null,
    holidayDestId: null,
  } as Parameters<typeof destForScheduleStatus>[0];

  it.each([
    ["open", { destType: "flow", destId: "open-id" }],
    ["lunch", { destType: "queue", destId: "lunch-q" }],
    ["closed", { destType: "hangup", destId: null }],
    ["holiday", { destType: "hangup", destId: null }],
  ] as const)("status %s on a fully-populated schedule", (status, expected) => {
    expect(destForScheduleStatus(full, status)).toEqual(expected);
  });

  it("falls back to closedDestType/Id when a specific dest type is unset", () => {
    expect(destForScheduleStatus(sparse, "open")).toEqual({
      destType: "flow",
      destId: null,
    });
    expect(destForScheduleStatus(sparse, "lunch")).toEqual({
      destType: "hangup",
      destId: "closed-id",
    });
    expect(destForScheduleStatus(sparse, "holiday")).toEqual({
      destType: "hangup",
      destId: "closed-id",
    });
  });

  it("defaults destType to flow when nothing is configured", () => {
    const empty = {
      openDestType: null,
      openDestId: null,
      lunchDestType: null,
      lunchDestId: null,
      closedDestType: null,
      closedDestId: null,
      holidayDestType: null,
      holidayDestId: null,
    } as Parameters<typeof destForScheduleStatus>[0];
    expect(destForScheduleStatus(empty, "closed")).toEqual({
      destType: "flow",
      destId: null,
    });
  });
});