import { normalizeLocalNets, parseLocalNetsEnv, usableExternalIp } from "./lib/local-nets.js";

// Before the MonoSIP rename the env prefix was DSIP_; existing deployments keep
// working: an old DSIP_X fills MONOSIP_X when that is not set.
for (const [key, value] of Object.entries(process.env)) {
  if (!key.startsWith("DSIP_") || value === undefined) continue;
  const renamed = `MONOSIP_${key.slice("DSIP_".length)}`;
  if (process.env[renamed] === undefined) process.env[renamed] = value;
}

/** Install default. `db:reset-admin` always restores this and ignores `ADMIN_PASSWORD`. */
export const DEFAULT_ADMIN_PASSWORD = "Admin123!";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const externalIp = (process.env.EXTERNAL_IP ?? "").trim();
// The config writer stamps EXTERNAL_IP into every endpoint's media_address, which
// forces the SDP address for all peers. A loopback/unspecified value only works
// for a browser on this same host (Docker port publishing); every other phone
// gets no audio. Respect an explicit operator value, but say so loudly. (The
// silent case — deriving 127.0.0.1 from PUBLIC_HOST=localhost — is blocked in
// bootstrap-runtime.sh.)
if (externalIp && !usableExternalIp(externalIp)) {
  console.warn(
    `[config] EXTERNAL_IP=${externalIp} is loopback/unspecified: only clients on this host will get audio; phones elsewhere will be silent`,
  );
}

export const config = {
  port: Number(process.env.API_PORT ?? 3000),
  databaseUrl: required(
    "DATABASE_URL",
    "postgresql://monosip:monosip_secret_change_me@localhost:5432/monosip",
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
  externalIp,
  /**
   * Nets Asterisk treats as on-link (no EXTERNAL_IP rewrite). Default and
   * {@link normalizeLocalNets} keep Docker NAT safe even if an old vault still
   * lists the phone LAN (e.g. 10.0.0.0/8) or the 127.0.0.1/3 typo.
   */
  localNets: normalizeLocalNets(parseLocalNetsEnv(process.env.LOCAL_NETS), externalIp),
  /**
   * Reverse proxies whose X-Forwarded-For header is believed. Only these peers
   * may set the client address; every other peer is identified by its socket
   * address.
   *
   * The default covers the Compose topology, where the nginx container
   * reaches the API over the `monosip` bridge network (172.16.0.0/12). The
   * all-in-one image publishes :3000 directly, so no proxy is trusted there
   * and a client-supplied header is ignored. Set this when a reverse proxy
   * runs elsewhere (a VPS edge, a PaaS router).
   */
  trustedProxyCidrs: (
    process.env.MONOSIP_TRUSTED_PROXY_CIDRS ??
    "172.16.0.0/12,127.0.0.1/32,::1/128"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  sipDomain: process.env.SIP_DOMAIN ?? "localhost",
  sipWssUrl: process.env.SIP_WSS_URL ?? "wss://localhost/asterisk-ws",
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@example.com",
  adminPassword: process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD,
  asterisk: {
    // All-in-one / NineDeploy defaults to localhost; Compose sets http://asterisk:8088
    ariUrl: process.env.ASTERISK_ARI_URL ?? "http://127.0.0.1:8088",
    ariUser: process.env.ASTERISK_ARI_USER ?? "monosip",
    ariPassword: process.env.ASTERISK_ARI_PASSWORD ?? "ari_secret_change_me",
    amiHost: process.env.ASTERISK_AMI_HOST ?? "127.0.0.1",
    amiPort: Number(process.env.ASTERISK_AMI_PORT ?? 5038),
    amiUser: process.env.ASTERISK_AMI_USER ?? "monosip",
    amiPassword: process.env.ASTERISK_AMI_PASSWORD ?? "ami_secret_change_me",
    configDir: process.env.ASTERISK_CONFIG_DIR ?? "/data/asterisk",
  },
  recordingsDir: process.env.RECORDINGS_DIR ?? "/data/recordings",
  uploadsDir: process.env.UPLOADS_DIR ?? "/data/uploads",
  /** Embedded TTS (Edge / EMA) — default is localhost inside the all-in-one image. */
  ttsUrl: (process.env.TTS_URL ?? "http://127.0.0.1:5500").replace(/\/$/, ""),
  /** Shared secret for Asterisk dialplan → API internal hooks. */
  internalApiSecret: process.env.INTERNAL_API_SECRET ?? "monosip_internal_change_me",
  /**
   * Where Asterisk's dialplan reaches this API. All-in-one (embedded Asterisk on
   * 127.0.0.1) has no `api` host; Compose runs Asterisk in its own container.
   */
  internalApiUrl:
    process.env.MONOSIP_INTERNAL_API_URL ??
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
   * NineDeploy/Traefik typically cannot mux TURNS on 443 — set MONOSIP_TURNS_ON_443=0.
   */
  turnsOn443:
    process.env.MONOSIP_TURNS_ON_443 === "0" || process.env.MONOSIP_TURNS_ON_443 === "false"
      ? false
      : process.env.MONOSIP_TURNS_ON_443 === "1" ||
        process.env.MONOSIP_TURNS_ON_443 === "true" ||
        Boolean((process.env.TURN_SECRET ?? "").trim()),
};
