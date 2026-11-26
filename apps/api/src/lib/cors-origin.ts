import { config } from "../config.js";

/**
 * Which browser Origins may make credentialed requests to the API.
 *
 * The admin panel and softphone are served from the same origin as the API, so
 * they need no cross-origin grant at all. Reflecting *every* Origin back with
 * `Allow-Credentials: true` (the old `origin: true`) is the one combination the
 * fetch spec singles out as dangerous. We instead allow only:
 *   - requests with no Origin (same-origin navigations, curl, native apps),
 *   - the configured public host / URL / SIP domain,
 *   - loopback and RFC-1918 LAN hosts, so on-box and intranet admin access works.
 * The public widget endpoints set their own per-widget CORS headers and do not
 * rely on this.
 */
function allowedHosts(): Set<string> {
  const hosts = new Set<string>(["localhost", "127.0.0.1", "::1"]);
  const add = (h?: string) => {
    const v = (h ?? "").trim().toLowerCase();
    if (v) hosts.add(v);
  };
  add(config.publicHost);
  add(config.sipDomain !== "localhost" ? config.sipDomain : undefined);
  try {
    add(new URL(config.publicUrl).hostname);
  } catch {
    /* publicUrl may be a bare host */
    add(config.publicUrl);
  }
  return hosts;
}

function isPrivateLanHost(host: string): boolean {
  // IPv4 RFC-1918 + link-local, so a PBX reached over the office LAN still works.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  // No Origin header: same-origin request, curl, or a native app — never a
  // cross-site credentialed read, so allow it.
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (allowedHosts().has(host)) return true;
  if (isPrivateLanHost(host)) return true;
  return false;
}
