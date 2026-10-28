import { describe, expect, it } from "vitest";
import {
  decideAnnounceResult,
  dialReasonFromCause,
  prefixAllowed,
  rateBlock,
  webhookUrlOk,
} from "./announce-policy.js";

describe("prefixAllowed", () => {
  it("allows every number when the list is empty", () => {
    expect(prefixAllowed("+905321112233", [])).toBe(true);
  });

  it("matches the digit prefix and ignores formatting", () => {
    expect(prefixAllowed("+90 532 111 22 33", ["90", "05"])).toBe(true);
    expect(prefixAllowed("02121112233", ["05"])).toBe(false);
  });
});

describe("rateBlock", () => {
  it("does not cap when both limits are empty", () => {
    expect(rateBlock({ perMinute: null, recent: 100, maxConcurrent: null, active: 20 })).toBeNull();
  });

  it("blocks on the per-minute count and on live calls", () => {
    expect(rateBlock({ perMinute: 2, recent: 2, maxConcurrent: null, active: 0 })).toBe("minute");
    expect(rateBlock({ perMinute: null, recent: 0, maxConcurrent: 1, active: 1 })).toBe("concurrent");
  });
});

describe("webhookUrlOk", () => {
  it("accepts a missing URL and https, and rejects http", () => {
    expect(webhookUrlOk(undefined)).toBe(true);
    expect(webhookUrlOk("https://example.com/hook")).toBe(true);
    expect(webhookUrlOk("http://example.com/hook")).toBe(false);
    expect(webhookUrlOk("not a url")).toBe(false);
  });
});

describe("decideAnnounceResult", () => {
  it("succeeds when the line is answered", () => {
    expect(
      decideAnnounceResult({ mode: "answered", answered: true, played: false, digits: "" }),
    ).toEqual({ ok: true, reason: "answered", digits: null });
  });

  it("requires the announcement to finish", () => {
    expect(
      decideAnnounceResult({ mode: "played", answered: true, played: true, digits: "" }),
    ).toEqual({ ok: true, reason: "played", digits: null });
    expect(
      decideAnnounceResult({ mode: "played", answered: true, played: false, digits: "" }),
    ).toEqual({ ok: false, reason: "playback", digits: null });
  });

  it("requires at least one digit and reports the sequence", () => {
    expect(
      decideAnnounceResult({ mode: "dtmf", answered: true, played: true, digits: "12" }),
    ).toEqual({ ok: true, reason: "dtmf", digits: "12" });
    expect(
      decideAnnounceResult({ mode: "dtmf", answered: true, played: true, digits: "" }),
    ).toEqual({ ok: false, reason: "no-digit", digits: null });
  });

  it("maps an unanswered dial to busy or no-answer", () => {
    expect(dialReasonFromCause(17)).toBe("busy");
    expect(dialReasonFromCause(19)).toBe("no-answer");
    expect(
      decideAnnounceResult({
        mode: "played",
        answered: false,
        played: false,
        digits: "",
        dial: "busy",
      }),
    ).toEqual({ ok: false, reason: "busy", digits: null });
  });
});
