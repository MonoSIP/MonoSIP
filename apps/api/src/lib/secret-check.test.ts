import { describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  DEFAULT_ADMIN_PASSWORD: "Admin123!",
  config: {
    // All at their published defaults.
    sessionSecret: "change-me-to-a-long-random-session-secret-32chars",
    encryptionKey:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    internalApiSecret: "monosip_internal_change_me",
    adminPassword: "Admin123!",
    asterisk: {
      ariPassword: "ari_secret_change_me",
      amiPassword: "ami_secret_change_me",
    },
  },
}));

const { assertSecretsConfigured, defaultedSecrets } = await import("./secret-check.js");

function silentLog() {
  return { warn: vi.fn(), error: vi.fn() };
}

describe("secret-check", () => {
  it("lists every secret left at its default", () => {
    expect(defaultedSecrets()).toEqual(
      expect.arrayContaining([
        "SESSION_SECRET",
        "ENCRYPTION_KEY",
        "INTERNAL_API_SECRET",
        "ASTERISK_ARI_PASSWORD",
        "ASTERISK_AMI_PASSWORD",
        "ADMIN_PASSWORD",
      ]),
    );
  });

  it("warns but does not throw when strict mode is off", () => {
    const log = silentLog();
    expect(() => assertSecretsConfigured({}, log)).not.toThrow();
    expect(log.warn).toHaveBeenCalled();
  });

  it("refuses to boot when MONOSIP_REQUIRE_SECRETS is set and secrets are default", () => {
    const log = silentLog();
    expect(() =>
      assertSecretsConfigured({ MONOSIP_REQUIRE_SECRETS: "1" }, log),
    ).toThrow(/Refusing to start/);
  });
});
