import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  blacklist,
  schedules,
  scheduleRanges,
  holidays,
  inboundRoutes,
  flows,
  flowVersions,
  extensions,
  extensionForwarding,
  queues,
  ringGroups,
  webWidgets,
} from "../db/schema.js";
import type { FlowJson } from "@munasip/shared";

export type Dest = { destType: string; destId: string | null | undefined };

/**
 * Resolve extension destId (UUID or number) to dialable extension number.
 * DestPicker historically stored UUIDs; dialplan needs PJSIP/<number>.
 */
export function resolveExtensionNumber(
  destId: string | null | undefined,
  exts: Array<{ id: string; number: string }>,
): string | null {
  if (!destId) return null;
  const t = destId.trim();
  if (/^\d{2,8}$/.test(t)) return t;
  const byId = exts.find((e) => e.id === t);
  if (byId) return byId.number;
  const byNum = exts.find((e) => e.number === t);
  return byNum?.number ?? null;
}

/**
 * Digit forms used for blacklist matching, including TR national ↔ country-code.
 * Example: 05321112233 → also 905321112233 so patterns like *90532* / 90532* match.
 */
export function blacklistNumberCandidates(number: string): string[] {
  const raw = number.trim();
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!d) return [];
  const out = new Set<string>([d]);
  // TR domestic 0XXXXXXXXXX → E.164 without +
  if (d.startsWith("0") && d.length >= 10 && d.length <= 11) {
    out.add(`90${d.slice(1)}`);
  }
  // TR E.164 → domestic with leading 0
  if (d.startsWith("90") && d.length >= 12 && d.length <= 13) {
    out.add(`0${d.slice(2)}`);
  }
  return [...out];
}

/**
 * Strip phone separators for digit-form matching, but keep wildcards and
 * other literals (e.g. ".") so metacharacters stay escaped and do not glue digits.
 */
function blacklistPatternDigits(pattern: string): string {
  return pattern.replace(/[\s\-()/+]/g, "");
}

function blacklistGlobToRegExp(pattern: string): RegExp {
  return new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")}$`,
  );
}

export function matchBlacklistPattern(number: string, pattern: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  const candidates = blacklistNumberCandidates(number);
  if (!candidates.length) return false;

  if (p.includes("*") || p.includes("?")) {
    const pDigits = blacklistPatternDigits(p);
    if (pDigits) {
      const re = blacklistGlobToRegExp(pDigits);
      if (candidates.some((c) => re.test(c))) return true;
    }
    const reRaw = blacklistGlobToRegExp(p);
    return reRaw.test(number) || candidates.some((c) => reRaw.test(c));
  }

  // Only compare against the digit-stripped form when the pattern actually has
  // digits: "abc".replace(/\D/g,"") === "" and "anything".includes("") is true,
  // which would otherwise blacklist every caller.
  const digits = p.replace(/\D/g, "");
  if (!digits) return false;
  return candidates.some((c) => c.includes(digits)) || number.includes(p);
}

export async function isBlacklisted(
  number: string,
  direction: "inbound" | "outbound",
): Promise<boolean> {
  const rows = await db.select().from(blacklist);
  return rows.some(
    (r) =>
      (r.direction === direction || r.direction === "both") &&
      matchBlacklistPattern(number, r.pattern),
  );
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Returns schedule status: open | lunch | closed | holiday */
export async function evaluateScheduleStatus(
  scheduleId: string,
  at = new Date(),
): Promise<"open" | "lunch" | "closed" | "holiday"> {
  const [sched] = await db.select().from(schedules).where(eq(schedules.id, scheduleId));
  if (!sched) return "closed";

  if (sched.overrideMode === "open") {
    if (!sched.overrideUntil || sched.overrideUntil > at) return "open";
  }
  if (sched.overrideMode === "closed") {
    if (!sched.overrideUntil || sched.overrideUntil > at) return "closed";
  }

  const tz = sched.timezone || "Europe/Istanbul";
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(at).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = weekdayMap[parts.weekday ?? "Mon"] ?? 1;
  const minutes = timeToMinutes(`${parts.hour}:${parts.minute}`);

  const hols = await db.select().from(holidays);
  const hol = hols.find(
    (h) => h.date === dateStr && (!h.scheduleId || h.scheduleId === scheduleId),
  );
  if (hol) {
    if (hol.halfDay && minutes < 12 * 60) return "open";
    return "holiday";
  }

  const ranges = await db
    .select()
    .from(scheduleRanges)
    .where(eq(scheduleRanges.scheduleId, scheduleId));
  const today = ranges.filter((r) => r.dayOfWeek === dow);
  for (const r of today) {
    const start = timeToMinutes(r.startTime);
    const end = timeToMinutes(r.endTime);
    if (minutes >= start && minutes < end) {
      return r.status === "lunch" ? "lunch" : "open";
    }
  }
  return "closed";
}

export function destForScheduleStatus(
  sched: typeof schedules.$inferSelect,
  status: "open" | "lunch" | "closed" | "holiday",
): Dest {
  switch (status) {
    case "open":
      return { destType: sched.openDestType ?? "flow", destId: sched.openDestId };
    case "lunch":
      return {
        destType: sched.lunchDestType ?? sched.closedDestType ?? "flow",
        destId: sched.lunchDestId ?? sched.closedDestId,
      };
    case "holiday":
      return {
        destType: sched.holidayDestType ?? sched.closedDestType ?? "flow",
        destId: sched.holidayDestId ?? sched.closedDestId,
      };
    default:
      return { destType: sched.closedDestType ?? "flow", destId: sched.closedDestId };
  }
}

export async function loadPublishedFlow(flowId?: string | null): Promise<FlowJson | null> {
  let row;
  if (flowId) {
    [row] = await db.select().from(flows).where(eq(flows.id, flowId));
  } else {
    const all = await db.select().from(flows);
    row = all.find((f) => f.name === "Main IVR") ?? all[0];
  }
  if (!row) return null;
  if (!row.publishedVersionId) return (row.draftJson as FlowJson) ?? null;
  const [ver] = await db
    .select()
    .from(flowVersions)
    .where(eq(flowVersions.id, row.publishedVersionId));
  return (ver?.json as FlowJson) ?? (row.draftJson as FlowJson);
}

export type ResolvedInbound =
  | { kind: "flow"; flow: FlowJson }
  | { kind: "extension"; number: string }
  | { kind: "queue"; number: string }
  | { kind: "ring_group"; number: string }
  | { kind: "hangup"; reason: string }
  | { kind: "voicemail"; extension: string };

export async function resolveDestination(dest: Dest): Promise<ResolvedInbound> {
  const type = dest.destType || "flow";
  const id = dest.destId ?? null;

  if (type === "hangup" || type === "busy") return { kind: "hangup", reason: type };
  if (type === "flow") {
    const flow = await loadPublishedFlow(id);
    if (!flow) return { kind: "hangup", reason: "no-flow" };
    return { kind: "flow", flow };
  }
  if (type === "extension" && id) {
    const [ext] = await db.select().from(extensions).where(eq(extensions.number, id)).limit(1);
    if (ext) return { kind: "extension", number: ext.number };
    const [byId] = await db.select().from(extensions).where(eq(extensions.id, id)).limit(1);
    if (byId) return { kind: "extension", number: byId.number };
  }
  if (type === "queue" && id) {
    const [q] =
      (await db.select().from(queues).where(eq(queues.number, id)).limit(1)).length
        ? await db.select().from(queues).where(eq(queues.number, id)).limit(1)
        : await db.select().from(queues).where(eq(queues.id, id)).limit(1);
    if (q) return { kind: "queue", number: q.number };
  }
  if ((type === "ring_group" || type === "ringgroup") && id) {
    const rows = await db.select().from(ringGroups);
    const rg = rows.find((r) => r.number === id || r.id === id);
    if (rg) return { kind: "ring_group", number: rg.number };
  }
  if (type === "voicemail" && id) {
    return { kind: "voicemail", extension: id };
  }
  if (type === "schedule" && id) {
    return resolveScheduleDestination(id);
  }
  const flow = await loadPublishedFlow(id);
  if (flow) return { kind: "flow", flow };
  return { kind: "hangup", reason: "unresolved" };
}

export async function resolveScheduleDestination(scheduleId: string): Promise<ResolvedInbound> {
  const [sched] = await db.select().from(schedules).where(eq(schedules.id, scheduleId));
  if (!sched) return { kind: "hangup", reason: "no-schedule" };
  const status = await evaluateScheduleStatus(scheduleId);
  const dest = destForScheduleStatus(sched, status);
  if (!dest.destType || dest.destType === "schedule") {
    const flow = await loadPublishedFlow();
    return flow ? { kind: "flow", flow } : { kind: "hangup", reason: "schedule-empty" };
  }
  return resolveDestination(dest);
}

function matchCallerPattern(caller: string, pattern: string | null | undefined): boolean {
  if (!pattern) return true;
  const p = pattern.trim();
  if (!p || p === "*") return true;
  const n = caller.replace(/\D/g, "");
  if (p.includes("*") || p.includes("?")) {
    const re = new RegExp(
      "^" +
        p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") +
        "$",
    );
    return re.test(caller) || re.test(n);
  }
  return caller.includes(p) || n.includes(p.replace(/\D/g, ""));
}

export async function resolveInbound(
  did: string,
  caller: string,
): Promise<ResolvedInbound> {
  if (await isBlacklisted(caller, "inbound")) {
    return { kind: "hangup", reason: "blacklist" };
  }
  // Website call widgets use a virtual DID (no inbound_routes row required)
  const [widget] = await db
    .select()
    .from(webWidgets)
    .where(and(eq(webWidgets.number, did), eq(webWidgets.enabled, true)))
    .limit(1);
  if (widget) {
    return resolveDestination({ destType: widget.destType, destId: widget.destId });
  }

  const routes = await db.select().from(inboundRoutes);
  const sorted = [...routes].sort((a, b) => a.priority - b.priority);
  const candidates = sorted.filter((r) => r.did === did || r.did === "default" || r.did === "_X.");
  const route =
    candidates.find((r) => r.did === did && matchCallerPattern(caller, r.callerPattern)) ??
    candidates.find((r) => r.did === did) ??
    candidates.find((r) => r.did === "default" && matchCallerPattern(caller, r.callerPattern)) ??
    candidates.find((r) => r.did === "default") ??
    sorted[0];
  if (!route) {
    const flow = await loadPublishedFlow();
    return flow ? { kind: "flow", flow } : { kind: "hangup", reason: "no-route" };
  }
  return resolveDestination({ destType: route.destType, destId: route.destId });
}

/** Resolve who to dial for an internal extension (boss→secretary, DND). */
export async function resolveExtensionDial(
  number: string,
): Promise<{ dial: string; ringSeconds: number; reason?: string } | { busy: true }> {
  const [ext] = await db.select().from(extensions).where(eq(extensions.number, number)).limit(1);
  if (!ext) return { dial: number, ringSeconds: 20 };
  if (ext.dnd) return { busy: true };

  // Boss–secretary: if this ext is a boss, ring secretary first
  const secretaries = await db
    .select()
    .from(extensions)
    .where(eq(extensions.bossSecretaryOf, ext.id));
  if (secretaries.length && !secretaries[0].dnd) {
    return { dial: secretaries[0].number, ringSeconds: 20, reason: "boss-secretary" };
  }

  const rules = await db
    .select()
    .from(extensionForwarding)
    .where(eq(extensionForwarding.extensionId, ext.id));
  // Immediate always-forward if condition=always
  const always = rules.find((r) => r.condition === "always");
  if (always?.destType === "extension" && always.destId) {
    const all = await db.select().from(extensions);
    const num = resolveExtensionNumber(always.destId, all) ?? always.destId;
    return { dial: num, ringSeconds: always.ringSeconds };
  }
  if (always?.destType === "external" && always.destId && ext.mobileForwardAllowed) {
    return { dial: always.destId, ringSeconds: always.ringSeconds, reason: "external-fwd" };
  }

  const ring =
    rules.find((r) => r.condition === "noanswer")?.ringSeconds ?? 20;
  return { dial: ext.number, ringSeconds: ring };
}

export async function forwardingOnStatus(
  extensionNumber: string,
  status: "noanswer" | "busy" | "chanunavail",
): Promise<Dest | null> {
  const [ext] = await db
    .select()
    .from(extensions)
    .where(eq(extensions.number, extensionNumber))
    .limit(1);
  if (!ext) return null;
  const rules = await db
    .select()
    .from(extensionForwarding)
    .where(eq(extensionForwarding.extensionId, ext.id));
  const rule = rules.find((r) => r.condition === status) ?? rules.find((r) => r.condition === "always");
  if (!rule) return null;
  return { destType: rule.destType, destId: rule.destId };
}
