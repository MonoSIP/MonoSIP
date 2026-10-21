// Before the MunaSIP rename the env prefix was DSIP_; existing deployments keep
// working: an old DSIP_X fills MUNASIP_X when that is not set.
for (const [key, value] of Object.entries(process.env)) {
  if (!key.startsWith("DSIP_") || value === undefined) continue;
  const renamed = `MUNASIP_${key.slice("DSIP_".length)}`;
  if (process.env[renamed] === undefined) process.env[renamed] = value;
}

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.API_PORT ?? 3000),
  databaseUrl: required(
    "DATABASE_URL",
    "postgresql://munasip:munasip_secret_change_me@localhost:5432/munasip",
  ),
  sessionSecret: required(
    "SESSION_SECRET",
    "change-me-to-a-long-random-session-secret-32chars",
  ),
  encryptionKey: required(
    "ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  ),
  defaultLocale: (process.env.DEFAULT_LOCALE ?? "en") as "en" | "tr",
  publicUrl: process.env.PUBLIC_URL ?? "https://localhost",
  publicHost: process.env.PUBLIC_HOST ?? "localhost",
  /** Public IP/hostname for SIP/RTP (VPS). Empty = local Docker only. */
  externalIp: (process.env.EXTERNAL_IP ?? "").trim(),
  /** Comma-separated private nets Asterisk should treat as local. */
  localNets: (
    process.env.LOCAL_NETS ??
    "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1/32"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  sipDomain: process.env.SIP_DOMAIN ?? "localhost",
  sipWssUrl: process.env.SIP_WSS_URL ?? "wss://localhost/asterisk-ws",
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@example.com",
  adminPassword: process.env.ADMIN_PASSWORD ?? "Admin123!",
  asterisk: {
    // All-in-one / NineDeploy defaults to localhost; Compose sets http://asterisk:8088
    ariUrl: process.env.ASTERISK_ARI_URL ?? "http://127.0.0.1:8088",
    ariUser: process.env.ASTERISK_ARI_USER ?? "munasip",
    ariPassword: process.env.ASTERISK_ARI_PASSWORD ?? "ari_secret_change_me",
    amiHost: process.env.ASTERISK_AMI_HOST ?? "127.0.0.1",
    amiPort: Number(process.env.ASTERISK_AMI_PORT ?? 5038),
    amiUser: process.env.ASTERISK_AMI_USER ?? "munasip",
    amiPassword: process.env.ASTERISK_AMI_PASSWORD ?? "ami_secret_change_me",
    configDir: process.env.ASTERISK_CONFIG_DIR ?? "/data/asterisk",
  },
  recordingsDir: process.env.RECORDINGS_DIR ?? "/data/recordings",
  uploadsDir: process.env.UPLOADS_DIR ?? "/data/uploads",
  /** Embedded TTS (Edge / EMA) — default is localhost inside the all-in-one image. */
  ttsUrl: (process.env.TTS_URL ?? "http://127.0.0.1:5500").replace(/\/$/, ""),
  /** Shared secret for Asterisk dialplan → API internal hooks. */
  internalApiSecret: process.env.INTERNAL_API_SECRET ?? "munasip_internal_change_me",
  /**
   * Where Asterisk's dialplan reaches this API. All-in-one (embedded Asterisk on
   * 127.0.0.1) has no `api` host; Compose runs Asterisk in its own container.
   */
  internalApiUrl:
    process.env.MUNASIP_INTERNAL_API_URL ??
    (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(process.env.ASTERISK_ARI_URL ?? "http://127.0.0.1:8088")
      ? `http://127.0.0.1:${process.env.API_PORT ?? 3000}`
      : "http://api:3000"),
  /**
   * Coturn `--static-auth-secret` for time-limited TURN/TURNS credentials.
   * Empty = softphone uses STUN only (NineDeploy without coturn).
   */
  turnSecret: (process.env.TURN_SECRET ?? "").trim(),
  turnRealm: (process.env.TURN_REALM ?? process.env.PUBLIC_HOST ?? "localhost").trim(),
  /**
   * Advertise `turns:host:443` (nginx ALPN mux → coturn:5349). Compose enables this;
   * NineDeploy/Traefik typically cannot mux TURNS on 443 — set MUNASIP_TURNS_ON_443=0.
   */
  turnsOn443:
    process.env.MUNASIP_TURNS_ON_443 === "0" || process.env.MUNASIP_TURNS_ON_443 === "false"
      ? false
      : process.env.MUNASIP_TURNS_ON_443 === "1" ||
        process.env.MUNASIP_TURNS_ON_443 === "true" ||
        Boolean((process.env.TURN_SECRET ?? "").trim()),
};
