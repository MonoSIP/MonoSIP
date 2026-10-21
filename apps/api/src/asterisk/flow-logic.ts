import type { FlowJson } from "@dsip/shared";

/**
 * Expand variable placeholders from the flow bag.
 * Supports both `{{name}}` and `$name` (e.g. `$pin`, `{{caller}}`).
 */
/** Turkish provinces in licence-plate order (index + 1 = plate code). */
export const TR_PROVINCES = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın",
  "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı",
  "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir",
  "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir",
  "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya",
  "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya",
  "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak",
  "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak",
  "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce",
] as const;

/**
 * `{{var|filter}}` transforms for phone menus (keypad in, speech out). English
 * aliases: province = il, digits = rakam, round = tamsayi, amount = tl.
 *   il       plate code ("6", "06", "34") → province name ("Ankara", "İstanbul"); "" if invalid
 *   rakam    "03128440695" → "0 3 1 2 8 4 4 0 6 9 5" so TTS reads a phone number digit by digit
 *   tamsayi  "15.72" → "16"
 *   tl       "49.578" / "6566.77" / "-1.5" → "kırk dokuz virgül elli sekiz" /
 *            "altı bin beş yüz altmış altı virgül yetmiş yedi" / "eksi bir virgül elli"
 *            (2 places, in words: TTS skipped "," and read the decimals digit by digit)
 *   ascii    "İzmir" / "Şanlıurfa" → "izmir" / "sanliurfa" (APIs that reject Turkish letters in a URL)
 */
const ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
const SCALES = ["", "bin", "milyon", "milyar", "trilyon"];

/** 0 ≤ n < 1000 → "dokuz yüz kırk iki" ("yüz", not "bir yüz") */
function hundredsTr(n: number): string {
  const h = Math.floor(n / 100);
  const parts = [h === 0 ? "" : h === 1 ? "yüz" : `${ONES[h]} yüz`, TENS[Math.floor(n / 10) % 10]!, ONES[n % 10]!];
  return parts.filter(Boolean).join(" ");
}

/** Non-negative integer in Turkish words: 6566 → "altı bin beş yüz altmış altı" ("bin", not "bir bin"). */
export function numberToTurkishWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  n = Math.floor(n);
  if (n === 0) return "sıfır";
  const words: string[] = [];
  for (let i = 0; n > 0 && i < SCALES.length; i++, n = Math.floor(n / 1000)) {
    const g = n % 1000;
    if (g === 0) continue;
    words.unshift(i === 1 && g === 1 ? "bin" : [hundredsTr(g), SCALES[i]].filter(Boolean).join(" "));
  }
  return words.join(" ");
}

const TEMPLATE_FILTERS: Record<string, (v: string) => string> = {
  il: (v) => {
    const n = Number(v.trim());
    return Number.isInteger(n) && n >= 1 && n <= TR_PROVINCES.length ? TR_PROVINCES[n - 1]! : "";
  },
  rakam: (v) => v.replace(/\D/g, "").split("").join(" "),
  ascii: (v) =>
    v
      .replace(/İ/g, "i")
      .replace(/I/g, "ı")
      .toLocaleLowerCase("tr-TR")
      .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  tamsayi: (v) => {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) && v.trim() !== "" ? String(Math.round(n)) : v;
  },
  tl: (v) => {
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n) || v.trim() === "") return v;
    const [whole, frac] = Math.abs(n).toFixed(2).split(".") as [string, string];
    const sign = n < 0 && Number(`${whole}.${frac}`) !== 0 ? "eksi " : "";
    // "05" is read "sıfır beş"; ",00" is left out
    const decimals =
      frac === "00" ? "" : ` virgül ${frac[0] === "0" ? `sıfır ${ONES[Number(frac[1])]}` : numberToTurkishWords(Number(frac))}`;
    return `${sign}${numberToTurkishWords(Number(whole))}${decimals}`;
  },
};

// English names (used in the docs); the short Turkish ones keep working.
TEMPLATE_FILTERS.province = TEMPLATE_FILTERS.il!;
TEMPLATE_FILTERS.digits = TEMPLATE_FILTERS.rakam!;
TEMPLATE_FILTERS.round = TEMPLATE_FILTERS.tamsayi!;
TEMPLATE_FILTERS.amount = TEMPLATE_FILTERS.tl!;

export function expandTemplate(tpl: string, vars: Record<string, unknown>): string {
  return String(tpl ?? "")
    .replace(/\{\{(\w+)(?:\|(\w+))?\}\}/g, (_, k: string, f?: string) => {
      const v = String(vars[k] ?? "");
      const fn = f ? TEMPLATE_FILTERS[f] : undefined;
      return fn ? fn(v) : v;
    })
    .replace(/\$([A-Za-z_]\w*)/g, (_, k: string) => String(vars[k] ?? ""));
}

/** Navigate to next node by sourceHandle (or label). */
export function nextNode(
  flow: FlowJson,
  nodeId: string,
  handle?: string,
  /** When true, never fall back to an unrelated edge (menu digits). */
  strict = false,
): FlowJson["nodes"][number] | undefined {
  const matched = flow.edges.find(
    (e) =>
      e.source === nodeId &&
      (handle
        ? e.sourceHandle === handle || e.label === handle
        : !e.sourceHandle || e.sourceHandle === "next"),
  );
  const edge = matched ?? (strict ? undefined : flow.edges.find((e) => e.source === nodeId));
  if (!edge) return undefined;
  return flow.nodes.find((n) => n.id === edge.target);
}

export function menuHasExit(flow: FlowJson, nodeId: string, handle: string): boolean {
  return flow.edges.some(
    (e) => e.source === nodeId && (e.sourceHandle === handle || e.label === handle),
  );
}

export function dialStatusToHandle(status: string): "noanswer" | "busy" | "chanunavail" {
  const s = status.toUpperCase();
  if (s === "BUSY" || s === "CONGESTION") return "busy";
  if (s === "CHANUNAVAIL" || s.includes("UNAVAIL")) return "chanunavail";
  return "noanswer";
}

export function jsonPath(obj: unknown, pathExpr: string): unknown {
  let p = pathExpr;
  if (p.startsWith("$.")) p = p.slice(2);
  else if (p.startsWith("$")) p = p.slice(1);
  if (!p) return obj;
  return p.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Condition / compare ops used by runtime and simulator. */
export function compare(left: string, right: string, op: string): boolean {
  switch (op) {
    case "=":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return Number(left) > Number(right);
    case "<":
      return Number(left) < Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "<=":
      return Number(left) <= Number(right);
    case "contains":
      return left.includes(right);
    case "starts_with":
      return left.startsWith(right);
    case "ends_with":
      return left.endsWith(right);
    case "empty":
      return !left;
    case "regex":
      return new RegExp(right).test(left);
    case "area_code": {
      const digits = left.replace(/\D/g, "");
      let local = digits;
      if (local.startsWith("90") && local.length > 10) local = local.slice(2);
      else if (local.startsWith("0")) local = local.slice(1);
      const want = right.replace(/\D/g, "");
      return want.length > 0 && local.startsWith(want);
    }
    case "country_code": {
      const digits = left.replace(/\D/g, "");
      const label = right.trim().toUpperCase();
      const code =
        label === "TR" || label === "TURKEY"
          ? "90"
          : label === "US" || label === "USA"
            ? "1"
            : right.replace(/\D/g, "");
      if (!code) return false;
      if (digits.startsWith(code)) return true;
      if (code === "90" && digits.startsWith("0") && digits.length >= 11) return true;
      return false;
    }
    default:
      return false;
  }
}

/**
 * Resolve left side for a condition node.
 * area_code / country_code default to caller or DID when variable empty.
 */
export function conditionLeft(
  vars: Record<string, unknown>,
  variable: string,
  op: string,
): string {
  let left = String(vars[variable] ?? "");
  if ((op === "area_code" || op === "country_code") && !left) {
    left = String(vars.caller ?? vars.did ?? "");
  }
  return left;
}

/** Phone keypad letter map (2=ABC … 9=WXYZ) for directory search. */
const KEYPAD: Record<string, string> = {
  a: "2",
  b: "2",
  c: "2",
  d: "3",
  e: "3",
  f: "3",
  g: "4",
  h: "4",
  i: "4",
  j: "5",
  k: "5",
  l: "5",
  m: "6",
  n: "6",
  o: "6",
  p: "7",
  q: "7",
  r: "7",
  s: "7",
  t: "8",
  u: "8",
  v: "8",
  w: "9",
  x: "9",
  y: "9",
  z: "9",
  ç: "2",
  ğ: "4",
  ı: "4",
  İ: "4",
  ö: "6",
  ş: "7",
  ü: "8",
};

export function nameToKeypad(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split("")
    .map((ch) => KEYPAD[ch] ?? (/\d/.test(ch) ? ch : ""))
    .join("");
}

export function matchDirectoryExtension(
  all: Array<{ number: string; name: string }>,
  digits: string,
): { number: string; name: string } | undefined {
  const d = digits.replace(/\D/g, "");
  if (!d) return undefined;
  const exact = all.find((e) => e.number === d);
  if (exact) return exact;
  const scored = all
    .map((e) => {
      const parts = e.name.trim().split(/\s+/);
      const surname = parts[parts.length - 1] ?? e.name;
      const surKey = nameToKeypad(surname);
      const fullKey = nameToKeypad(e.name);
      let score = 0;
      if (surKey.startsWith(d)) score = 100 + (d.length === surKey.length ? 50 : 0);
      else if (fullKey.startsWith(d)) score = 50;
      else if (e.number.startsWith(d)) score = 25;
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.e;
}

/**
 * Pure menu digit resolution (mirrors runtime retry/invalid behaviour).
 * Consumes from `digits` starting at `startIdx`.
 */
export function resolveMenuDigit(opts: {
  flow: FlowJson;
  nodeId: string;
  digits: string[];
  startIdx: number;
  retries?: number;
}): { handle: string; nextIdx: number } {
  const retries = Math.max(0, Math.min(5, opts.retries ?? 2));
  let idx = opts.startIdx;
  let attempt = 0;
  while (attempt <= retries) {
    const raw = opts.digits[idx++];
    if (raw === undefined || raw === "timeout" || raw === "") {
      return { handle: "timeout", nextIdx: idx };
    }
    if (menuHasExit(opts.flow, opts.nodeId, raw)) {
      return { handle: raw, nextIdx: idx };
    }
    attempt++;
    if (attempt > retries) {
      const handle = menuHasExit(opts.flow, opts.nodeId, "invalid") ? "invalid" : "timeout";
      return { handle, nextIdx: idx };
    }
  }
  return { handle: "timeout", nextIdx: idx };
}

/** Encode/decode queue-callback place in missed_calls.callbackCallId while pending. */
export function encodeCallbackPlace(place: number | null | undefined): string | null {
  if (place == null || !Number.isFinite(place) || place < 1) return null;
  return `place:${Math.floor(place)}`;
}

export function decodeCallbackPlace(callbackCallId: string | null | undefined): number | null {
  if (!callbackCallId) return null;
  const m = /^place:(\d+)$/.exec(callbackCallId);
  return m ? Number(m[1]) : null;
}

/** Whether a pending callback should dial given live queue depth. */
export function shouldDialQueueCallback(waiting: number, place: number | null): boolean {
  if (waiting <= 0) return true;
  if (place == null) return false;
  // After opt-in hangup, typical waiting ≈ place - 1; dial when ahead are gone
  return waiting < place;
}
