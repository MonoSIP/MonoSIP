import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { APP_VERSION } from "../lib/version";
import { useStore } from "../store";

export type UpdateStatus = {
  current: string;
  latest: string;
  updateAvailable: boolean;
  releaseUrl: string;
  publishedAt: string | null;
  name: string | null;
};

const DISMISS_KEY = "monosip.updateDismissed";

export function readUpdateDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function writeUpdateDismissed(version: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, version);
  } catch {
    /* ignore */
  }
}

function previewStatus(): UpdateStatus {
  const parts = APP_VERSION.split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  const latest = parts.join(".");
  return {
    current: APP_VERSION,
    latest,
    updateAvailable: true,
    releaseUrl: `https://github.com/MonoSIP/MonoSIP/releases/tag/v${latest}`,
    publishedAt: new Date().toISOString(),
    name: `v${latest}`,
  };
}

/** One GitHub release check per admin session (via API cache). */
export function useUpdateCheck(): {
  status: UpdateStatus | null;
  bannerVisible: boolean;
  dismissBanner: () => void;
} {
  const actor = useStore((s) => s.actor);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(() => readUpdateDismissed());

  useEffect(() => {
    if (actor?.type !== "admin") {
      setStatus(null);
      return;
    }
    let cancelled = false;
    // Vite-only local design: VITE_UPDATE_PREVIEW=1 (no API required).
    if (import.meta.env.VITE_UPDATE_PREVIEW === "1" || import.meta.env.VITE_UPDATE_PREVIEW === "true") {
      setStatus(previewStatus());
      return;
    }
    void api
      .get<UpdateStatus>("/api/v1/admin/updates")
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [actor?.type]);

  const bannerVisible = Boolean(
    status?.updateAvailable && status.latest && dismissed !== status.latest,
  );

  function dismissBanner() {
    if (!status?.latest) return;
    writeUpdateDismissed(status.latest);
    setDismissed(status.latest);
  }

  return { status, bannerVisible, dismissBanner };
}
