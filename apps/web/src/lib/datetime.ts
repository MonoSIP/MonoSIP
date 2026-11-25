/**
 * Every time in the admin panel and portal is shown in the PBX time zone
 * (Settings → Time), not the viewer's browser zone. A call at 09:00 in
 * Istanbul reads 09:00 for a colleague abroad too.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

let systemTz = "Europe/Istanbul";

export function setSystemTimezone(tz: string | null | undefined): void {
  if (!tz) return;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    systemTz = tz;
  } catch {
    /* keep the previous zone */
  }
}

export function getSystemTimezone(): string {
  return systemTz;
}

function lang(): string {
  const l = typeof document !== "undefined" ? document.documentElement.lang : "";
  return l || "en";
}

function toDate(v: string | number | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date and time, e.g. 26.11.2026 09:05:12. */
export function fmtDateTime(v: string | number | Date | null | undefined, fallback = "—"): string {
  const d = toDate(v);
  if (!d) return fallback;
  return d.toLocaleString(lang(), { timeZone: systemTz });
}

/** Time only, e.g. 09:05:12. */
export function fmtTime(
  v: string | number | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = {},
  fallback = "—",
): string {
  const d = toDate(v);
  if (!d) return fallback;
  return d.toLocaleTimeString(lang(), { timeZone: systemTz, ...opts });
}

/** Date only. */
export function fmtDate(
  v: string | number | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = {},
  fallback = "—",
): string {
  const d = toDate(v);
  if (!d) return fallback;
  return d.toLocaleDateString(lang(), { timeZone: systemTz, ...opts });
}

/** Calendar day (YYYY-MM-DD) of `v` in the PBX zone, for "today" comparisons. */
export function dayKey(v: string | number | Date): string {
  const d = toDate(v) ?? new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: systemTz }).format(d);
}

/** Load the PBX zone once per shell (admin: /admin/time, portal: /me). */
export function useSystemTimezone(source: "admin" | "portal"): string {
  const q = useQuery({
    queryKey: ["system-timezone", source],
    queryFn: async () => {
      const r =
        source === "admin"
          ? await api.get<{ timezone: string }>("/api/v1/admin/time")
          : await api.get<{ timezone?: string }>("/api/v1/me");
      setSystemTimezone(r.timezone);
      return r.timezone ?? systemTz;
    },
    staleTime: 5 * 60_000,
  });
  return q.data ?? systemTz;
}
