import { describe, expect, it } from "vitest";
import {
  classifyNumber,
  countryFromDialed,
  evaluateCountryPolicy,
  isAnonymousCaller,
  isEmergencyNumber,
  matchDialPattern,
} from "./call-policy.js";

describe("isEmergencyNumber", () => {
  it("recognizes TR/US emergency", () => {
    expect(isEmergencyNumber("112")).toBe(true);
    expect(isEmergencyNumber("911")).toBe(true);
    expect(isEmergencyNumber("101")).toBe(false);
  });
});

describe("countryFromDialed", () => {
  it("maps common prefixes", () => {
    expect(countryFromDialed("+905321112233")).toBe("TR");
    expect(countryFromDialed("00441234567890")).toBe("GB");
    expect(countryFromDialed("+12025550100")).toBe("US");
  });
});

describe("isAnonymousCaller", () => {
  it("detects restricted CLI", () => {
    expect(isAnonymousCaller("anonymous")).toBe(true);
    expect(isAnonymousCaller("")).toBe(true);
    expect(isAnonymousCaller("05321112233")).toBe(false);
  });
});

describe("classifyNumber", () => {
  it("classifies TR patterns", () => {
    expect(classifyNumber("112")).toBe("emergency");
    expect(classifyNumber("101")).toBe("internal");
    expect(classifyNumber("05321112233")).toBe("mobile");
    expect(classifyNumber("4440444")).toBe("short444");
    expect(classifyNumber("+33123456789")).toBe("international");
  });

  it("treats 0090 international access prefix the same as +90 and 90", () => {
    // All three dial forms of the same TR mobile number must classify alike,
    // otherwise the `0090…` form slips past the mobile permission check.
    expect(classifyNumber("00905551234567")).toBe("mobile");
    expect(classifyNumber("+905551234567")).toBe("mobile");
    expect(classifyNumber("905551234567")).toBe("mobile");
    // 0212 is an Istanbul landline (TR landline area codes begin 2/3).
    expect(classifyNumber("00902121234567")).toBe("localFixed");
  });
});

describe("matchDialPattern", () => {
  it("matches Asterisk-style patterns", () => {
    expect(matchDialPattern("05321112233", "_0XXXXXXXXXX")).toBe(true);
    expect(matchDialPattern("101", "_XXX")).toBe(true);
    expect(matchDialPattern("212*", "212*")).toBe(true);
    expect(matchDialPattern("999", "212")).toBe(false);
  });
});

describe("evaluateCountryPolicy", () => {
  it("allows only listed countries", () => {
    const s = { allowedCountries: ["TR", "DE"], blockedCountries: [] };
    expect(evaluateCountryPolicy("+905321112233", s).ok).toBe(true);
    expect(evaluateCountryPolicy("+4915112345678", s).ok).toBe(true);
    expect(evaluateCountryPolicy("+33123456789", s)).toEqual({ ok: false, reason: "country" });
  });

  it("blocks listed countries even when allowlist is ALL", () => {
    const s = { allowedCountries: ["ALL"], blockedCountries: ["IR", "SY"] };
    expect(evaluateCountryPolicy("+33123456789", s).ok).toBe(true);
    expect(evaluateCountryPolicy("+989121234567", s)).toEqual({
      ok: false,
      reason: "country-blocked",
    });
  });
});
