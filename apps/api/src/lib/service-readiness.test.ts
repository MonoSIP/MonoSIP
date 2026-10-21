import { describe, expect, it } from "vitest";
import { isServingReady } from "./service-readiness.js";

describe("isServingReady", () => {
  it("stays down until the database, Asterisk, and dialplan are all up", () => {
    expect(isServingReady({ db: true, asterisk: false, dialplan: false })).toBe(false);
    expect(isServingReady({ db: true, asterisk: true, dialplan: false })).toBe(false);
    expect(isServingReady({ db: false, asterisk: true, dialplan: true })).toBe(false);
    expect(isServingReady({ db: true, asterisk: true, dialplan: true })).toBe(true);
  });
});
