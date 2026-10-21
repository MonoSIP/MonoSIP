import i18n from "i18next";
import { tr } from "../../../i18n";
import type { FlowNodeData } from "./FlowNodes";

export const SPEECH_LANGS = [
  { code: "en", label: "English" },
  { code: "tr", label: "Turkish" },
] as const;

/** Language select options labelled in the current UI language. */
export function speechLangOptions() {
  return SPEECH_LANGS.map((l) => ({ value: l.code, label: i18n.t(`langs.${l.code}`, { defaultValue: l.label }) }));
}

/**
 * Selectable TTS voices/models. `female`/`male` map to Edge Neural (online, EN+TR);
 * `ema-lightning` is offline neural Turkish (TR only). The value is sent as the
 * node `gender` and routed by TTS. (Kokoro, offline English, was removed.)
 * `default` follows Admin → Settings → IVR TTS model (no per-node override).
 */
export const SPEECH_VOICES = [
  { value: "female", label: "Female", langs: ["en", "tr"] },
  { value: "male", label: "Male", langs: ["en", "tr"] },
  { value: "ema-lightning", label: "EMA (TR)", langs: ["tr"] },
] as const;

/** Voice options valid for the given language (EMA is TR-only). */
export function voiceOptions(
  language: string,
  opts?: { includeDefault?: boolean },
): { value: string; label: string }[] {
  const lang = (language || "en").toLowerCase();
  const list = SPEECH_VOICES.filter((v) => (v.langs as readonly string[]).includes(lang)).map((v) => ({
    value: v.value,
    label: tr(v.label),
  }));
  if (opts?.includeDefault === false) return list;
  return [{ value: "default", label: tr("System default") }, ...list];
}

export const DEFAULT_MENU_DIGITS = ["1", "2", "3", "4", "5", "0"];

export function menuDigits(data: FlowNodeData | Record<string, unknown>): string[] {
  const raw = data.digits;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map(String).filter(Boolean);
  }
  return [...DEFAULT_MENU_DIGITS];
}

/** Source handles shown on the canvas for a node. */
export function exitsForNode(flowType: string, data: FlowNodeData | Record<string, unknown>): string[] {
  switch (flowType) {
    case "start":
    case "announce":
    case "tts":
    case "set_var":
    case "language":
      return ["next"];
    case "get_key":
      return ["next", "timeout"];
    case "directory":
      return ["found", "not_found"];
    case "subflow":
      return ["return"];
    case "menu":
      return [...menuDigits(data), "timeout", "invalid"];
    case "api":
      return ["success", "error"];
    case "condition":
      return ["true", "false"];
    case "time_condition":
      return ["open", "lunch", "closed", "holiday"];
    case "transfer":
      // Dial-status exits only for extension dials
      if (String(data.destType ?? "extension") !== "extension") return [];
      return ["noanswer", "busy", "chanunavail"];
    case "queue":
    case "voicemail":
    case "hangup":
      return [];
    default:
      return ["next"];
  }
}

export function defaultDataForType(type: string): Partial<FlowNodeData> {
  switch (type) {
    case "announce":
    case "tts":
      return { text: "Welcome", language: "en", gender: "default" };
    case "menu":
      return {
        prompt: "Press 1 or 2",
        language: "en",
        gender: "default",
        maxDigits: 1,
        retries: 2,
        timeoutMs: 12000,
        digits: ["1", "2"],
      };
    case "api":
      return {
        method: "GET",
        url: "",
        authType: "none",
        headers: {},
        timeoutMs: 3000,
        retry: 0,
        mappings: [{ path: "$.data", var: "result" }],
      };
    case "condition":
      return { variable: "caller", op: "=", value: "" };
    case "set_var":
      return { name: "my_var", value: "" };
    case "wait":
      return { seconds: 5, moh: "" };
    case "get_key":
      return {
        name: "pin",
        prompt: "Please enter your code, then press pound.",
        language: "en",
        gender: "default",
        maxDigits: 4,
        minDigits: 1,
        timeoutMs: 12000,
      };
    case "language":
      return { language: "en" };
    case "time_condition":
      return { scheduleId: "" };
    case "directory":
      return { language: "en", timeoutMs: 10000, maxDigits: 8 };
    case "transfer":
      return { destType: "extension", destId: "", timeout: 30 };
    case "queue":
      return { priority: 0 };
    case "voicemail":
      return { extension: "" };
    case "subflow":
      return { flowId: "" };
    case "hangup":
      return {};
    default:
      return {};
  }
}

export function nodeTitle(flowType: string): string {
  const titles: Record<string, string> = {
    start: "Start",
    announce: "Announce / Play",
    tts: "Text to speech",
    menu: "IVR menu",
    get_key: "Get key",
    api: "API request",
    condition: "Condition",
    set_var: "Set variable",
    wait: "Pause",
    language: "Language",
    time_condition: "Schedule gate",
    directory: "Name directory",
    subflow: "Subflow",
    transfer: "Transfer",
    queue: "Queue",
    voicemail: "Voicemail",
    hangup: "Hangup",
  };
  return titles[flowType] ? tr(titles[flowType]) : flowType;
}

/** Compact label for the add-node palette. */
export function nodeShortTitle(flowType: string): string {
  const titles: Record<string, string> = {
    start: "Start",
    announce: "Announce",
    tts: "TTS",
    menu: "Menu",
    get_key: "Get key",
    api: "API",
    condition: "If",
    set_var: "Set var",
    wait: "Pause",
    language: "Lang",
    time_condition: "Schedule",
    directory: "Directory",
    subflow: "Subflow",
    transfer: "Transfer",
    queue: "Queue",
    voicemail: "Voicemail",
    hangup: "Hangup",
  };
  return titles[flowType] ? tr(titles[flowType]) : flowType;
}

/** Accent color shared by palette chips and canvas nodes. */
export function nodeColor(flowType: string): string {
  const colors: Record<string, string> = {
    start: "#64748b",
    announce: "#0d9488",
    tts: "#0284c7",
    menu: "#ea580c",
    get_key: "#d97706",
    api: "#4f46e5",
    condition: "#7c3aed",
    set_var: "#65a30d",
    wait: "#0891b2",
    language: "#db2777",
    time_condition: "#ca8a04",
    directory: "#2563eb",
    subflow: "#9333ea",
    transfer: "#059669",
    queue: "#0f766e",
    voicemail: "#e11d48",
    hangup: "#dc2626",
  };
  return colors[flowType] ?? "#64748b";
}

/** One-line purpose shown under the modal title. */
export function nodeBlurb(flowType: string): string {
  const blurbs: Record<string, string> = {
    start: "Call enters here. Connect next to the first action.",
    announce: "Play a message or saved prompt to the caller.",
    tts: "Speak text aloud (same as announce).",
    menu: "Play a prompt and collect keypad digits.",
    get_key: "Collect keypad digits into a variable (use as $name elsewhere).",
    api: "Call an HTTP API and store fields as variables.",
    condition: "Branch true / false by comparing a variable.",
    set_var: "Save a value for later nodes.",
    wait: "Pause for the chosen number of seconds, then continue.",
    language: "Set language for prompts that follow.",
    time_condition: "Branch by open / lunch / closed / holiday.",
    directory: "Dial-by-name: caller enters surname on keypad.",
    subflow: "Run another published flow, then return.",
    transfer: "Send the call to an extension or destination.",
    queue: "Put the caller into a call queue.",
    voicemail: "Send the caller to a mailbox.",
    hangup: "End the call.",
  };
  return blurbs[flowType] ? tr(blurbs[flowType]) : "";
}

export function modalMaxWidth(flowType: string): string {
  if (flowType === "api" || flowType === "menu") return "max-w-2xl";
  if (flowType === "transfer" || flowType === "condition") return "max-w-xl";
  return "max-w-lg";
}
