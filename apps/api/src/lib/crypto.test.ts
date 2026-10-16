import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacSign, scryptHash, scryptVerify } from "./crypto.js";

describe("hmacSign", () => {
  it("matches the canonical HMAC-SHA256 of the body", () => {
    const secret = "s3cr3t";
    const body = "user_id=7&amount=10";
    expect(hmacSign(secret, body)).toBe(createHmac("sha256", secret).update(body).digest("hex"));
  });

  it("is not a bare sha256(secret + body) concat (length-extension forgeable)", () => {
    const secret = "s3cr3t";
    const body = "user_id=7";
    const naive = createHash("sha256").update(secret + body).digest("hex");
    expect(hmacSign(secret, body)).not.toBe(naive);
  });

  it("depends on both secret and body", () => {
    expect(hmacSign("a", "x")).not.toBe(hmacSign("b", "x"));
    expect(hmacSign("a", "x")).not.toBe(hmacSign("a", "y"));
  });
});

describe("scryptHash / scryptVerify", () => {
  it("round-trips a correct password", () => {
    const stored = scryptHash("correct horse");
    expect(scryptVerify("correct horse", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = scryptHash("correct horse");
    expect(scryptVerify("wrong horse", stored)).toBe(false);
  });

  it("salts each hash so identical passwords differ", () => {
    expect(scryptHash("same")).not.toBe(scryptHash("same"));
  });

  it("returns false instead of throwing on a truncated/garbage stored value", () => {
    // A malformed hash previously produced a length-mismatched compare; it must
    // be rejected cleanly rather than throw.
    expect(() => scryptVerify("pw", "onlysalt:")).not.toThrow();
    expect(scryptVerify("pw", "onlysalt:")).toBe(false);
    expect(scryptVerify("pw", "")).toBe(false);
    expect(scryptVerify("pw", "noseparator")).toBe(false);
  });
});