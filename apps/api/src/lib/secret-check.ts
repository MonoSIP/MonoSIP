import { config, DEFAULT_ADMIN_PASSWORD } from "../config.js";

/**
 * Secrets that ship with a built-in default so the lab image runs with no
 * configuration. In production every one of these must be overridden: the
 * defaults are public (they are in this repository), so a deployment that keeps
 * them is trivially impersonated or decrypted.
 */
const DEFAULTS: Array<{ env: string; value: string; def: string; note: string }> = [
  {
    env: "SESSION_SECRET",
    value: config.sessionSecret,
    def: "change-me-to-a-long-random-session-secret-32chars",
    note: "signs session cookies",
  },
  {
    env: "ENCRYPTION_KEY",
    value: config.encryptionKey,
    def: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    note: "encrypts SIP / trunk / widget passwords — a known key decrypts them all",
  },
  {
    env: "INTERNAL_API_SECRET",
    value: config.internalApiSecret,
    def: "monosip_internal_change_me",
    note: "authenticates dialplan hooks (/api/v1/internal/*)",
  },
  {
    env: "ASTERISK_ARI_PASSWORD",
    value: config.asterisk.ariPassword,
    def: "ari_secret_change_me",
    note: "Asterisk REST (ARI) control",
  },
  {
    env: "ASTERISK_AMI_PASSWORD",
    value: config.asterisk.amiPassword,
    def: "ami_secret_change_me",
    note: "Asterisk Manager (AMI) control",
  },
  {
    env: "ADMIN_PASSWORD",
    value: config.adminPassword,
    def: DEFAULT_ADMIN_PASSWORD,
    note: "initial admin login",
  },
];

/** Secrets still left at their public built-in default. */
export function defaultedSecrets(): string[] {
  return DEFAULTS.filter((s) => s.value === s.def).map((s) => s.env);
}

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Warn loudly for every secret still at its default, and refuse to boot when the
 * operator has opted into strict mode (`MONOSIP_REQUIRE_SECRETS=1`). Strict mode
 * is off by default so an existing deployment is never bricked by an upgrade; a
 * production operator turns it on once their secrets are set.
 */
export function assertSecretsConfigured(
  env: NodeJS.ProcessEnv = process.env,
  log: Pick<Console, "warn" | "error"> = console,
): void {
  const weak = DEFAULTS.filter((s) => s.value === s.def);
  if (!weak.length) return;

  log.warn("[security] ============================================================");
  log.warn(`[security] ${weak.length} secret(s) still use the built-in PUBLIC default:`);
  for (const s of weak) log.warn(`[security]   - ${s.env} (${s.note})`);
  log.warn("[security] These values are published in the source tree. Set your own");
  log.warn("[security] before exposing this instance to any untrusted network.");
  log.warn("[security] ============================================================");

  if (truthy(env.MONOSIP_REQUIRE_SECRETS)) {
    throw new Error(
      `Refusing to start: ${weak
        .map((s) => s.env)
        .join(", ")} left at default while MONOSIP_REQUIRE_SECRETS is set`,
    );
  }
}
