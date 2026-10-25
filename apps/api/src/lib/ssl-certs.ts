import { createPrivateKey } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import * as acme from "acme-client";
import { SettingsSchema } from "@monosip/shared";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { settings } from "../db/schema.js";
import { config } from "../config.js";
import { needsRenewal, readCertExpiry, RENEW_WITHIN_DAYS } from "./ssl-policy.js";

export { needsRenewal, readCertExpiry, RENEW_WITHIN_DAYS };

/** In-memory HTTP-01 challenge responses (token → keyAuthorization). */
const http01Challenges = new Map<string, string>();

export function getHttp01Challenge(token: string): string | undefined {
  return http01Challenges.get(token);
}

export function certsDir(): string {
  return (process.env.CERTS_DIR ?? join(process.cwd(), "../../docker/nginx/certs")).replace(/\/$/, "");
}

const ACCOUNT_KEY = "acme-account.pem";
const CERT_FILE = "cert.pem";
const KEY_FILE = "key.pem";

let busy = false;

export type SslStatusPayload = {
  hostname: string | null;
  autoSsl: boolean;
  status: "none" | "pending" | "ok" | "error";
  expiresAt: string | null;
  lastCheckAt: string | null;
  lastError: string | null;
  daysRemaining: number | null;
};

async function loadSettings() {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return SettingsSchema.parse(row?.data ?? {});
}

async function patchSettings(patch: Record<string, unknown>) {
  const cur = await loadSettings();
  const next = SettingsSchema.parse({ ...cur, ...patch });
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (row) await db.update(settings).set({ data: next }).where(eq(settings.id, 1));
  else await db.insert(settings).values({ id: 1, data: next });
  return next;
}

export async function readInstalledCertExpiry(): Promise<Date | null> {
  try {
    const pem = await readFile(join(certsDir(), CERT_FILE), "utf8");
    return readCertExpiry(pem);
  } catch {
    return null;
  }
}

export async function getSslStatus(): Promise<SslStatusPayload> {
  const s = await loadSettings();
  // Prefer settings-tracked LE expiry; fall back to on-disk cert only when auto-SSL is on
  let exp: Date | null = s.sslExpiresAt ? new Date(s.sslExpiresAt) : null;
  if ((!exp || Number.isNaN(exp.getTime())) && s.autoSsl) {
    exp = await readInstalledCertExpiry();
  }
  const daysRemaining =
    exp && !Number.isNaN(exp.getTime())
      ? Math.floor((exp.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null;
  return {
    hostname: s.hostname?.trim() || null,
    autoSsl: Boolean(s.autoSsl),
    status: (s.sslStatus as SslStatusPayload["status"]) ?? "none",
    expiresAt: exp && !Number.isNaN(exp.getTime()) ? exp.toISOString() : null,
    lastCheckAt: s.sslLastCheckAt ?? null,
    lastError: s.sslLastError ?? null,
    daysRemaining,
  };
}

function directoryUrl(): string {
  return (
    process.env.ACME_DIRECTORY_URL?.trim() ||
    acme.directory.letsencrypt.production
  );
}

async function loadOrCreateAccountKey(): Promise<Buffer> {
  const dir = certsDir();
  await mkdir(dir, { recursive: true });
  const path = join(dir, ACCOUNT_KEY);
  try {
    await access(path);
    return await readFile(path);
  } catch {
    const key = await acme.crypto.createPrivateKey();
    await writeFile(path, key, { mode: 0o600 });
    return key;
  }
}

function normalizeHostname(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/**
 * Obtain or renew a Let's Encrypt certificate for the configured hostname
 * and write cert.pem / key.pem for nginx.
 */
export async function issueOrRenewCertificate(opts?: {
  force?: boolean;
}): Promise<{ ok: boolean; error?: string; expiresAt?: string }> {
  if (busy) return { ok: false, error: "SSL job already running" };
  busy = true;
  try {
    const s = await loadSettings();
    const hostname = normalizeHostname(s.hostname ?? "");
    if (!s.autoSsl) {
      await patchSettings({
        sslStatus: "none",
        sslLastCheckAt: new Date().toISOString(),
        sslLastError: null,
      });
      return { ok: false, error: "Automatic SSL is disabled" };
    }
    if (!hostname || hostname === "localhost") {
      const error = "Set a public hostname (not localhost) before enabling automatic SSL";
      await patchSettings({
        sslStatus: "error",
        sslLastError: error,
        sslLastCheckAt: new Date().toISOString(),
      });
      return { ok: false, error };
    }

    const currentExp = await readInstalledCertExpiry();
    if (!opts?.force && currentExp && !needsRenewal(currentExp)) {
      await patchSettings({
        sslStatus: "ok",
        sslExpiresAt: currentExp.toISOString(),
        sslLastCheckAt: new Date().toISOString(),
        sslLastError: null,
      });
      return { ok: true, expiresAt: currentExp.toISOString() };
    }

    await patchSettings({
      sslStatus: "pending",
      sslLastError: null,
      sslLastCheckAt: new Date().toISOString(),
    });

    const email =
      (s.sslEmail && String(s.sslEmail).trim()) ||
      config.adminEmail ||
      "admin@example.com";

    const accountKey = await loadOrCreateAccountKey();
    // Validate key parses (acme-client accepts PEM Buffer)
    createPrivateKey(accountKey);

    const client = new acme.Client({
      directoryUrl: directoryUrl(),
      accountKey,
    });

    try {
      await client.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${email}`],
      });
    } catch (e) {
      // Account may already exist for this key
      const msg = (e as Error).message ?? "";
      if (!/already|exist|conflict/i.test(msg)) throw e;
    }

    const [privKey, csr] = await acme.crypto.createCsr({
      commonName: hostname,
    });

    const certificate = await client.auto({
      csr,
      email,
      termsOfServiceAgreed: true,
      challengePriority: ["http-01"],
      skipChallengeVerification: false,
      challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
        if (challenge.type !== "http-01") {
          throw new Error(`Unsupported challenge ${challenge.type}`);
        }
        http01Challenges.set(challenge.token, keyAuthorization);
      },
      challengeRemoveFn: async (_authz, challenge) => {
        http01Challenges.delete(challenge.token);
      },
    });

    const dir = certsDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, CERT_FILE), certificate, { mode: 0o644 });
    await writeFile(join(dir, KEY_FILE), privKey, { mode: 0o600 });

    const exp = readCertExpiry(certificate) ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    await patchSettings({
      sslStatus: "ok",
      sslExpiresAt: exp.toISOString(),
      sslLastCheckAt: new Date().toISOString(),
      sslLastError: null,
    });
    console.log(`[ssl] certificate installed for ${hostname}, expires ${exp.toISOString()}`);
    return { ok: true, expiresAt: exp.toISOString() };
  } catch (e) {
    const error = (e as Error).message || String(e);
    console.warn("[ssl]", error);
    try {
      await patchSettings({
        sslStatus: "error",
        sslLastError: error.slice(0, 500),
        sslLastCheckAt: new Date().toISOString(),
      });
    } catch {
      /* ignore */
    }
    return { ok: false, error };
  } finally {
    busy = false;
  }
}

/** Periodic check: renew if autoSsl and cert is missing or near expiry. */
export async function checkAndRenewIfNeeded(): Promise<void> {
  const s = await loadSettings();
  if (!s.autoSsl) return;
  const hostname = normalizeHostname(s.hostname ?? "");
  if (!hostname || hostname === "localhost") return;
  const exp = (await readInstalledCertExpiry()) ?? (s.sslExpiresAt ? new Date(s.sslExpiresAt) : null);
  if (needsRenewal(exp)) {
    await issueOrRenewCertificate({ force: !exp });
  } else if (exp) {
    await patchSettings({
      sslStatus: "ok",
      sslExpiresAt: exp.toISOString(),
      sslLastCheckAt: new Date().toISOString(),
      sslLastError: null,
    });
  }
}
