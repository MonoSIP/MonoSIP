function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.API_PORT ?? 3000),
  databaseUrl: required(
    "DATABASE_URL",
    "postgresql://dsip:dsip_secret_change_me@localhost:5432/dsip",
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
    ariUrl: process.env.ASTERISK_ARI_URL ?? "http://asterisk:8088",
    ariUser: process.env.ASTERISK_ARI_USER ?? "dsip",
    ariPassword: process.env.ASTERISK_ARI_PASSWORD ?? "ari_secret_change_me",
    amiHost: process.env.ASTERISK_AMI_HOST ?? "asterisk",
    amiPort: Number(process.env.ASTERISK_AMI_PORT ?? 5038),
    amiUser: process.env.ASTERISK_AMI_USER ?? "dsip",
    amiPassword: process.env.ASTERISK_AMI_PASSWORD ?? "ami_secret_change_me",
    configDir: process.env.ASTERISK_CONFIG_DIR ?? "/var/lib/asterisk/dsip",
  },
  recordingsDir: process.env.RECORDINGS_DIR ?? "/data/recordings",
  uploadsDir: process.env.UPLOADS_DIR ?? "/data/uploads",
  /** Piper TTS HTTP service (empty = disabled). */
  ttsUrl: (process.env.TTS_URL ?? "http://tts:5500").replace(/\/$/, ""),
  /** Shared secret for Asterisk dialplan → API internal hooks. */
  internalApiSecret: process.env.INTERNAL_API_SECRET ?? "dsip_internal_change_me",
};
