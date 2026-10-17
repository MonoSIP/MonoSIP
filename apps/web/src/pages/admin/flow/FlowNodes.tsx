import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type FlowNodeData = {
  label?: string;
  flowType: string;
  text?: string;
  prompt?: string;
  promptId?: string;
  [key: string]: unknown;
};

const exits: Record<string, string[]> = {
  start: ["next"],
  announce: ["next"],
  tts: ["next"],
  set_var: ["next"],
  language: ["next"],
  directory: ["found", "not_found"],
  subflow: ["return"],
  menu: ["1", "2", "3", "4", "5", "0", "timeout", "invalid"],
  api: ["success", "error"],
  condition: ["true", "false"],
  time_condition: ["open", "lunch", "closed", "holiday"],
  transfer: ["noanswer", "busy", "chanunavail"],
  // Overflow is configured on Queues screen (dialplan); call leaves Stasis
  queue: [],
  voicemail: [],
  hangup: [],
};

function subtitle(data: FlowNodeData): string {
  const t = data.flowType;
  if (t === "announce" || t === "tts") {
    const lang = data.language ? String(data.language) : "";
    const body = String(data.text ?? data.prompt ?? data.promptId ?? "");
    return [lang, body].filter(Boolean).join(" · ");
  }
  if (t === "menu") {
    const lang = data.language ? String(data.language) : "";
    const body = String(data.prompt ?? data.text ?? "DTMF menu");
    return [lang, body].filter(Boolean).join(" · ");
  }
  if (t === "transfer") return `${data.destType ?? ""} ${data.destId ?? ""}`.trim();
  if (t === "queue") return String(data.queueId ?? "");
  return "";
}

export const FlowNode = memo(function FlowNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const type = d.flowType || "announce";
  const outs = exits[type] ?? ["next"];
  const detail = subtitle(d);

  return (
    <div
      className={`min-w-[140px] rounded-xl border px-3 py-2 shadow-sm ${
        selected
          ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_18%,var(--bg-elevated))]"
          : "border-[var(--border)] bg-[var(--bg-elevated)]"
      }`}
    >
      {type !== "start" && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--accent)]"
        />
      )}
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
        {type}
      </div>
      <div className="text-sm font-medium text-[var(--text)]">{d.label || type}</div>
      {detail ? (
        <div className="mt-0.5 max-w-[180px] truncate text-xs text-[var(--text-muted)]">{detail}</div>
      ) : null}
      {outs.map((id, i) => (
        <Handle
          key={id}
          id={id}
          type="source"
          position={Position.Right}
          style={{ top: `${((i + 1) / (outs.length + 1)) * 100}%` }}
          className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--accent)]"
          title={id}
        />
      ))}
      {outs.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5 text-[9px] text-[var(--text-muted)]">
          {outs.map((id) => (
            <div key={id} className="text-right">
              {id}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export const flowNodeTypes = {
  start: FlowNode,
  announce: FlowNode,
  tts: FlowNode,
  menu: FlowNode,
  api: FlowNode,
  condition: FlowNode,
  time_condition: FlowNode,
  set_var: FlowNode,
  language: FlowNode,
  directory: FlowNode,
  transfer: FlowNode,
  queue: FlowNode,
  voicemail: FlowNode,
  subflow: FlowNode,
  hangup: FlowNode,
} as const;
