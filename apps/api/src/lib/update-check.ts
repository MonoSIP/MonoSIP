import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "MonoSIP/MonoSIP";
const CACHE_MS = 6 * 60 * 60 * 1000;
const GH_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;

export type UpdateStatus = {
  current: string;
  latest: string;
  updateAvailable: boolean;
  releaseUrl: string;
  publishedAt: string | null;
  name: string | null;
};

type CacheEntry = { at: number; status: UpdateStatus };

let cache: CacheEntry | null = null;

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return (pkg.version ?? "0.0.0").replace(/^v/i, "");
  } catch {
    return "0.0.0";
  }
}

/** Compare dotted semver; missing parts count as 0. Returns -1 / 0 / 1. */
export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function bumpPatch(version: string): string {
  const parts = version.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.join(".");
}

function previewEnabled(): boolean {
  const v = process.env.MONOSIP_UPDATE_PREVIEW;
  return v === "1" || v === "true";
}

function noUpdate(current: string): UpdateStatus {
  return {
    current,
    latest: current,
    updateAvailable: false,
    releaseUrl: `https://github.com/${REPO}/releases`,
    publishedAt: null,
    name: null,
  };
}

async function fetchLatestFromGitHub(current: string): Promise<UpdateStatus> {
  const res = await fetch(GH_LATEST, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "MonoSIP-update-check",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return noUpdate(current);
  const body = (await res.json()) as {
    tag_name?: string;
    html_url?: string;
    published_at?: string;
    name?: string;
    prerelease?: boolean;
  };
  if (body.prerelease) return noUpdate(current);
  const latest = (body.tag_name ?? "").replace(/^v/i, "");
  if (!latest) return noUpdate(current);
  const updateAvailable = compareSemver(latest, current) > 0;
  return {
    current,
    latest,
    updateAvailable,
    releaseUrl: body.html_url || `https://github.com/${REPO}/releases/tag/v${latest}`,
    publishedAt: body.published_at ?? null,
    name: body.name ?? (latest ? `v${latest}` : null),
  };
}

/** Running package version vs GitHub latest release (cached). Preview bumps patch locally. */
export async function getUpdateStatus(): Promise<UpdateStatus> {
  const current = readPackageVersion();

  if (previewEnabled()) {
    const latest = bumpPatch(current);
    return {
      current,
      latest,
      updateAvailable: true,
      releaseUrl: `https://github.com/${REPO}/releases/tag/v${latest}`,
      publishedAt: new Date().toISOString(),
      name: `v${latest}`,
    };
  }

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return { ...cache.status, current };
  }

  try {
    const status = await fetchLatestFromGitHub(current);
    cache = { at: Date.now(), status };
    return status;
  } catch {
    return noUpdate(current);
  }
}

/** Test helper — clear the in-memory GitHub cache. */
export function clearUpdateCheckCache(): void {
  cache = null;
}
