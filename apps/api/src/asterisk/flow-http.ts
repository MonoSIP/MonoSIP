import { expandTemplate } from "./flow-logic.js";

export type FlowApiRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  timeoutMs: number;
  retries: number;
};

type SecretLoader = (secretId: string) => Promise<string | null>;

/** Decrypted value of a Settings → Secrets entry, or null when it is missing. */
async function loadSecret(secretId: string): Promise<string | null> {
  const { db } = await import("../db/client.js");
  const { secrets } = await import("../db/schema.js");
  const { decrypt } = await import("../lib/crypto.js");
  const { eq } = await import("drizzle-orm");
  const [sec] = await db.select().from(secrets).where(eq(secrets.id, secretId)).limit(1);
  return sec ? decrypt(sec.valueEnc) : null;
}

/**
 * The HTTP request an API node sends: templated URL, headers and body plus the
 * auth secret. Live calls and the designer's test call both use it, so a key that
 * works on a real call is also sent in the simulation (it used to send none → 401).
 */
export async function buildFlowApiRequest(
  data: Record<string, unknown>,
  vars: Record<string, unknown>,
  secretLoader: SecretLoader = loadSecret,
): Promise<FlowApiRequest> {
  const url = expandTemplate(String(data.url ?? ""), vars);
  const method = String(data.method ?? "GET").toUpperCase();
  const timeoutMs = Number(data.timeoutMs ?? 3000);
  const retries = Math.min(1, Math.max(0, Number(data.retry ?? 0) || 0));
  let headers: Record<string, string> = {};
  for (const [k, v] of Object.entries((data.headers as Record<string, string>) ?? {})) {
    headers[k] = expandTemplate(String(v), vars);
  }
  // Auth comes from the encrypted secrets table (tokens never live in flow JSON)
  const authType = String(data.authType ?? "none");
  const secretId = String(data.secretId ?? "");
  if (secretId && authType !== "none") {
    try {
      const token = await secretLoader(secretId);
      if (token) {
        if (authType === "bearer") headers = { ...headers, Authorization: `Bearer ${token}` };
        else if (authType === "basic") headers = { ...headers, Authorization: `Basic ${token}` };
        else if (authType === "header") {
          headers = { ...headers, [String(data.authHeader || "X-Api-Key")]: token };
        }
      }
    } catch (e) {
      console.warn(`[flow] secret inject failed`, (e as Error).message);
    }
  }
  const body =
    method !== "GET" && method !== "HEAD" && data.body
      ? expandTemplate(String(data.body), vars)
      : undefined;
  return { url, method, headers, body, timeoutMs, retries };
}
