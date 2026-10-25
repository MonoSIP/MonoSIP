import { describe, expect, it } from "vitest";
import { encrypt } from "./crypto.js";
import { verifyProvisionSecret } from "./provisioning.js";

describe("verifyProvisionSecret", () => {
  const secret = "s3cr3t-provisioning-value";

  it("accepts the secret the device was issued", () => {
    expect(verifyProvisionSecret(encrypt(secret), secret)).toBe(true);
  });

  it("rejects a missing or wrong secret", () => {
    const stored = encrypt(secret);
    expect(verifyProvisionSecret(stored, undefined)).toBe(false);
    expect(verifyProvisionSecret(stored, "")).toBe(false);
    expect(verifyProvisionSecret(stored, "wrong")).toBe(false);
    expect(verifyProvisionSecret(stored, secret + "x")).toBe(false);
    expect(verifyProvisionSecret(stored, secret.slice(0, -1))).toBe(false);
  });

  it("rejects a device that has no secret yet", () => {
    expect(verifyProvisionSecret(null, secret)).toBe(false);
    expect(verifyProvisionSecret(undefined, secret)).toBe(false);
    expect(verifyProvisionSecret("", secret)).toBe(false);
  });

  it("rejects a stored value that cannot be decrypted", () => {
    expect(verifyProvisionSecret("not-a-ciphertext", secret)).toBe(false);
  });

  it("rejects a non-string presented value without throwing", () => {
    // A repeated query parameter arrives as an array; it must not reach the
    // hash comparison, which only accepts strings.
    const stored = encrypt(secret);
    expect(() => verifyProvisionSecret(stored, ["a", "b"])).not.toThrow();
    expect(verifyProvisionSecret(stored, ["a", "b"])).toBe(false);
    expect(verifyProvisionSecret(stored, 42)).toBe(false);
    expect(verifyProvisionSecret(stored, { toString: () => secret })).toBe(false);
  });
});
