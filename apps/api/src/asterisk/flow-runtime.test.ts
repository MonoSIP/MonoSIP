import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit coverage for asterisk/flow-runtime.ts.
 *
 * IMPORTANT SHAPE NOTE: this module exports exactly one symbol —
 * `attachFlowRuntime()`. The call-state machine (`executeFlowLoop`,
 * `runFlowOnChannel`, `handleOutbound`, `applyResolved`) and destination
 * resolution are module-private, so they cannot be called directly. What IS
 * publicly observable — and what these tests drive — is the ARI event
 * dispatch table inside `attachFlowRuntime()`: which (application, args) pairs
 * produce which ARI actions.
 *
 * Everything at the boundary (ARI, Postgres, routing, webhooks, CDR) is mocked;
 * no network or database is touched.
 */

const handlers = new Map<string, (ev: unknown) => void>();

vi.mock("./ari.js", () => {
  const ari = {
    on: vi.fn((ev: string, fn: (e: unknown) => void) => {
      handlers.set(ev, fn);
    }),
    emit: vi.fn(),
    answer: vi.fn(async () => undefined),
    hangup: vi.fn(async () => undefined),
    redirect: vi.fn(async () => undefined),
    addToBridge: vi.fn(async () => true),
    play: vi.fn(async () => undefined),
    playAndWait: vi.fn(async () => undefined),
    setChannelVar: vi.fn(async () => undefined),
    waitForDigit: vi.fn(async () => "1"),
    record: vi.fn(async () => undefined),
    playCollectDtmf: vi.fn(async () => "1"),
    waitDtmf: vi.fn(async () => "1"),
    waitDtmfDigits: vi.fn(async () => "1"),
    clearDtmfBuffer: vi.fn(() => undefined),
    hasBufferedDtmf: vi.fn(() => false),
    startMoh: vi.fn(async () => true),
    stopMoh: vi.fn(async () => undefined),
    stopPlayback: vi.fn(async () => undefined),
    isEndpointOnline: vi.fn(async () => true),
    endpointState: vi.fn(async () => ({ online: true, busy: false })),
    subscribeChannel: vi.fn(async () => undefined),
    bridge: vi.fn(async () => undefined),
    originate: vi.fn(async () => "ch-1"),
    health: vi.fn(async () => true),
  };
  return { ari };
});

/**
 * Rows the db double hands back. `tables` is keyed by the Postgres table name so
 * the inbound branch can read settings, missed_calls and last_dial_attempts as
 * three DIFFERENT result sets from one handler; `rows` is the fallback for any
 * table that has no explicit entry.
 */
const dbState = vi.hoisted(() => ({
  rows: [] as unknown[],
  tables: {} as Record<string, unknown[]>,
  updates: [] as unknown[],
}));

/** Drizzle tags every table object with its SQL name under this symbol. */
const TABLE_NAME = Symbol.for("drizzle:Name");
const rowsFor = (table: unknown) => {
  const name = (table as Record<symbol, string> | undefined)?.[TABLE_NAME];
  return (name && dbState.tables[name]) || dbState.rows;
};

/** Reset every seeded table plus the fallback, so no row leaks between tests. */
function resetDb() {
  dbState.rows = [];
  dbState.tables = {};
  dbState.updates = [];
}

/** A Drizzle chain that is also awaitable, so `await db.select().from(x)` works. */
const chain = (rows?: unknown[]) => {
  const c: Record<string, unknown> = () => c;
  c.where = () => c;
  c.limit = () => c;
  c.then = (r: (v: unknown) => unknown) => r(rows ?? []);
  return c as never;
};

vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => chain(rowsFor(table))),
      limit: vi.fn(() => chain([])),
    })),
    update: vi.fn(() => ({
      set: vi.fn((vals: unknown) => {
        dbState.updates.push(vals);
        return { where: vi.fn(async () => undefined) };
      }),
    })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  },
  pool: { end: vi.fn(async () => undefined) },
}));

vi.mock("../lib/webhooks.js", () => ({ dispatchWebhooks: vi.fn(async () => undefined) }));

vi.mock("./routing.js", () => ({
  resolveInbound: vi.fn(async () => ({ kind: "hangup", reason: "test" })),
  loadPublishedFlow: vi.fn(async () => null),
  resolveDestination: vi.fn(async () => ({ kind: "hangup", reason: "test" })),
  evaluateScheduleStatus: vi.fn(async () => "open"),
  isBlacklisted: vi.fn(async () => false),
  resolveExtensionNumber: vi.fn((destId: string | null | undefined, exts: Array<{ id: string; number: string }>) => {
    if (!destId) return null;
    const t = destId.trim();
    if (/^\d{2,8}$/.test(t)) return t;
    return exts.find((e) => e.id === t)?.number ?? exts.find((e) => e.number === t)?.number ?? null;
  }),
}));

vi.mock("../lib/cdr.js", () => ({
  cdrStart: vi.fn(async () => undefined),
  cdrAnswered: vi.fn(async () => undefined),
  cdrEnd: vi.fn(async () => undefined),
  cdrIsOpen: vi.fn(() => false),
}));

vi.mock("../lib/recording-files.js", () => ({
  discardEmptyRecordingsForCall: vi.fn(async () => 0),
}));

vi.mock("../lib/call-policy.js", () => ({
  isAnonymousCaller: vi.fn(() => false),
  loadSettings: vi.fn(() => ({})),
  isEmergencyNumber: vi.fn(() => false),
  checkExtensionOutbound: vi.fn(async () => ({ ok: true })),
  resolveOutboundDial: vi.fn(async () => ({
    trunkEndpoint: "trunk_abcdef12",
    dialNumber: "05321112233",
    routeId: "route-1",
  })),
}));

vi.mock("../lib/silence.js", () => ({
  silenceMedia: vi.fn(async (ms: number) => `sound:monosip/silence-${ms}`),
}));

vi.mock("../lib/smtp.js", () => ({ sendSmtpMail: vi.fn(async () => undefined) }));

vi.mock("../lib/crypto.js", () => ({ decrypt: vi.fn(() => "tok-123") }));

vi.mock("../lib/tts.js", () => ({
  synthesizeSpeech: vi.fn(async () => Buffer.from("wav")),
  writePromptWav: vi.fn(async (id: string) => ({
    filePath: `/tmp/${id}.wav`,
    media: `sound:monosip/${id}`,
  })),
  ensureSpeechMedia: vi.fn(async () => ({
    media: "sound:monosip/cached",
    cached: false,
    ms: 1,
  })),
  promptMediaUri: vi.fn(() => "sound:monosip/p1"),
}));

import { ari } from "./ari.js";
import { loadPublishedFlow, resolveDestination, isBlacklisted, resolveInbound } from "./routing.js";
import { cdrAnswered, cdrEnd, cdrIsOpen, cdrStart } from "../lib/cdr.js";
import {
  applyResolved,
  attachFlowRuntime,
  executeFlowLoop,
  handleOutbound,
  MEDIA_SETTLE_MS,
  resolveSpeechLang,
  runFlowOnChannel,
} from "./flow-runtime.js";
import {
  checkExtensionOutbound,
  isAnonymousCaller,
  isEmergencyNumber,
  loadSettings,
  resolveOutboundDial,
} from "../lib/call-policy.js";
import { evaluateScheduleStatus } from "./routing.js";
import { ensureSpeechMedia, promptMediaUri, synthesizeSpeech } from "../lib/tts.js";
import { decrypt } from "../lib/crypto.js";

// ---------------------------------------------------------------- fixtures

type Nd = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
const node = (id: string, type: string, data: Record<string, unknown> = {}): Nd => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});
const edge = (source: string, target: string, label?: string) => ({
  id: `${source}-${target}`,
  source,
  target,
  label,
});
const flowOf = (nodes: Nd[], edges: ReturnType<typeof edge>[] = []) =>
  ({ nodes, edges, variables: ["caller"] }) as never;

/** Drive the dispatch loop from `startNode` and hand back the mutable vars. */
async function runLoop(
  startNode: Nd | undefined,
  flow: unknown,
  vars: Record<string, string> = {},
  asSubflow = false,
) {
  const result = await executeFlowLoop(
    "ch-n",
    flow as never,
    vars,
    0,
    startNode as never,
    new Set<string>(),
    async () => undefined,
    asSubflow,
  );
  return { result, vars };
}

/**
 * Like runLoop, but for paths that sleep (e.g. the api node's 400 ms retry).
 * The promise must be started BEFORE time is advanced, or the sleep never
 * resolves and the call hangs.
 */
async function runLoopTimed(
  startNode: Nd | undefined,
  flow: unknown,
  vars: Record<string, string> = {},
  ms = 1500,
) {
  const running = runLoop(startNode, flow, vars);
  await vi.advanceTimersByTimeAsync(ms);
  return running;
}

/** Deliver a stasisStart event and let the handler's 50ms defer drain. */
async function stasis(ev: {
  application: string;
  channel: { id: string; caller?: { number?: string } };
  args?: string[];
}) {
  handlers.get("stasisStart")!(ev);
  await vi.advanceTimersByTimeAsync(60);
}

beforeEach(() => {
  handlers.clear();
  resetDb();
  vi.useFakeTimers();
  vi.mocked(loadPublishedFlow).mockResolvedValue(null);
  vi.mocked(cdrIsOpen).mockReturnValue(false);
  vi.mocked(isBlacklisted).mockResolvedValue(false);
  vi.mocked(isEmergencyNumber).mockReturnValue(false);
  vi.mocked(checkExtensionOutbound).mockResolvedValue({ ok: true } as never);
  vi.mocked(resolveOutboundDial).mockResolvedValue({
    trunkEndpoint: "trunk_abcdef12",
    dialNumber: "05321112233",
    routeId: "route-1",
  } as never);
  vi.mocked(ari.playCollectDtmf).mockResolvedValue("1");
  vi.mocked(ari.waitDtmfDigits).mockResolvedValue("1");
  vi.mocked(ari.waitDtmf).mockResolvedValue("1");
  vi.mocked(ari.isEndpointOnline).mockResolvedValue(true);
  vi.mocked(ari.endpointState).mockResolvedValue({ online: true, busy: false });
  vi.mocked(ari.play).mockResolvedValue("pb-1");
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("attachFlowRuntime", () => {
  it("subscribes to exactly the channelDestroyed and stasisStart events", () => {
    attachFlowRuntime();
    const events = vi.mocked(ari.on).mock.calls.map((c) => c[0]);
    expect(events).toEqual(["channelDestroyed", "stasisStart"]);
  });

  it("is safe to call without throwing", () => {
    expect(() => attachFlowRuntime()).not.toThrow();
  });
});

describe("stasisStart dispatch table", () => {
  beforeEach(() => attachFlowRuntime());

  it("answers and bridges a channel sent to monosip-flow/bridge", async () => {
    await stasis({
      application: "monosip-flow",
      channel: { id: "ch-100" },
      args: ["bridge", "BRIDGE-1"],
    });
    expect(ari.answer).toHaveBeenCalledWith("ch-100");
    expect(ari.addToBridge).toHaveBeenCalledWith("BRIDGE-1", "ch-100");
    expect(ari.hangup).not.toHaveBeenCalled();
  });

  it("ignores a bridge join with no bridge id", async () => {
    await stasis({ application: "monosip-flow", channel: { id: "ch-101" }, args: ["bridge"] });
    expect(ari.addToBridge).not.toHaveBeenCalled();
  });

  it("parks a snoop-wait channel without acting on it", async () => {
    await stasis({ application: "monosip-flow", channel: { id: "ch-102" }, args: ["snoop-wait"] });
    expect(ari.answer).not.toHaveBeenCalled();
    expect(ari.hangup).not.toHaveBeenCalled();
  });

  it("hangs up a transfer that fails with no pending transfer", async () => {
    await stasis({
      application: "monosip-flow",
      channel: { id: "ch-103" },
      args: ["dial-failed", "NOANSWER"],
    });
    expect(ari.hangup).toHaveBeenCalledWith("ch-103");
  });

  it("follows the busy exit to a hangup node when the dial fails BUSY", async () => {
    dbState.rows = [{ id: "uuid-102", number: "102" }];
    const t = node("t", "transfer", { destType: "extension", destId: "102" });
    const flow = flowOf(
      [t, node("h", "hangup"), node("v", "voicemail", { extension: "102" })],
      [edge("t", "v", "noanswer"), edge("t", "h", "busy")],
    );
    // Transfer parks the call in the dial context (pending transfer recorded)...
    await executeFlowLoop("ch-200", flow, { caller: "101" }, 0, t as never, new Set(), async () => undefined);
    expect(ari.redirect).toHaveBeenCalledWith("ch-200", "s", "monosip-flow-dial");
    vi.mocked(ari.redirect).mockClear();
    // ...and the dialplan returns BUSY to Stasis.
    await stasis({ application: "monosip-flow", channel: { id: "ch-200" }, args: ["dial-failed", "BUSY"] });
    expect(ari.hangup).toHaveBeenCalledWith("ch-200");
    expect(ari.redirect).not.toHaveBeenCalled();
  });

  it("hangs up an unrecognised application", async () => {
    await stasis({ application: "some-other-app", channel: { id: "ch-104" } });
    expect(ari.hangup).toHaveBeenCalledWith("ch-104");
  });

  it("hangs up a monosip-flow main entry when no published flow exists", async () => {
    vi.mocked(loadPublishedFlow).mockResolvedValue(null);
    await stasis({ application: "monosip-flow", channel: { id: "ch-105" }, args: ["main"] });

    expect(loadPublishedFlow).toHaveBeenCalled();
    expect(ari.hangup).toHaveBeenCalledWith("ch-105");
    expect(cdrEnd).not.toHaveBeenCalled();
  });

  it("loads a named flow by key and answers the channel", async () => {
    vi.mocked(loadPublishedFlow).mockResolvedValue({
      nodes: [{ id: "start", type: "start", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      variables: ["caller"],
    });
    await stasis({
      application: "monosip-flow",
      channel: { id: "ch-106", caller: { number: "101" } },
      args: ["flow-abc"],
    });
    expect(loadPublishedFlow).toHaveBeenCalledWith("flow-abc");
  });

  it("answers an outbound channel before dispatching", async () => {
    await stasis({
      application: "monosip-outbound",
      channel: { id: "ch-107", caller: { number: "101" } },
      args: ["05321112233"],
    });
    expect(ari.answer).toHaveBeenCalledWith("ch-107");
  });
});

describe("executeFlowLoop — node-type dispatch", () => {
  it("follows the start node to its successor", async () => {
    const flow = flowOf([node("s", "start"), node("h", "hangup")], [edge("s", "h")]);
    const { result } = await runLoop(node("s", "start"), flow);
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
    expect(result).toBe("left");
  });

  it.each([
    ["announce", "announce"],
    ["tts", "tts"],
  ])("plays audio for a %s node", async (label, type) => {
    const flow = flowOf([node("a", type, { text: "Hello there" })]);
    await runLoop(node("a", type, { text: "Hello there" }), flow);
    expect(ari.playAndWait).toHaveBeenCalled();
    expect(ari.playAndWait.mock.calls[0]?.[0]).toBe("ch-n");
  });

  it("hangs up when a node has no successor", async () => {
    const flow = flowOf([node("h", "hangup")]);
    const { result } = await runLoop(node("h", "hangup"), flow);
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
    expect(result).toBe("left");
  });

  it("returns 'ok' instead of hanging up when running as a subflow", async () => {
    const flow = flowOf([node("a", "announce", { text: "x" })]);
    const { result } = await runLoop(node("a", "announce", { text: "x" }), flow, {}, true);
    expect(result).toBe("ok");
    expect(ari.hangup).not.toHaveBeenCalled();
  });

  it("skips an already-visited node instead of looping forever", async () => {
    const flow = flowOf([node("s", "start"), node("a", "announce", { text: "x" })], [
      edge("s", "a"),
      edge("a", "s"),
    ]);
    const result = await executeFlowLoop(
      "ch-n",
      flow as never,
      {},
      0,
      node("s", "start") as never,
      new Set(["s"]),
      async () => undefined,
    );
    expect(result).toBe("left");
  });

  it("skips an unknown node type and keeps going", async () => {
    const flow = flowOf([node("u", "bogus-node"), node("h", "hangup")], [edge("u", "h")]);
    await runLoop(node("u", "bogus-node"), flow);
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
  });
});

describe("resolveSpeechLang", () => {
  it("prefers the node language over the flow variable", () => {
    expect(resolveSpeechLang({ language: "en" }, { language: "tr" })).toBe("en");
    expect(resolveSpeechLang({ language: "tr" }, { language: "en" })).toBe("tr");
  });

  it("falls back to the flow language variable when the node has none", () => {
    expect(resolveSpeechLang({}, { language: "tr" })).toBe("tr");
    expect(resolveSpeechLang({}, {})).toBe("en");
  });
});

describe("executeFlowLoop — variable and branching nodes", () => {
  it("set_var writes into the variable bag", async () => {
    const flow = flowOf([node("v", "set_var", { name: "tier", value: "gold" })]);
    const { vars } = await runLoop(node("v", "set_var", { name: "tier", value: "gold" }), flow);
    expect(vars.tier).toBe("gold");
  });

  it("get_key stores collected digits under the named variable", async () => {
    vi.mocked(ari.waitDtmfDigits).mockResolvedValue("4321");
    const flow = flowOf(
      [node("g", "get_key", { name: "pin", maxDigits: 4 }), node("h", "hangup")],
      [edge("g", "h", "next"), edge("g", "h", "timeout")],
    );
    const { vars } = await runLoop(node("g", "get_key", { name: "pin", maxDigits: 4 }), flow);
    expect(vars.pin).toBe("4321");
    expect(vars.dtmf).toBe("4321");
    expect(ari.waitDtmfDigits).toHaveBeenCalled();
  });

  it("get_key takes timeout when digits are missing", async () => {
    vi.mocked(ari.waitDtmfDigits).mockResolvedValue("");
    const flow = flowOf(
      [node("g", "get_key", { name: "pin", minDigits: 1 }), node("h", "hangup")],
      [edge("g", "h", "timeout")],
    );
    const { vars } = await runLoop(node("g", "get_key", { name: "pin", minDigits: 1 }), flow);
    expect(vars.pin).toBe("");
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
  });

  it("language sets the locale used by later TTS", async () => {
    const flow = flowOf([node("l", "language", { language: "tr" })]);
    const { vars } = await runLoop(node("l", "language", { language: "tr" }), flow);
    expect(vars.language).toBe("tr");
  });

  it("condition takes the true edge when the comparison holds", async () => {
    const flow = flowOf(
      [node("c", "condition", { op: "=", variable: "tier", value: "gold" }), node("v", "voicemail", { extension: "101" }), node("h", "hangup")],
      [edge("c", "v", "true"), edge("c", "h", "false")],
    );
    await runLoop(node("c", "condition", { op: "=", variable: "tier", value: "gold" }), flow, {
      tier: "gold",
    });
    expect(ari.redirect).toHaveBeenCalledWith("ch-n", "*101", "monosip-voicemail");
  });

  it("condition takes the false edge when the comparison fails", async () => {
    const flow = flowOf(
      [node("c", "condition", { op: "=", variable: "tier", value: "gold" }), node("v", "voicemail", { extension: "101" }), node("h", "hangup")],
      [edge("c", "v", "true"), edge("c", "h", "false")],
    );
    await runLoop(node("c", "condition", { op: "=", variable: "tier", value: "gold" }), flow, {
      tier: "bronze",
    });
    expect(ari.redirect).not.toHaveBeenCalled();
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
  });

  it("time_condition routes on the live schedule status", async () => {
    vi.mocked(evaluateScheduleStatus).mockResolvedValue("open");
    const flow = flowOf(
      [node("t", "time_condition", { scheduleId: "sched-1" }), node("v", "voicemail", { extension: "101" }), node("h", "hangup")],
      [edge("t", "v", "open"), edge("t", "h", "closed")],
    );
    await runLoop(node("t", "time_condition", { scheduleId: "sched-1" }), flow);
    expect(evaluateScheduleStatus).toHaveBeenCalledWith("sched-1");
    expect(ari.redirect).toHaveBeenCalledWith("ch-n", "*101", "monosip-voicemail");
  });

  it("time_condition without a schedule is treated as closed", async () => {
    const flow = flowOf(
      [node("t", "time_condition", {}), node("h", "hangup")],
      [edge("t", "h", "closed")],
    );
    await runLoop(node("t", "time_condition", {}), flow);
    expect(evaluateScheduleStatus).not.toHaveBeenCalled();
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
  });
});

describe("executeFlowLoop — terminal nodes", () => {
  it("speaks a greeting's own voice even when settings apply one model to the rest", async () => {
    const flow = flowOf([
      node("a", "tts", {
        text: "Sayın Ali, hoş geldiniz.",
        language: "tr",
        gender: "male",
      }),
    ]);
    await runLoop(node("a", "tts", { text: "Sayın Ali, hoş geldiniz.", language: "tr", gender: "male" }), flow, {
      __ttsVoice: "ema-lightning",
      __ttsApplyAll: "1",
    });
    expect(ensureSpeechMedia).toHaveBeenCalledWith(
      "Sayın Ali, hoş geldiniz.",
      "tr",
      1.05,
      "male",
    );
  });

  it("uses the settings model when the greeting is left on system default", async () => {
    const flow = flowOf([node("a", "tts", { text: "Merhaba.", language: "tr", gender: "default" })]);
    await runLoop(node("a", "tts", { text: "Merhaba.", language: "tr", gender: "default" }), flow, {
      __ttsVoice: "ema-lightning",
      __ttsApplyAll: "1",
    });
    expect(ensureSpeechMedia).toHaveBeenCalledWith("Merhaba.", "tr", 1.05, "ema-lightning");
  });

  it("voicemail redirects to the extension's voicemail", async () => {
    const flow = flowOf([node("v", "voicemail", { extension: "101" })]);
    const { result } = await runLoop(node("v", "voicemail", { extension: "101" }), flow);
    expect(ensureSpeechMedia).toHaveBeenCalledWith(
      "Please leave your message after the tone.",
      "en",
      1.05,
      "female",
    );
    expect(ari.redirect).toHaveBeenCalledWith("ch-n", "*101", "monosip-voicemail");
    expect(result).toBe("left");
  });

  it("voicemail with no extension hangs up instead", async () => {
    const flow = flowOf([node("v", "voicemail", {})]);
    await runLoop(node("v", "voicemail", {}), flow);
    expect(ari.redirect).not.toHaveBeenCalled();
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
  });

  it("queue resolves the destination and redirects", async () => {
    vi.mocked(resolveDestination).mockResolvedValue({ kind: "queue", number: "100" } as never);
    const flow = flowOf([node("q", "queue", { queueNumber: "100" })]);
    const { result } = await runLoop(node("q", "queue", { queueNumber: "100" }), flow);
    expect(result).toBe("left");
    expect(ari.redirect).toHaveBeenCalledWith("ch-n", "100", "from-internal");
  });

  it("queue with no number hangs up", async () => {
    const flow = flowOf([node("q", "queue", {})]);
    await runLoop(node("q", "queue", {}), flow);
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
  });

  it("queue sets QUEUE_PRIO for a VIP caller", async () => {
    const flow = flowOf([node("q", "queue", { queueNumber: "100" })]);
    await runLoop(node("q", "queue", { queueNumber: "100" }), flow, { vip: "true" });
    expect(ari.setChannelVar).toHaveBeenCalledWith("ch-n", "QUEUE_PRIO", "10");
  });

  it("hangup node ends the channel", async () => {
    const flow = flowOf([node("h", "hangup")]);
    const { result } = await runLoop(node("h", "hangup"), flow);
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
    expect(result).toBe("left");
  });
});

describe("applyResolved", () => {
  const vars = { caller: "101" };

  it.each([
    [{ kind: "hangup", reason: "no-route" }, undefined],
    [{ kind: "extension", number: "101" }, ["101", "from-internal"]],
    [{ kind: "queue", number: "100" }, ["100", "from-internal"]],
    [{ kind: "ring_group", number: "200" }, ["200", "from-internal"]],
    [{ kind: "voicemail", extension: "101" }, ["*101", "from-internal"]],
  ] as const)("maps resolved kind %o onto the right ARI call", async (resolved, expected) => {
    await applyResolved("ch-r", resolved as never, { ...vars });
    if (!expected) {
      expect(ari.hangup).toHaveBeenCalledWith("ch-r");
    } else {
      expect(ari.redirect).toHaveBeenCalledWith("ch-r", expected[0], expected[1]);
    }
  });
});

describe("runFlowOnChannel", () => {
  it("answers the channel before entering the loop", async () => {
    const flow = flowOf([node("s", "start"), node("h", "hangup")], [edge("s", "h")]);
    // runFlowOnChannel sleeps MEDIA_SETTLE_MS before the loop so WebRTC media settles;
    // under fake timers that sleep only resolves once time is advanced.
    const running = runFlowOnChannel("ch-f", flow as never, { caller: "101" });
    await vi.advanceTimersByTimeAsync(MEDIA_SETTLE_MS + 100);
    await running;
    expect(ari.answer).toHaveBeenCalledWith("ch-f");
  });

  it("refuses to descend past the depth limit", async () => {
    const flow = flowOf([node("h", "hangup")]);
    const result = await runFlowOnChannel("ch-f", flow as never, {}, 99);
    expect(ari.hangup).toHaveBeenCalledWith("ch-f");
    expect(result).toBe("left");
  });

  it("does not hang up when the depth limit is hit inside a subflow", async () => {
    const flow = flowOf([node("h", "hangup")]);
    const result = await runFlowOnChannel("ch-f", flow as never, {}, 99, true);
    expect(ari.hangup).not.toHaveBeenCalled();
    expect(result).toBe("left");
  });
});

describe("executeFlowLoop — menu node", () => {
  it("collects a single digit and follows the matching edge", async () => {
    const flow = flowOf([node("m", "menu", { prompt: "Press one" }), node("v", "voicemail", { extension: "101" })], [
      edge("m", "v", "1"),
    ]);
    const { vars, result } = await runLoop(node("m", "menu", { prompt: "Press one" }), flow);
    expect(ari.playCollectDtmf).toHaveBeenCalled();
    expect(vars.dtmf).toBe("1");
    expect(ari.redirect).toHaveBeenCalledWith("ch-n", "*101", "monosip-voicemail");
    expect(result).toBe("left");
  });

  it("uses multi-digit collection when maxDigits > 1", async () => {
    const flow = flowOf([node("m", "menu", { prompt: "Enter ext", maxDigits: 4 }), node("v", "voicemail", { extension: "101" })], [
      edge("m", "v", "12"),
    ]);
    vi.mocked(ari.waitDtmfDigits).mockResolvedValue("12");
    await runLoop(node("m", "menu", { prompt: "Enter ext", maxDigits: 4 }), flow);
    expect(ari.waitDtmfDigits).toHaveBeenCalled();
    expect(ari.playCollectDtmf).not.toHaveBeenCalled();
  });

  it("treats a timeout as the 'timeout' handle", async () => {
    vi.mocked(ari.playCollectDtmf).mockResolvedValue("");
    const flow = flowOf([node("m", "menu", {}), node("v", "voicemail", { extension: "101" })], [
      edge("m", "v", "timeout"),
    ]);
    const { vars } = await runLoop(node("m", "menu", {}), flow);
    expect(vars.dtmf).toBe("timeout");
  });

  it("hangs up when no edge matches the collected digit", async () => {
    const flow = flowOf([node("m", "menu", {}), node("v", "voicemail", { extension: "101" })], [
      edge("m", "v", "9"),
    ]);
    const { result } = await runLoop(node("m", "menu", {}), flow);
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
    expect(result).toBe("left");
  });
});

describe("executeFlowLoop — api node", () => {
  it("maps a JSON response into flow variables on success", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ext: "101" }), { status: 200 }),
    );
    const flow = flowOf([
      node("a", "api", {
        url: "https://api.test/lookup",
        mappings: [{ path: "ext", var: "found" }],
      }),
      node("h", "hangup"),
    ]);
    const { vars } = await runLoop(
      node("a", "api", { url: "https://api.test/lookup", mappings: [{ path: "ext", var: "found" }] }),
      flow,
    );
    expect(vars.http_status).toBe("200");
    expect(vars.found).toBe("101");
    fetchSpy.mockRestore();
  });

  it("substitutes flow variables into the URL template", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const flow = flowOf([node("a", "api", { url: "https://api.test/x/{{caller}}" }), node("h", "hangup")]);
    await runLoop(node("a", "api", { url: "https://api.test/x/{{caller}}" }), flow, { caller: "101" });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://api.test/x/101");
    fetchSpy.mockRestore();
  });

  it("routes to the error edge on a non-2xx response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    const flow = flowOf([node("a", "api", { url: "https://api.test/x" }), node("v", "voicemail", { extension: "101" }), node("h", "hangup")], [
      edge("a", "v", "success"),
      edge("a", "h", "error"),
    ]);
    await runLoop(node("a", "api", { url: "https://api.test/x" }), flow);
    expect(ari.redirect).not.toHaveBeenCalled();
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
    fetchSpy.mockRestore();
  });

  it("routes to the error edge when fetch itself throws", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const flow = flowOf([node("a", "api", { url: "https://api.test/x" }), node("h", "hangup")], [
      edge("a", "h", "error"),
    ]);
    await runLoop(node("a", "api", { url: "https://api.test/x" }), flow);
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
    fetchSpy.mockRestore();
  });
});

describe("executeFlowLoop — directory node", () => {
  it("redirects to a matching extension and leaves the flow", async () => {
    dbState.rows = [{ id: "uuid-101", number: "101", name: "Alice" }];
    vi.mocked(ari.waitDtmfDigits).mockResolvedValue("101");
    const flow = flowOf([node("d", "directory")]);
    const { vars, result } = await runLoop(node("d", "directory"), flow);
    expect(vars.directory_ext).toBe("101");
    expect(ari.redirect).toHaveBeenCalledWith("ch-n", "101", "from-internal");
    expect(result).toBe("left");
  });

  it("sets the not_found edge when nothing matches", async () => {
    dbState.rows = [{ id: "uuid-101", number: "101", name: "Alice" }];
    vi.mocked(ari.waitDtmfDigits).mockResolvedValue("999");
    const flow = flowOf([node("d", "directory"), node("h", "hangup")], [edge("d", "h", "not_found")]);
    const { result } = await runLoop(node("d", "directory"), flow);
    expect(ari.redirect).not.toHaveBeenCalled();
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
    expect(result).toBe("left");
  });
});

describe("executeFlowLoop — subflow node", () => {
  it("runs the referenced flow and continues afterwards", async () => {
    const sub = flowOf([node("h", "hangup")]);
    vi.mocked(loadPublishedFlow).mockResolvedValue(sub as never);
    const flow = flowOf([node("s", "subflow", { flowId: "flow-2" }), node("v", "voicemail", { extension: "101" })], [
      edge("s", "v", "return"),
    ]);
    const { result } = await runLoop(node("s", "subflow", { flowId: "flow-2" }), flow);
    expect(loadPublishedFlow).toHaveBeenCalledWith("flow-2");
    expect(result).toBe("left");
    expect(ari.redirect).toHaveBeenCalledWith("ch-n", "*101", "monosip-voicemail");
  });

  it("continues when the referenced flow does not exist", async () => {
    vi.mocked(loadPublishedFlow).mockResolvedValue(null);
    const flow = flowOf([node("s", "subflow", { flowId: "missing" }), node("h", "hangup")], [
      edge("s", "h", "return"),
    ]);
    await runLoop(node("s", "subflow", { flowId: "missing" }), flow);
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
  });
});

describe("executeFlowLoop — transfer node", () => {
  it("dials an online extension through the dialplan", async () => {
    dbState.rows = [{ id: "uuid-102", number: "102" }];
    const transfer = node("t", "transfer", {
      destType: "extension",
      destId: "102",
      timeout: 25,
      language: "en",
      gender: "female",
    });
    const flow = flowOf([transfer]);
    const { result } = await runLoop(transfer, flow, {
      caller: "101",
      __ttsVoice: "ema-lightning",
      __ttsApplyAll: "0",
    });
    expect(ari.setChannelVar).toHaveBeenCalledWith("ch-n", "MONOSIP_DIAL_TARGET", "102");
    expect(ari.setChannelVar).toHaveBeenCalledWith("ch-n", "MONOSIP_DIAL_TIMEOUT", "25");
    expect(ari.setChannelVar).toHaveBeenCalledWith("ch-n", "MONOSIP_DIAL_MOH", "default");
    expect(ari.redirect).toHaveBeenCalledWith("ch-n", "s", "monosip-flow-dial");
    expect(ensureSpeechMedia).not.toHaveBeenCalled();
    expect(result).toBe("left");
  });

  it("refuses a transfer to the caller themselves", async () => {
    const flow = flowOf(
      [node("t", "transfer", { destType: "extension", destId: "101" }), node("m", "menu", {})],
      [edge("t", "m", "chanunavail")],
    );
    await runLoop(node("t", "transfer", { destType: "extension", destId: "101" }), flow, { caller: "101" });
    // The contract is "never self-dial": no dial redirect and no dial target are
    // set. The call is not hung up here — the chanunavail edge continues into
    // the menu, which is free to end the call afterwards.
    expect(ari.redirect).not.toHaveBeenCalledWith("ch-n", "s", "monosip-flow-dial");
    expect(ari.setChannelVar).not.toHaveBeenCalledWith("ch-n", "MONOSIP_DIAL_TARGET", "101");
  });

  it("reports chanunavail when the target extension is offline", async () => {
    vi.mocked(ari.endpointState).mockResolvedValue({ online: false, busy: false });
    const flow = flowOf(
      [node("t", "transfer", { destType: "extension", destId: "102" }), node("v", "voicemail", { extension: "101" })],
      [edge("t", "v", "chanunavail")],
    );
    await runLoop(node("t", "transfer", { destType: "extension", destId: "102" }), flow, { caller: "101" });
    expect(ari.redirect).toHaveBeenCalledWith("ch-n", "*101", "monosip-voicemail");
    expect(ari.setChannelVar).not.toHaveBeenCalledWith("ch-n", "MONOSIP_DIAL_TARGET", "102");
  });

  it("takes the busy exit without dialing when the extension is already on a call", async () => {
    vi.mocked(ari.endpointState).mockResolvedValue({ online: true, busy: true });
    const flow = flowOf(
      [
        node("t", "transfer", { destType: "extension", destId: "102" }),
        node("h", "hangup"),
        node("v", "voicemail", { extension: "102" }),
      ],
      [edge("t", "v", "noanswer"), edge("t", "h", "busy")],
    );
    const { result } = await runLoop(node("t", "transfer", { destType: "extension", destId: "102" }), flow, {
      caller: "101",
    });
    expect(ari.setChannelVar).not.toHaveBeenCalledWith("ch-n", "MONOSIP_DIAL_TARGET", "102");
    expect(ari.redirect).not.toHaveBeenCalled();
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
    expect(result).toBe("left");
  });

  it("never follows another exit's edge when the matching exit is missing", async () => {
    vi.mocked(ari.endpointState).mockResolvedValue({ online: false, busy: false });
    const flow = flowOf(
      [node("t", "transfer", { destType: "extension", destId: "102" }), node("v", "voicemail", { extension: "102" })],
      [edge("t", "v", "noanswer")],
    );
    await runLoop(node("t", "transfer", { destType: "extension", destId: "102" }), flow, { caller: "101" });
    expect(ari.redirect).not.toHaveBeenCalledWith("ch-n", "*102", "monosip-voicemail");
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
  });

  it("hangs up when the transfer has no destination", async () => {
    const flow = flowOf([node("t", "transfer", { destType: "extension", destId: "" })]);
    const { result } = await runLoop(node("t", "transfer", { destType: "extension", destId: "" }), flow);
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
    expect(result).toBe("left");
  });

  it("resolves a non-extension destination instead of dialling", async () => {
    vi.mocked(resolveDestination).mockResolvedValue({ kind: "voicemail", extension: "101" } as never);
    const flow = flowOf([node("t", "transfer", { destType: "voicemail", destId: "101" })]);
    await runLoop(node("t", "transfer", { destType: "voicemail", destId: "101" }), flow);
    expect(ari.redirect).toHaveBeenCalledWith("ch-n", "*101", "from-internal");
  });
});

describe("handleOutbound", () => {
  it("blocks a blacklisted number with BUSY", async () => {
    vi.mocked(isBlacklisted).mockResolvedValue(true);
    await handleOutbound("ch-o", "900123", "101");
    expect(cdrEnd).toHaveBeenCalledWith("ch-o", "BUSY");
    expect(ari.hangup).toHaveBeenCalledWith("ch-o");
  });

  it("bypasses the policy check for an emergency number", async () => {
    vi.mocked(isEmergencyNumber).mockReturnValue(true);
    await handleOutbound("ch-o", "112", "101");
    expect(checkExtensionOutbound).not.toHaveBeenCalled();
    expect(ari.hangup).not.toHaveBeenCalled();
  });

  it("blocks when the outbound policy denies the call", async () => {
    vi.mocked(checkExtensionOutbound).mockResolvedValue({ ok: false, reason: "outbound-blocked" } as never);
    await handleOutbound("ch-o", "05321112233", "101");
    expect(cdrEnd).toHaveBeenCalledWith("ch-o", "FAILED");
    expect(ari.hangup).toHaveBeenCalledWith("ch-o");
  });

  it("redirects a short internal extension without resolving a route", async () => {
    dbState.tables.extensions = [{ id: "ext-102", number: "102" }];
    await handleOutbound("ch-o", "102", "101");
    expect(cdrAnswered).toHaveBeenCalledWith("ch-o");
    expect(ari.redirect).toHaveBeenCalledWith("ch-o", "102", "from-internal");
    expect(resolveOutboundDial).not.toHaveBeenCalled();
  });

  it("hangs up an unknown short number instead of sending it back to the dialplan", async () => {
    await handleOutbound("ch-o", "900", "130");
    expect(ari.redirect).not.toHaveBeenCalled();
    expect(cdrAnswered).not.toHaveBeenCalled();
    expect(cdrEnd).toHaveBeenCalledWith("ch-o", "FAILED");
    expect(ari.playAndWait).toHaveBeenCalledWith("ch-o", "sound:ss-noservice", 4000);
    expect(ari.hangup).toHaveBeenCalledWith("ch-o");
  });

  it("fails the call when no route matches", async () => {
    vi.mocked(resolveOutboundDial).mockResolvedValue(null as never);
    await handleOutbound("ch-o", "05321112233", "101");
    expect(cdrEnd).toHaveBeenCalledWith("ch-o", "FAILED");
    expect(ari.hangup).toHaveBeenCalledWith("ch-o");
  });

  it("sets the per-extension caller ID and dials the resolved trunk", async () => {
    dbState.rows = [{ id: "uuid-101", number: "101", name: "Alice", outboundCli: "03120000000" }];
    await handleOutbound("ch-o", "05321112233", "101");
    expect(ari.setChannelVar).toHaveBeenCalledWith("ch-o", "CALLERID(num)", "03120000000");
    expect(ari.setChannelVar).toHaveBeenCalledWith("ch-o", "CALLERID(name)", "Alice");
    expect(ari.redirect).toHaveBeenCalledWith(
      "ch-o",
      "trunk_abcdef12_05321112233",
      "monosip-trunk-dial",
    );
    expect(cdrStart).toHaveBeenCalled();
  });

  it("hands remaining route trunks to the dialplan for provider failover", async () => {
    vi.mocked(resolveOutboundDial).mockResolvedValue({
      trunkEndpoint: "trunk_abcdef12",
      dialNumber: "05321112233",
      routeId: "route-1",
      fallbackEndpoints: ["trunk_22222222", "trunk_33333333"],
    });
    await handleOutbound("ch-o", "05321112233", "101");
    expect(ari.setChannelVar).toHaveBeenCalledWith(
      "ch-o",
      "MONOSIP_TRUNK_FALLBACK",
      "trunk_22222222&trunk_33333333",
    );
  });

  it("sets no failover list when the route has a single trunk", async () => {
    await handleOutbound("ch-o", "05321112233", "101");
    expect(ari.setChannelVar).not.toHaveBeenCalledWith("ch-o", "MONOSIP_TRUNK_FALLBACK", expect.anything());
  });
});

describe("stasisStart — monosip-inbound branches", () => {
  beforeEach(() => attachFlowRuntime());

  /** An inbound Stasis event; `callerArg` overrides the channel caller. */
  const inbound = (callerArg?: string, channelCaller = "1000") =>
    stasis({
      application: "monosip-inbound",
      channel: { id: "ch-in", caller: { number: channelCaller } },
      args: callerArg === undefined ? ["1000"] : ["1000", callerArg],
    });

  it("blocks an anonymous caller when the policy is enabled", async () => {
    dbState.tables["settings"] = [{ data: { blockAnonymousInbound: true } }];
    vi.mocked(loadSettings).mockReturnValue({ blockAnonymousInbound: true } as never);
    vi.mocked(isAnonymousCaller).mockReturnValue(true);

    await inbound();

    expect(cdrEnd).toHaveBeenCalledWith("ch-in", "BUSY");
    expect(ari.hangup).toHaveBeenCalledWith("ch-in");
    // The call never reaches normal routing.
    expect(resolveInbound).not.toHaveBeenCalled();
  });

  it("lets the call through when the caller is not anonymous", async () => {
    dbState.tables["settings"] = [{ data: { blockAnonymousInbound: true } }];
    vi.mocked(loadSettings).mockReturnValue({ blockAnonymousInbound: true } as never);
    vi.mocked(isAnonymousCaller).mockReturnValue(false);

    await inbound();

    // Not blocked: the call reaches routing. It may still end afterwards if the
    // route resolves to hangup, so assert the BUSY signature is ABSENT.
    expect(cdrEnd).not.toHaveBeenCalledWith("ch-in", "BUSY");
    expect(resolveInbound).toHaveBeenCalled();
  });

  it("lets an anonymous caller through when the policy is off", async () => {
    dbState.tables["settings"] = [{ data: {} }];
    vi.mocked(loadSettings).mockReturnValue({} as never);
    vi.mocked(isAnonymousCaller).mockReturnValue(true);

    await inbound();

    expect(cdrEnd).not.toHaveBeenCalledWith("ch-in", "BUSY");
    expect(resolveInbound).toHaveBeenCalled();
  });

  it("redirects a return-to-caller from a pending missed call", async () => {
    dbState.tables["missed_calls"] = [
      { number: "1000", target: "101", status: "pending", at: new Date() },
    ];

    await inbound();

    // The pending row is marked returned and the caller is sent to it.
    expect(dbState.updates).toContainEqual({ status: "returned" });
    expect(ari.redirect).toHaveBeenCalledWith("ch-in", "101", "from-internal");
    // Return-to-caller short-circuits normal routing.
    expect(resolveInbound).not.toHaveBeenCalled();
  });

  it("falls back to the last outbound dial when nothing is pending", async () => {
    dbState.tables["missed_calls"] = [];
    dbState.tables["last_dial_attempts"] = [
      { number: "1000", extensionNumber: "102", at: new Date() },
    ];

    await inbound();

    expect(ari.redirect).toHaveBeenCalledWith("ch-in", "102", "from-internal");
    expect(resolveInbound).not.toHaveBeenCalled();
  });

  it("prefers the pending missed call over the last dial attempt", async () => {
    dbState.tables["missed_calls"] = [
      { number: "1000", target: "101", status: "pending", at: new Date() },
    ];
    dbState.tables["last_dial_attempts"] = [
      { number: "1000", extensionNumber: "102", at: new Date() },
    ];

    await inbound();

    expect(ari.redirect).toHaveBeenCalledWith("ch-in", "101", "from-internal");
  });

  it("does not return-caller onto a qcb: callback target", async () => {
    dbState.tables["missed_calls"] = [
      { number: "1000", target: "qcb:100", status: "pending", at: new Date() },
    ];

    await inbound();

    // qcb: rows are callback placeholders, never a dial-back target.
    expect(ari.redirect).not.toHaveBeenCalled();
    expect(resolveInbound).toHaveBeenCalled();
  });

  it("ignores a pending target that is not an extension number", async () => {
    dbState.tables["missed_calls"] = [
      { number: "1000", target: "not-a-number", status: "pending", at: new Date() },
    ];
    dbState.tables["last_dial_attempts"] = [];

    await inbound();

    expect(ari.redirect).not.toHaveBeenCalled();
    expect(resolveInbound).toHaveBeenCalled();
  });

  it("routes normally when the caller has no history at all", async () => {
    dbState.tables["missed_calls"] = [];
    dbState.tables["last_dial_attempts"] = [];

    await inbound();

    expect(ari.redirect).not.toHaveBeenCalled();
    expect(resolveInbound).toHaveBeenCalledWith("1000", "1000");
  });

  it("uses the explicit caller argument over the channel caller", async () => {
    dbState.tables["missed_calls"] = [
      { number: "2000", target: "101", status: "pending", at: new Date() },
    ];

    await inbound("2000");

    expect(ari.redirect).toHaveBeenCalledWith("ch-in", "101", "from-internal");
  });
});

describe("runFlowOnChannel — KVKK announcement", () => {
  const FLOW = () => flowOf([node("s", "start"), node("h", "hangup")], [edge("s", "h")]);
  const toExtension = { kind: "extension", number: "102" } as const;

  it("stays silent through the menu and speaks just before a person is rung", async () => {
    dbState.tables["settings"] = [
      { data: { kvkkAnnouncementEnabled: true, kvkkPromptId: "11111111-1111-1111-1111-111111111111" } },
    ];
    dbState.tables["prompts"] = [{ id: "11111111-1111-1111-1111-111111111111", filePath: "/p.wav" }];
    const running = runFlowOnChannel("ch-k", FLOW() as never, { caller: "101" });
    await vi.advanceTimersByTimeAsync(MEDIA_SETTLE_MS + 100);
    await running;
    const duringMenu = vi.mocked(ari.playAndWait).mock.calls.map((c) => String(c[1]));
    expect(duringMenu.every((m) => m.startsWith("sound:monosip/silence-"))).toBe(true);

    await applyResolved("ch-k", toExtension as never, { caller: "101" });
    expect(ari.playAndWait).toHaveBeenCalledWith("ch-k", "sound:monosip/p1", 60_000);
    expect(ari.redirect).toHaveBeenCalledWith("ch-k", "102", "from-internal");
  });

  it("plays nothing when the announcement is disabled", async () => {
    dbState.tables["settings"] = [{ data: { kvkkAnnouncementEnabled: false } }];
    await applyResolved("ch-k", toExtension as never, { caller: "101" });
    const media = vi.mocked(ari.playAndWait).mock.calls.map((c) => String(c[1]));
    expect(media.every((m) => m.startsWith("sound:monosip/silence-"))).toBe(true);
    expect(ari.redirect).toHaveBeenCalledWith("ch-k", "102", "from-internal");
  });

  it("falls back to live TTS when no prompt is configured", async () => {
    dbState.tables["settings"] = [{ data: { kvkkAnnouncementEnabled: true } }];
    await applyResolved("ch-k", toExtension as never, { caller: "101" });
    expect(ensureSpeechMedia).toHaveBeenCalledWith(
      "Aramanız kalite standartları gereği kayıt altına alınmaktadır.",
      "tr",
      1.05,
      "female",
    );
    expect(ari.playAndWait).toHaveBeenCalledWith("ch-k", "sound:monosip/cached", 60_000);
  });

  it("speaks the Turkish notice when the flow language is tr", async () => {
    dbState.tables["settings"] = [{ data: { kvkkAnnouncementEnabled: true } }];
    await applyResolved("ch-k", toExtension as never, { caller: "101", language: "tr" });
    expect(ensureSpeechMedia).toHaveBeenCalledWith(
      "Aramanız kalite standartları gereği kayıt altına alınmaktadır.",
      "tr",
      1.05,
      "female",
    );
    expect(ari.setChannelVar).toHaveBeenCalledWith("ch-k", "KVKK_DONE", "1");
  });

  it("does not repeat the notice for voicemail", async () => {
    dbState.tables["settings"] = [{ data: { kvkkAnnouncementEnabled: true } }];
    await applyResolved("ch-k", { kind: "voicemail", extension: "101" } as never, { caller: "101" });
    expect(ensureSpeechMedia).not.toHaveBeenCalled();
    expect(ari.redirect).toHaveBeenCalledWith("ch-k", "*101", "from-internal");
  });

  it("falls back to TTS when the configured prompt has no media", async () => {
    dbState.tables["settings"] = [
      { data: { kvkkAnnouncementEnabled: true, kvkkPromptId: "11111111-1111-1111-1111-111111111111" } },
    ];
    dbState.tables["prompts"] = [{ id: "11111111-1111-1111-1111-111111111111", filePath: null }];
    vi.mocked(promptMediaUri).mockReturnValueOnce(null as never);
    await applyResolved("ch-k", toExtension as never, { caller: "101" });
    expect(ensureSpeechMedia).toHaveBeenCalled();
  });
});

describe("runFlowOnChannel — recording permission gate", () => {
  const QUEUE_FLOW = () =>
    flowOf([node("s", "start"), node("q", "queue", { queueNumber: "100" })], [edge("s", "q")]);

  beforeEach(() => {
    vi.mocked(resolveDestination).mockResolvedValue({ kind: "queue", number: "100" } as never);
    vi.mocked(ari.record).mockResolvedValue("MixMonitor/rec-1");
  });

  it("starts MixMonitor for a normal extension", async () => {
    dbState.tables["settings"] = [{ data: { kvkkAnnouncementEnabled: false } }];
    dbState.tables["extensions"] = [{ number: "101", recordingMode: "always", callPermissions: {} }];
    const running = runFlowOnChannel("ch-r", QUEUE_FLOW() as never, { caller: "101" });
    await vi.advanceTimersByTimeAsync(MEDIA_SETTLE_MS + 100);
    await running;
    expect(ari.record).toHaveBeenCalledWith("ch-r", "rec-chr");
  });

  it("honours recordingMode 'off'", async () => {
    dbState.tables["settings"] = [{ data: { kvkkAnnouncementEnabled: false } }];
    dbState.tables["extensions"] = [{ number: "101", recordingMode: "off", callPermissions: {} }];
    const running = runFlowOnChannel("ch-r", QUEUE_FLOW() as never, { caller: "101" });
    await vi.advanceTimersByTimeAsync(MEDIA_SETTLE_MS + 100);
    await running;
    expect(ari.record).not.toHaveBeenCalled();
  });

  it("honours an explicit callPermissions.recording = false", async () => {
    dbState.tables["settings"] = [{ data: { kvkkAnnouncementEnabled: false } }];
    dbState.tables["extensions"] = [
      { number: "101", recordingMode: "always", callPermissions: { recording: false } },
    ];
    const running = runFlowOnChannel("ch-r", QUEUE_FLOW() as never, { caller: "101" });
    await vi.advanceTimersByTimeAsync(MEDIA_SETTLE_MS + 100);
    await running;
    expect(ari.record).not.toHaveBeenCalled();
  });

  it("records when the caller is not a known extension", async () => {
    dbState.tables["settings"] = [{ data: { kvkkAnnouncementEnabled: false } }];
    dbState.tables["extensions"] = [];
    const running = runFlowOnChannel("ch-r", QUEUE_FLOW() as never, { caller: "999" });
    await vi.advanceTimersByTimeAsync(MEDIA_SETTLE_MS + 100);
    await running;
    expect(ari.record).toHaveBeenCalled();
  });
});

describe("executeFlowLoop — api secret injection and retry", () => {
  it.each([
    ["bearer", undefined, "Authorization", "Bearer tok-123"],
    ["basic", undefined, "Authorization", "Basic tok-123"],
    ["header", "X-Api-Key", "X-Api-Key", "tok-123"],
  ])("injects a decrypted secret as %s auth", async (authType, authHeader, header, expected) => {
    dbState.tables["secrets"] = [{ id: "sec-1", valueEnc: "ENC" }];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const data = { url: "https://api.test/x", secretId: "sec-1", authType, ...(authHeader ? { authHeader } : {}) };
    const flow = flowOf([node("a", "api", data), node("h", "hangup")]);
    await runLoop(node("a", "api", data), flow);
    expect(decrypt).toHaveBeenCalledWith("ENC");
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ [header]: expected });
    fetchSpy.mockRestore();
  });

  it("skips secret lookup when authType is none", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const data = { url: "https://api.test/x", secretId: "sec-1", authType: "none" };
    const flow = flowOf([node("a", "api", data), node("h", "hangup")]);
    await runLoop(node("a", "api", data), flow);
    expect(decrypt).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("retries a non-2xx response once and succeeds", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("no", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ v: "7" }), { status: 200 }));
    const data = { url: "https://api.test/x", retry: 1, mappings: [{ path: "v", var: "out" }] };
    const flow = flowOf([node("a", "api", data), node("h", "hangup")]);
    const { vars } = await runLoopTimed(node("a", "api", data), flow);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(vars.out).toBe("7");
    expect(vars.http_status).toBe("200");
    fetchSpy.mockRestore();
  });

  it("retries once after a thrown fetch and succeeds", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const data = { url: "https://api.test/x", retry: 1 };
    const flow = flowOf([node("a", "api", data), node("h", "hangup")]);
    await runLoopTimed(node("a", "api", data), flow);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it("does not retry when retry is not set", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("no", { status: 500 }));
    const data = { url: "https://api.test/x" };
    const flow = flowOf([node("a", "api", data), node("h", "hangup")], [edge("a", "h", "error")]);
    await runLoop(node("a", "api", data), flow);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it("stops after a retry also fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    const data = { url: "https://api.test/x", retry: 1 };
    const flow = flowOf([node("a", "api", data), node("v", "voicemail", { extension: "101" }), node("h", "hangup")], [
      edge("a", "v", "success"),
      edge("a", "h", "error"),
    ]);
    await runLoopTimed(node("a", "api", data), flow);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
    fetchSpy.mockRestore();
  });
});

describe("stasisStart — handler error tail", () => {
  beforeEach(() => attachFlowRuntime());

  it("ends the CDR as FAILED and hangs up when routing throws", async () => {
    vi.mocked(resolveInbound).mockRejectedValue(new Error("routing exploded"));
    await stasis({
      application: "monosip-inbound",
      channel: { id: "ch-err" },
      args: ["1000"],
    });
    expect(cdrEnd).toHaveBeenCalledWith("ch-err", "FAILED");
    expect(ari.hangup).toHaveBeenCalledWith("ch-err");
  });

  it("still hangs up when the CDR finalizer itself throws", async () => {
    vi.mocked(resolveInbound).mockRejectedValue(new Error("boom"));
    vi.mocked(cdrEnd).mockRejectedValueOnce(new Error("db gone"));
    await stasis({
      application: "monosip-inbound",
      channel: { id: "ch-err2" },
      args: ["1000"],
    });
    expect(ari.hangup).toHaveBeenCalledWith("ch-err2");
  });
});

describe("executeFlowLoop — api hold-while-requesting", () => {
  it("plays a configured wait prompt and stops it afterwards", async () => {
    dbState.tables["prompts"] = [{ id: "p1", filePath: "/w.wav" }];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const data = { url: "https://api.test/x", waitPromptId: "p1" };
    const flow = flowOf([node("a", "api", data), node("h", "hangup")]);
    await runLoop(node("a", "api", data), flow);
    expect(ari.play).toHaveBeenCalledWith("ch-n", "sound:monosip/p1");
    expect(ari.stopPlayback).toHaveBeenCalledWith("pb-1");
    fetchSpy.mockRestore();
  });

  it("prefixes a bare waitMedia name with sound:", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const data = { url: "https://api.test/x", waitMedia: "hold-music" };
    const flow = flowOf([node("a", "api", data), node("h", "hangup")]);
    await runLoop(node("a", "api", data), flow);
    expect(ari.play).toHaveBeenCalledWith("ch-n", "sound:hold-music");
    fetchSpy.mockRestore();
  });

  it("passes an already-qualified sound: URI through unchanged", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const data = { url: "https://api.test/x", waitMedia: "sound:custom" };
    const flow = flowOf([node("a", "api", data), node("h", "hangup")]);
    await runLoop(node("a", "api", data), flow);
    expect(ari.play).toHaveBeenCalledWith("ch-n", "sound:custom");
    fetchSpy.mockRestore();
  });

  it("sets the musicclass channel var for a waitMoh class", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const data = { url: "https://api.test/x", waitMoh: "onhold" };
    const flow = flowOf([node("a", "api", data), node("h", "hangup")]);
    await runLoop(node("a", "api", data), flow);
    expect(ari.setChannelVar).toHaveBeenCalledWith("ch-n", "CHANNEL(musicclass)", "onhold");
    expect(ari.play).toHaveBeenCalledWith("ch-n", "sound:beep");
    fetchSpy.mockRestore();
  });

  it("stops playback even when the request fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    const data = { url: "https://api.test/x", waitMedia: "hold" };
    const flow = flowOf([node("a", "api", data), node("h", "hangup")], [edge("a", "h", "error")]);
    await runLoop(node("a", "api", data), flow);
    expect(ari.stopPlayback).toHaveBeenCalledWith("pb-1");
    fetchSpy.mockRestore();
  });
});

describe("executeFlowLoop — menu retry and exit digits", () => {
  it("takes an exit digit immediately without retrying", async () => {
    vi.mocked(ari.playCollectDtmf).mockResolvedValue("9");
    const flow = flowOf([node("m", "menu", { retries: 2 }), node("h", "hangup")], [edge("m", "h", "9")]);
    const { vars } = await runLoop(node("m", "menu", { retries: 2 }), flow);
    // 9 has a matching edge, so it is accepted on the first attempt.
    expect(vars.dtmf).toBe("9");
    expect(ari.playCollectDtmf).toHaveBeenCalledTimes(1);
  });

  it("retries after a wrong digit and accepts the second entry", async () => {
    vi.mocked(ari.playCollectDtmf)
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce("2");
    const flow = flowOf(
      [node("m", "menu", { retries: 2 }), node("v", "voicemail", { extension: "101" })],
      [edge("m", "v", "2")],
    );
    const { vars } = await runLoop(node("m", "menu", { retries: 2 }), flow);
    expect(ari.playCollectDtmf).toHaveBeenCalledTimes(2);
    expect(vars.dtmf).toBe("2");
    expect(ari.redirect).toHaveBeenCalledWith("ch-n", "*101", "monosip-voicemail");
  });

  it("resolves to 'invalid' when retries run out and an invalid edge exists", async () => {
    vi.mocked(ari.playCollectDtmf).mockResolvedValue("1");
    const flow = flowOf(
      [node("m", "menu", { retries: 0 }), node("v", "voicemail", { extension: "101" })],
      [edge("m", "v", "invalid")],
    );
    const { vars } = await runLoop(node("m", "menu", { retries: 0 }), flow);
    expect(vars.dtmf).toBe("invalid");
    expect(ari.redirect).toHaveBeenCalledWith("ch-n", "*101", "monosip-voicemail");
  });

  it("resolves to 'timeout' when retries run out with no invalid edge", async () => {
    vi.mocked(ari.playCollectDtmf).mockResolvedValue("1");
    const flow = flowOf(
      [node("m", "menu", { retries: 0 }), node("h", "hangup")],
      [edge("m", "h", "timeout")],
    );
    const { vars } = await runLoop(node("m", "menu", { retries: 0 }), flow);
    expect(vars.dtmf).toBe("timeout");
  });

  it("falls back to waitDtmf when the prompt itself fails", async () => {
    vi.mocked(ensureSpeechMedia).mockRejectedValueOnce(new Error("tts down"));
    vi.mocked(ari.waitDtmf).mockResolvedValue("5");
    const flow = flowOf([node("m", "menu", {}), node("h", "hangup")], [edge("m", "h", "5")]);
    const { vars } = await runLoop(node("m", "menu", {}), flow);
    expect(ari.waitDtmf).toHaveBeenCalled();
    expect(vars.dtmf).toBe("5");
  });

  it("uses waitDtmfDigits for the multi-digit prompt-failure fallback", async () => {
    vi.mocked(ensureSpeechMedia).mockRejectedValueOnce(new Error("tts down"));
    vi.mocked(ari.waitDtmfDigits).mockResolvedValue("77");
    const flow = flowOf([node("m", "menu", { maxDigits: 3 }), node("h", "hangup")], [
      edge("m", "h", "77"),
    ]);
    const { vars } = await runLoop(node("m", "menu", { maxDigits: 3 }), flow);
    expect(vars.dtmf).toBe("77");
  });
});

describe("channelDestroyed", () => {
  beforeEach(() => attachFlowRuntime());

  it("finalizes an open CDR when the channel dies", async () => {
    vi.mocked(cdrIsOpen).mockReturnValue(true);
    handlers.get("channelDestroyed")!("ch-200");
    await vi.advanceTimersByTimeAsync(10);
    expect(cdrEnd).toHaveBeenCalledWith("ch-200");
  });

  it("does not finalize a CDR that was never opened", async () => {
    vi.mocked(cdrIsOpen).mockReturnValue(false);
    handlers.get("channelDestroyed")!("ch-201");
    await vi.advanceTimersByTimeAsync(10);
    expect(cdrEnd).not.toHaveBeenCalled();
  });

  it("swallows an error from the CDR finalizer", async () => {
    vi.mocked(cdrIsOpen).mockImplementation(() => {
      throw new Error("db gone");
    });
    expect(() => {
      handlers.get("channelDestroyed")!("ch-202");
      void vi.advanceTimersByTimeAsync(10);
    }).not.toThrow();
  });
});
describe("executeFlowLoop — returning to a menu", () => {
  it("runs the same branch twice in one call (menu → 1 → … → menu → 1 again)", async () => {
    vi.mocked(ari.playCollectDtmf)
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce(null as never);
    vi.mocked(ari.waitDtmf).mockResolvedValue(null as never);
    const menu = node("m", "menu", { digits: ["1"], retries: 0, timeoutMs: 10 });
    const flow = flowOf(
      [menu, node("v", "set_var", { name: "x", value: "{{x}}+" }), node("a", "announce", { text: "info" }), node("h", "hangup")],
      [edge("m", "v", "1"), edge("v", "a", "next"), edge("a", "m", "next"), edge("m", "h", "timeout"), edge("m", "h", "invalid")],
    );
    const { vars } = await runLoop(menu, flow, { x: "" });
    // set_var ran on both passes — a stale `visited` used to stop the second one
    expect(vars.x).toBe("++");
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
  });

  it("re-enters a menu reached again through an edge (back to main menu)", async () => {
    // menu → 1 → announce → back to menu → (timeout) → hangup
    vi.mocked(ari.playCollectDtmf).mockResolvedValueOnce("1").mockResolvedValueOnce(null as never);
    vi.mocked(ari.waitDtmf).mockResolvedValue(null as never);
    vi.mocked(ari.waitDtmfDigits).mockResolvedValue(null as never);
    const flow = flowOf(
      [node("m", "menu", { digits: ["1"], retries: 0, timeoutMs: 10 }), node("a", "announce", { text: "info" }), node("h", "hangup")],
      [edge("m", "a", "1"), edge("a", "m", "next"), edge("m", "h", "timeout"), edge("m", "h", "invalid")],
    );
    await runLoop(node("m", "menu", { digits: ["1"], retries: 0, timeoutMs: 10 }), flow);
    const nodeEvents = dbState.updates.length; // keep lint quiet if unused
    void nodeEvents;
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
    // the menu prompt ran twice: initial entry + after "back to menu"
    const menuPlays = vi.mocked(ari.playCollectDtmf).mock.calls.length + vi.mocked(ari.playAndWait).mock.calls.length;
    expect(menuPlays).toBeGreaterThanOrEqual(2);
  });
});


describe("executeFlowLoop — wait node", () => {
  it("plays silence for the configured seconds (RTP keeps flowing), then continues on next", async () => {
    const w = node("w", "wait", { seconds: 3 });
    const flow = flowOf([w, node("h", "hangup")], [edge("w", "h", "next")]);
    await runLoop(w, flow);
    const media = vi.mocked(ari.playAndWait).mock.calls.map((c) => String(c[1]));
    // 3 × 1 s for the wait, then the 800 ms tail before the hangup node
    expect(media).toEqual(["sound:monosip/silence-1000", "sound:monosip/silence-1000", "sound:monosip/silence-1000", "sound:monosip/silence-800"]);
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
    expect(ari.startMoh).not.toHaveBeenCalled();
  });

  it("falls back to sleeping when silence cannot be played", async () => {
    vi.mocked(ari.playAndWait).mockResolvedValue(false as never);
    const w = node("w", "wait", { seconds: 3 });
    const flow = flowOf([w, node("h", "hangup")], [edge("w", "h", "next")]);
    const running = runLoop(w, flow);
    await vi.advanceTimersByTimeAsync(2900);
    expect(ari.hangup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    await running;
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
    vi.mocked(ari.playAndWait).mockResolvedValue(undefined as never);
  });

  it("plays hold music while waiting when a class is chosen", async () => {
    const w = node("w", "wait", { seconds: 2, moh: "default" });
    const flow = flowOf([w, node("h", "hangup")], [edge("w", "h", "next")]);
    const running = runLoop(w, flow);
    await vi.advanceTimersByTimeAsync(2100);
    await running;
    expect(ari.startMoh).toHaveBeenCalledWith("ch-n", undefined);
    expect(ari.stopMoh).toHaveBeenCalledWith("ch-n");
  });

  it("caps very long waits", async () => {
    const w = node("w", "wait", { seconds: 99999 });
    const flow = flowOf([w, node("h", "hangup")], [edge("w", "h", "next")]);
    const running = runLoop(w, flow);
    await vi.advanceTimersByTimeAsync(600_000 + 100);
    await running;
    expect(ari.hangup).toHaveBeenCalledWith("ch-n");
  });
});
