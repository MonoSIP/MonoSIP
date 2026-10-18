import { CallPermissionsSchema, SettingsSchema, type Settings } from "@dsip/shared";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { cdr, extensions, outboundRoutes, spendLimits, trunks } from "../db/schema.js";

const EMERGENCY = new Set(["112", "911", "155", "110", "119"]);

export function isEmergencyNumber(dialed: string): boolean {
  const n = dialed.replace(/\D/g, "");
  return EMERGENCY.has(n) || EMERGENCY.has(dialed);
}

/** Map dialed E.164 / 00xx to ISO country (common prefixes). */
export function countryFromDialed(dialed: string): string | null {
  let n = dialed.replace(/\D/g, "");
  if (dialed.startsWith("+")) n = dialed.replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("90") && (n.length === 12 || n.length === 13)) return "TR";
  const prefixes: Array<[string, string]> = [
    ["1", "US"],
    ["7", "RU"],
    ["20", "EG"],
    ["27", "ZA"],
    ["30", "GR"],
    ["31", "NL"],
    ["32", "BE"],
    ["33", "FR"],
    ["34", "ES"],
    ["39", "IT"],
    ["40", "RO"],
    ["41", "CH"],
    ["43", "AT"],
    ["44", "GB"],
    ["45", "DK"],
    ["46", "SE"],
    ["47", "NO"],
    ["48", "PL"],
    ["49", "DE"],
    ["51", "PE"],
    ["52", "MX"],
    ["55", "BR"],
    ["61", "AU"],
    ["62", "ID"],
    ["63", "PH"],
    ["64", "NZ"],
    ["65", "SG"],
    ["66", "TH"],
    ["81", "JP"],
    ["82", "KR"],
    ["84", "VN"],
    ["86", "CN"],
    ["90", "TR"],
    ["91", "IN"],
    ["92", "PK"],
    ["98", "IR"],
    ["212", "MA"],
    ["213", "DZ"],
    ["216", "TN"],
    ["218", "LY"],
    ["220", "GM"],
    ["234", "NG"],
    ["249", "SD"],
    ["251", "ET"],
    ["254", "KE"],
    ["255", "TZ"],
    ["256", "UG"],
    ["260", "ZM"],
    ["263", "ZW"],
    ["351", "PT"],
    ["352", "LU"],
    ["353", "IE"],
    ["354", "IS"],
    ["358", "FI"],
    ["359", "BG"],
    ["370", "LT"],
    ["371", "LV"],
    ["372", "EE"],
    ["380", "UA"],
    ["381", "RS"],
    ["385", "HR"],
    ["386", "SI"],
    ["420", "CZ"],
    ["421", "SK"],
    ["961", "LB"],
    ["962", "JO"],
    ["963", "SY"],
    ["964", "IQ"],
    ["965", "KW"],
    ["966", "SA"],
    ["967", "YE"],
    ["968", "OM"],
    ["971", "AE"],
    ["972", "IL"],
    ["973", "BH"],
    ["974", "QA"],
    ["994", "AZ"],
    ["995", "GE"],
  ];
  prefixes.sort((a, b) => b[0].length - a[0].length);
  for (const [p, iso] of prefixes) {
    if (n.startsWith(p)) return iso;
  }
  return null;
}

export function isAnonymousCaller(caller: string): boolean {
  const c = (caller || "").trim().toLowerCase();
  return !c || c === "anonymous" || c === "unknown" || c === "restricted" || c === "<unknown>";
}

export type NumberClass = "localFixed" | "mobile" | "short444" | "international" | "internal" | "emergency";

/** Pure country allow/block check for international dials (exported for unit tests). */
export function evaluateCountryPolicy(
  dialed: string,
  settings: Pick<Settings, "allowedCountries" | "blockedCountries">,
): { ok: true } | { ok: false; reason: string } {
  const iso = countryFromDialed(dialed);
  const blocked = (settings.blockedCountries ?? []).map((c) => c.toUpperCase());
  if (iso && blocked.includes(iso)) {
    return { ok: false, reason: "country-blocked" };
  }
  const allowed = (settings.allowedCountries ?? ["TR"]).map((c) => c.toUpperCase());
  if (allowed.includes("ALL") || allowed.includes("INTL")) {
    return { ok: true };
  }
  if (!iso || !allowed.includes(iso)) {
    return { ok: false, reason: "country" };
  }
  return { ok: true };
}

export function classifyNumber(dialed: string): NumberClass {
  const n = dialed.replace(/\D/g, "");
  if (isEmergencyNumber(n)) return "emergency";
  if (/^\d{3,4}$/.test(n)) return "internal";
  if (n.startsWith("444") || n.startsWith("0850")) return "short444";
  // TR mobile
  if (/^(05\d{9}|905\d{9})$/.test(n)) return "mobile";
  if (dialed.startsWith("00") || dialed.startsWith("+") || (n.startsWith("90") && n.length > 12)) {
    // Normalize the international access code so 0090…, +90… and 90… share one code path;
    // otherwise the `00` form is misclassified and bypasses mobile/fixed permission checks.
    let intl = n;
    if (intl.startsWith("00")) intl = intl.slice(2);
    if (intl.startsWith("90")) {
      const rest = intl.slice(2);
      if (/^5\d{9}$/.test(rest)) return "mobile";
      return "localFixed";
    }
    return "international";
  }
  if (/^0?5\d{9}$/.test(n)) return "mobile";
  return "localFixed";
}

export function matchDialPattern(dialed: string, pattern: string): boolean {
  const n = dialed.replace(/\D/g, "");
  const p = pattern.trim();
  if (!p) return false;
  // Asterisk-like: _X. _NXXXXXX or plain prefix
  if (p.startsWith("_")) {
    let re = "^";
    for (let i = 1; i < p.length; i++) {
      const ch = p[i];
      if (ch === "X") re += "\\d";
      else if (ch === "Z") re += "[1-9]";
      else if (ch === "N") re += "[2-9]";
      else if (ch === ".") re += "\\d*";
      else if (ch === "!") re += "\\d+";
      else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    re += "$";
    return new RegExp(re).test(n) || new RegExp(re).test(dialed);
  }
  if (p.includes("*") || p.includes("?")) {
    const re = new RegExp(
      "^" +
        p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") +
        "$",
    );
    return re.test(dialed) || re.test(n);
  }
  return dialed.startsWith(p) || n.startsWith(p.replace(/\D/g, ""));
}

export async function checkExtensionOutbound(
  callerExt: string,
  dialed: string,
  settings: Settings,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (isEmergencyNumber(dialed)) return { ok: true };

  const cls = classifyNumber(dialed);
  if (cls === "internal") return { ok: true };

  const [ext] = await db.select().from(extensions).where(eq(extensions.number, callerExt)).limit(1);
  const perms = CallPermissionsSchema.parse(ext?.callPermissions ?? {});

  if (perms.outboundBlocked) return { ok: false, reason: "outbound-blocked" };
  if (cls === "international" && !perms.international) return { ok: false, reason: "no-international" };
  if (cls === "mobile" && !perms.mobile) return { ok: false, reason: "no-mobile" };
  if (cls === "short444" && !perms.short444) return { ok: false, reason: "no-short444" };
  if (cls === "localFixed" && !perms.localFixed) return { ok: false, reason: "no-local" };

  if (cls === "international") {
    const countryCheck = evaluateCountryPolicy(dialed, settings);
    if (!countryCheck.ok) return countryCheck;
  }

  const maxPerHour = settings.maxOutboundPerHour ?? 60;
  if (maxPerHour > 0 && callerExt) {
    const since = new Date(Date.now() - 3600_000);
    const [row] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(cdr)
      .where(
        and(
          eq(cdr.extensionNumber, callerExt),
          eq(cdr.direction, "outbound"),
          gte(cdr.startedAt, since),
        ),
      );
    if ((row?.c ?? 0) >= maxPerHour) {
      // Auto-suspend (DND) on abnormal frequency — plan: “dahiliyi durdurma”
      if (ext && !ext.dnd) {
        await db.update(extensions).set({ dnd: true, updatedAt: new Date() }).where(eq(extensions.id, ext.id));
        try {
          const { sendSmtpMail } = await import("./smtp.js");
          if (settings.smtpHost && settings.smtpTo) {
            await sendSmtpMail(
              {
                host: settings.smtpHost,
                port: settings.smtpPort,
                user: settings.smtpUser,
                password: settings.smtpPassword,
                from: settings.emailFrom,
                to: settings.smtpTo,
              },
              `DSip rate-limit: extension ${callerExt} suspended`,
              `Extension ${callerExt} hit maxOutboundPerHour (${maxPerHour}) and was set to DND.\nAt: ${new Date().toISOString()}`,
            );
          }
        } catch (e) {
          console.warn("[policy] rate-limit email failed", (e as Error).message);
        }
      }
      return { ok: false, reason: "rate-limit" };
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [daily] = await db
    .select({ sec: sql<number>`coalesce(sum(${cdr.billsec}),0)::int` })
    .from(cdr)
    .where(and(eq(cdr.direction, "outbound"), gte(cdr.startedAt, today)));
  const [monthly] = await db
    .select({ sec: sql<number>`coalesce(sum(${cdr.billsec}),0)::int` })
    .from(cdr)
    .where(and(eq(cdr.direction, "outbound"), gte(cdr.startedAt, monthStart)));
  if ((daily?.sec ?? 0) / 60 >= settings.dailySpendLimitMinutes) {
    try {
      const { sendSmtpMail } = await import("./smtp.js");
      if (settings.smtpHost && settings.smtpTo) {
        await sendSmtpMail(
          {
            host: settings.smtpHost,
            port: settings.smtpPort,
            user: settings.smtpUser,
            password: settings.smtpPassword,
            from: settings.emailFrom,
            to: settings.smtpTo,
          },
          `DSip daily spend limit hit`,
          `Outbound blocked for ${callerExt} → ${dialed}\nReason: daily-spend\nAt: ${new Date().toISOString()}`,
        );
      }
    } catch {
      /* ignore */
    }
    return { ok: false, reason: "daily-spend" };
  }
  if ((monthly?.sec ?? 0) / 60 >= settings.monthlySpendLimitMinutes) {
    try {
      const { sendSmtpMail } = await import("./smtp.js");
      if (settings.smtpHost && settings.smtpTo) {
        await sendSmtpMail(
          {
            host: settings.smtpHost,
            port: settings.smtpPort,
            user: settings.smtpUser,
            password: settings.smtpPassword,
            from: settings.emailFrom,
            to: settings.smtpTo,
          },
          `DSip monthly spend limit hit`,
          `Outbound blocked for ${callerExt} → ${dialed}\nReason: monthly-spend\nAt: ${new Date().toISOString()}`,
        );
      }
    } catch {
      /* ignore */
    }
    return { ok: false, reason: "monthly-spend" };
  }

  // Per-extension spend limits (spend_limits scope=extension)
  if (ext) {
    const [lim] = await db
      .select()
      .from(spendLimits)
      .where(and(eq(spendLimits.scope, "extension"), eq(spendLimits.scopeId, ext.id)))
      .limit(1);
    if (lim) {
      const [extDaily] = await db
        .select({ sec: sql<number>`coalesce(sum(${cdr.billsec}),0)::int` })
        .from(cdr)
        .where(
          and(
            eq(cdr.extensionNumber, callerExt),
            eq(cdr.direction, "outbound"),
            gte(cdr.startedAt, today),
          ),
        );
      const [extMonthly] = await db
        .select({ sec: sql<number>`coalesce(sum(${cdr.billsec}),0)::int` })
        .from(cdr)
        .where(
          and(
            eq(cdr.extensionNumber, callerExt),
            eq(cdr.direction, "outbound"),
            gte(cdr.startedAt, monthStart),
          ),
        );
      if ((extDaily?.sec ?? 0) / 60 >= lim.dailyLimitMinutes) {
        return { ok: false, reason: "ext-daily-spend" };
      }
      if ((extMonthly?.sec ?? 0) / 60 >= lim.monthlyLimitMinutes) {
        return { ok: false, reason: "ext-monthly-spend" };
      }
    }
  }

  return { ok: true };
}

export async function resolveOutboundDial(
  dialed: string,
): Promise<{ trunkEndpoint: string; dialNumber: string; routeId: string } | null> {
  const routes = await db.select().from(outboundRoutes);
  const enabled = routes.filter((r) => r.enabled).sort((a, b) => a.pattern.length - b.pattern.length);
  // Prefer longest / most specific: sort by pattern length desc
  enabled.sort((a, b) => b.pattern.length - a.pattern.length);
  for (const route of enabled) {
    if (!matchDialPattern(dialed, route.pattern)) continue;
    let num = dialed.replace(/\D/g, "") || dialed;
    if (route.stripPrefix > 0) num = num.slice(route.stripPrefix);
    num = `${route.prepend ?? ""}${num}`;
    const trunkIds = (route.trunkIds as string[]) ?? [];
    for (const tid of trunkIds) {
      const [t] = await db.select().from(trunks).where(eq(trunks.id, tid)).limit(1);
      if (!t?.enabled) continue;
      const endpoint = `trunk_${t.id.slice(0, 8)}`;
      return { trunkEndpoint: endpoint, dialNumber: num, routeId: route.id };
    }
  }
  // Fallback: first enabled trunk, dial as-is
  const [t] = await db.select().from(trunks).where(eq(trunks.enabled, true)).limit(1);
  if (!t) return null;
  return {
    trunkEndpoint: `trunk_${t.id.slice(0, 8)}`,
    dialNumber: dialed.replace(/\D/g, "") || dialed,
    routeId: "fallback",
  };
}

export function loadSettings(data: unknown): Settings {
  return SettingsSchema.parse(data ?? {});
}
