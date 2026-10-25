/**
 * Origin allowlist for the public call-widget endpoints.
 *
 * A rule is a bare host ("shop.example.com"), a wildcard host
 * ("*.example.com") or a full origin ("https://shop.example.com"). Rules are
 * matched on the hostname with equality — a substring test would let
 * "https://shop.example.com.evil.io" satisfy a rule for "shop.example.com".
 */

type OriginParts = {
  host: string;
  scheme: string | null;
  port: string | null;
};

function parseOrigin(origin: string): OriginParts | null {
  try {
    const u = new URL(origin);
    // The Origin header is scheme://host[:port] — a path, userinfo or query
    // means this is not an origin we should ever match.
    if (u.pathname !== "/" || u.username || u.password || u.search) return null;
    return {
      host: u.hostname.toLowerCase(),
      scheme: u.protocol.toLowerCase(),
      port: u.port || null,
    };
  } catch {
    return null;
  }
}

function parseRule(rule: string): OriginParts | null {
  const r = rule.trim().toLowerCase();
  if (!r) return null;
  try {
    // A bare host carries no scheme, and URL() needs one to parse it.
    const u = new URL(r.includes("://") ? r : `https://${r}`);
    if (u.pathname !== "/" || u.username || u.password || u.search) return null;
    return {
      host: u.hostname.toLowerCase(),
      scheme: r.includes("://") ? u.protocol.toLowerCase() : null,
      port: u.port || null,
    };
  } catch {
    return null;
  }
}

/**
 * Is `origin` allowed by the `allowed` rules? An empty list allows any origin
 * (lab default); production should list explicit hosts.
 */
export function originAllowed(allowed: unknown, origin: string | undefined): boolean {
  if (!origin) return false;
  const list = Array.isArray(allowed) ? (allowed as string[]) : [];
  if (!list.length) return true;

  const o = parseOrigin(origin);
  if (!o) return false; // an unparseable Origin can never match a host rule

  return list.some((rule) => {
    const r = rule.trim().toLowerCase();
    if (!r) return false;

    if (r.startsWith("*.")) {
      const base = r.slice(2);
      if (!base) return false;
      return o.host === base || o.host.endsWith(`.${base}`);
    }

    const parsed = parseRule(r);
    if (!parsed) return false;
    if (parsed.host !== o.host) return false;
    if (parsed.scheme && parsed.scheme !== o.scheme) return false;
    if (parsed.port && parsed.port !== o.port) return false;
    return true;
  });
}
