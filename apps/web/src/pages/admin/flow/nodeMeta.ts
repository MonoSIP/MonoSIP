import type { FlowNodeData } from "./FlowNodes";

export const SPEECH_LANGS = [
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
] as const;

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
      return { text: "Welcome", language: "en", gender: "female" };
    case "menu":
      return {
        prompt: "Press 1 or 2",
        language: "en",
        gender: "female",
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
    case "get_key":
      return {
        name: "pin",
        prompt: "Please enter your code, then press pound.",
        language: "en",
        gender: "female",
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
    language: "Language",
    time_condition: "Schedule gate",
    directory: "Name directory",
    subflow: "Subflow",
    transfer: "Transfer",
    queue: "Queue",
    voicemail: "Voicemail",
    hangup: "Hangup",
  };
  return titles[flowType] ?? flowType;
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
    language: "Set language for prompts that follow.",
    time_condition: "Branch by open / lunch / closed / holiday.",
    directory: "Dial-by-name: caller enters surname on keypad.",
    subflow: "Run another published flow, then return.",
    transfer: "Send the call to an extension or destination.",
    queue: "Put the caller into a call queue.",
    voicemail: "Send the caller to a mailbox.",
    hangup: "End the call.",
  };
  return blurbs[flowType] ?? "";
}

export function modalMaxWidth(flowType: string): string {
  if (flowType === "api" || flowType === "menu") return "max-w-2xl";
  if (flowType === "transfer" || flowType === "condition") return "max-w-xl";
  return "max-w-lg";
}
