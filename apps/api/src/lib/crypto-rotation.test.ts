import { createCipheriv, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// Primary key the app runs with in this test.
const PRIMARY = "11111111111111111111111111111111111111111111111111111111111111aa";
const OLD = "22222222222222222222222222222222222222222222222222222222222222bb";

vi.mock("../config.js", () => ({
  config: { encryptionKey: PRIMARY },
}));

const { encrypt, decrypt } = await import("./crypto.js");

/** Seal a value under an arbitrary key, mimicking data written before a rotation. */
function sealWith(hex: string, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(hex.slice(0, 64), "hex"), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${iv.toString("hex")}:${c.getAuthTag().toString("hex")}:${enc.toString("hex")}`;
}

afterEach(() => {
  delete process.env.ENCRYPTION_KEY_OLD;
});

describe("decrypt with key rotation", () => {
  it("round-trips a value under the primary key", () => {
    expect(decrypt(encrypt("hunter2"))).toBe("hunter2");
  });

  it("falls back to ENCRYPTION_KEY_OLD for not-yet-migrated values", () => {
    const legacy = sealWith(OLD, "old-sip-secret");
    process.env.ENCRYPTION_KEY_OLD = OLD;
    expect(decrypt(legacy)).toBe("old-sip-secret");
  });

  it("throws for old-key data when no ENCRYPTION_KEY_OLD is set", () => {
    const legacy = sealWith(OLD, "old-sip-secret");
    expect(() => decrypt(legacy)).toThrow();
  });

  it("still prefers the primary key when a fallback is configured", () => {
    process.env.ENCRYPTION_KEY_OLD = OLD;
    expect(decrypt(encrypt("current"))).toBe("current");
  });
});
