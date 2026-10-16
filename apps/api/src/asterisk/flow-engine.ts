import type { FlowJson } from "@dsip/shared";
import {
  compare,
  conditionLeft,
  jsonPath,
  nextNode,
  resolveMenuDigit,
} from "./flow-logic.js";

export type SimInput = {
  caller: string;
  did: string;
  time?: string;
  dtmfSequence?: string[];
  mockApiResponses?: Record<string, unknown>;
};

export type SimStep = {
  nodeId: string;
  type: string;
  variables: Record<string, unknown>;
  message: string;
};

/** Required sourceHandle values per node type (plan: publish validation). */
const REQUIRED_EXITS: Record<string, string[]> = {
  api: ["success", "error"],
  condition: ["true", "false"],
  time_condition: ["open", "lunch", "closed", "holiday"],
  directory: ["found", "not_found"],
  transfer: ["noanswer", "busy", "chanunavail"],
  menu: ["timeout"],
};

function edgeMatchesHandle(
  e: FlowJson["edges"][number],
  handle: string,
): boolean {
  return e.sourceHandle === handle || e.label === handle;
}

export function validateFlow(flow: FlowJson): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(flow.nodes.map((n) => n.id));
  const start = flow.nodes.find((n) => n.type === "start");
  if (!start) errors.push("Missing start node");

  for (const edge of flow.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      errors.push(`Edge ${edge.id} references missing node`);
    }
  }

  for (const node of flow.nodes) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const outs = flow.edges.filter((e) => e.source === node.id);

    // Terminal nodes need no exits
    if (node.type === "hangup" || node.type === "voicemail") continue;

    // Queue leaves Stasis — overflow is dialplan-owned
    if (node.type === "queue") {
      if (!data.queueNumber && !data.queueId) {
        errors.push(`Queue node ${node.id} missing queueNumber`);
      }
      continue;
    }

    if (node.type !== "start" && outs.length === 0) {
      errors.push(`Node ${node.id} (${node.type}) has no exits`);
    }

    let required: string[] | undefined = REQUIRED_EXITS[node.type];
    if (node.type === "transfer" && String(data.destType ?? "extension") !== "extension") {
      required = undefined;
    }
    if (required) {
      for (const h of required) {
        if (!outs.some((e) => edgeMatchesHandle(e, h))) {
          errors.push(`Node ${node.id} (${node.type}) missing "${h}" exit`);
        }
      }
    }

    if (node.type === "menu") {
      const digitExits = outs.filter(
        (e) => e.sourceHandle && !["timeout", "invalid", "next"].includes(String(e.sourceHandle)),
      );
      if (digitExits.length === 0) {
        errors.push(`Menu node ${node.id} has no digit exits`);
      }
      const maxDigits = Number(data.maxDigits ?? 1);
      if (Number.isFinite(maxDigits) && (maxDigits < 1 || maxDigits > 12)) {
        errors.push(`Menu node ${node.id} maxDigits must be 1–12`);
      }
    }

    if (node.type === "condition") {
      const op = String(data.op ?? "=");
      const known = new Set([
        "=",
        "!=",
        ">",
        "<",
        ">=",
        "<=",
        "contains",
        "starts_with",
        "ends_with",
        "empty",
        "regex",
        "area_code",
        "country_code",
      ]);
      if (!known.has(op)) {
        errors.push(`Condition node ${node.id} unknown op "${op}"`);
      }
    }

    if (node.type === "subflow") {
      if (!outs.some((e) => edgeMatchesHandle(e, "return") || !e.sourceHandle)) {
        errors.push(`Subflow node ${node.id} missing "return" exit`);
      }
      if (!data.flowId) errors.push(`Subflow node ${node.id} missing flowId`);
    }

    if (node.type === "transfer") {
      if (!data.destType) errors.push(`Transfer node ${node.id} missing destType`);
      if (data.destType && data.destType !== "hangup" && !data.destId) {
        errors.push(`Transfer node ${node.id} missing destId`);
      }
    }

    if (node.type === "api") {
      if (!data.url) errors.push(`API node ${node.id} missing url`);
    }

    if (node.type === "time_condition" && !data.scheduleId) {
      errors.push(`Time condition node ${node.id} missing scheduleId`);
    }
  }

  // Reachability from start
  if (start) {
    const reachable = new Set<string>();
    const stack = [start.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const e of flow.edges.filter((x) => x.source === id)) {
        stack.push(e.target);
      }
    }
    for (const n of flow.nodes) {
      if (!reachable.has(n.id)) errors.push(`Unreachable node ${n.id}`);
    }

    const terminals = new Set(
      flow.nodes
        .filter((n) => ["hangup", "voicemail", "transfer", "queue"].includes(n.type))
        .map((n) => n.id),
    );
    const canReachTerminal = (from: string): boolean => {
      const seen = new Set<string>();
      const st = [from];
      while (st.length) {
        const id = st.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        if (terminals.has(id)) return true;
        for (const e of flow.edges.filter((x) => x.source === id)) st.push(e.target);
      }
      return false;
    };
    for (const n of flow.nodes) {
      if (["hangup", "voicemail", "start", "queue"].includes(n.type)) continue;
      const outs = flow.edges.filter((e) => e.source === n.id);
      const selfLoopOnly = outs.length > 0 && outs.every((e) => e.target === n.id);
      if (selfLoopOnly) {
        errors.push(`Node ${n.id} (${n.type}) only loops to itself`);
      }
      if (reachable.has(n.id) && !canReachTerminal(n.id) && outs.length > 0) {
        errors.push(`Node ${n.id} (${n.type}) cannot reach hangup/transfer/queue/voicemail`);
      }
    }

    const selfId = (flow as FlowJson & { id?: string }).id;
    for (const n of flow.nodes) {
      if (n.type === "subflow") {
        const fid = String((n.data as { flowId?: string })?.flowId ?? "");
        if (selfId && fid === selfId) {
          errors.push("Subflow references the same flow (direct recursion)");
        }
      }
    }
  }

  return [...new Set(errors)];
}

export async function simulateFlow(
  flow: FlowJson,
  input: SimInput,
): Promise<SimStep[]> {
  const steps: SimStep[] = [];
  const vars: Record<string, unknown> = {
    caller: input.caller,
    did: input.did,
    time: input.time ?? new Date().toISOString(),
  };
  let dtmfIdx = 0;
  let node = flow.nodes.find((n) => n.type === "start");
  const visited = new Set<string>();
  let guard = 0;

  while (node && guard++ < 200) {
    // Allow revisiting menu after invalid retry path via loop edges
    const visitKey = `${node.id}:${dtmfIdx}:${String(vars.dtmf ?? "")}`;
    if (visited.has(visitKey) && node.type !== "menu") break;
    visited.add(visitKey);

    const data = node.data as Record<string, unknown>;
    let message = `Entered ${node.type}`;
    let handle: string | undefined;

    switch (node.type) {
      case "start":
        message = "Call entered flow";
        break;
      case "announce":
        message = `Play: ${String(data.text ?? data.prompt ?? data.promptId ?? data.file ?? "announce")}`;
        break;
      case "tts":
        message = `TTS: ${String(data.text ?? "").replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""))}`;
        break;
      case "menu": {
        const retries = Math.max(0, Math.min(5, Number(data.retries ?? 2) || 0));
        const resolved = resolveMenuDigit({
          flow,
          nodeId: node.id,
          digits: input.dtmfSequence ?? [],
          startIdx: dtmfIdx,
          retries,
        });
        dtmfIdx = resolved.nextIdx;
        handle = resolved.handle;
        vars.dtmf = handle;
        message = `DTMF ${handle}`;
        break;
      }
      case "api": {
        const url = String(data.url ?? "");
        if (input.mockApiResponses?.[node.id]) {
          Object.assign(vars, input.mockApiResponses[node.id] as object);
          handle = "success";
          message = `API mock success ${url}`;
        } else {
          try {
            const method = String(data.method ?? "GET");
            const res = await fetch(url, {
              method,
              signal: AbortSignal.timeout(Number(data.timeoutMs ?? 3000)),
            });
            vars.http_status = res.status;
            if (res.ok) {
              const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
              const mappings = (data.mappings as Array<{ path: string; var: string }>) ?? [];
              for (const m of mappings) {
                vars[m.var] = jsonPath(json, m.path);
              }
              handle = "success";
              message = `API ${res.status} ${url}`;
            } else {
              handle = "error";
              message = `API error ${res.status}`;
            }
          } catch (e) {
            handle = "error";
            message = `API failed: ${(e as Error).message}`;
          }
        }
        break;
      }
      case "condition": {
        const op = String(data.op ?? "=");
        const varName = String(data.variable ?? "");
        const left = conditionLeft(vars, varName, op);
        const right = String(data.value ?? "");
        const ok = compare(left, right, op);
        handle = ok ? "true" : "false";
        message = `Condition ${left} ${op} ${right} => ${ok}`;
        break;
      }
      case "set_var":
        vars[String(data.name ?? "var")] = data.value;
        message = `Set ${String(data.name)}`;
        break;
      case "language":
        vars.language = data.language ?? "en";
        message = `Language ${vars.language}`;
        break;
      case "subflow":
        message = `Subflow ${String(data.flowId ?? "")}`;
        handle = "return";
        break;
      case "transfer":
        message = `Transfer to ${String(data.destType)}:${String(data.destId ?? "")}`;
        steps.push({ nodeId: node.id, type: node.type, variables: { ...vars }, message });
        return steps;
      case "queue":
        message = `Enter queue ${String(data.queueId ?? data.queueNumber ?? "")}`;
        steps.push({ nodeId: node.id, type: node.type, variables: { ...vars }, message });
        return steps;
      case "voicemail":
        message = `Voicemail ${String(data.extensionId ?? "")}`;
        steps.push({ nodeId: node.id, type: node.type, variables: { ...vars }, message });
        return steps;
      case "hangup":
        message = "Hangup";
        steps.push({ nodeId: node.id, type: node.type, variables: { ...vars }, message });
        return steps;
      default:
        break;
    }

    steps.push({ nodeId: node.id, type: node.type, variables: { ...vars }, message });

    const nxt = nextNode(flow, node.id, handle, node.type === "menu");
    if (!nxt) break;
    node = nxt;
  }

  return steps;
}
