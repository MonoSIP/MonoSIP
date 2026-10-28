export type AnnounceMode = "answered" | "played" | "dtmf";

export type AnnounceReason =
  | "answered"
  | "played"
  | "dtmf"
  | "no-answer"
  | "busy"
  | "failed"
  | "playback"
  | "no-digit";

/** Empty list allows every number. A filled list matches the start of the digits. */
export function prefixAllowed(number: string, prefixes: string[]): boolean {
  const rules = prefixes.map((p) => p.replace(/\D/g, "")).filter(Boolean);
  if (rules.length === 0) return true;
  const digits = number.replace(/\D/g, "");
  return rules.some((p) => digits.startsWith(p));
}

/** Null caps are unlimited. `recent` is calls started in the last minute. */
export function rateBlock(opts: {
  perMinute: number | null;
  recent: number;
  maxConcurrent: number | null;
  active: number;
}): "minute" | "concurrent" | null {
  if (opts.perMinute != null && opts.recent >= opts.perMinute) return "minute";
  if (opts.maxConcurrent != null && opts.active >= opts.maxConcurrent) return "concurrent";
  return null;
}

/** Absent URL is fine. Anything that is not https is rejected. */
export function webhookUrlOk(url: string | undefined): boolean {
  if (!url) return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function decideAnnounceResult(input: {
  mode: AnnounceMode;
  answered: boolean;
  played: boolean;
  digits: string;
  dial?: "no-answer" | "busy" | "failed";
}): { ok: boolean; reason: AnnounceReason; digits: string | null } {
  if (!input.answered) {
    return { ok: false, reason: input.dial ?? "no-answer", digits: null };
  }
  if (input.mode === "answered") {
    return { ok: true, reason: "answered", digits: null };
  }
  if (input.mode === "played") {
    return input.played
      ? { ok: true, reason: "played", digits: null }
      : { ok: false, reason: "playback", digits: null };
  }
  const digits = input.digits.replace(/\D/g, "");
  if (digits.length > 0) return { ok: true, reason: "dtmf", digits };
  return { ok: false, reason: "no-digit", digits: null };
}

/** Asterisk cause 17 is busy. Any other unanswered cause is no-answer. */
export function dialReasonFromCause(cause: number | undefined): "busy" | "no-answer" {
  return cause === 17 ? "busy" : "no-answer";
}
