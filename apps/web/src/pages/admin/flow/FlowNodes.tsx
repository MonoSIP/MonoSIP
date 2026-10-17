import { createContext, memo, useContext, type ReactNode } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Pencil, Trash2 } from "lucide-react";
import { exitsForNode, menuDigits } from "./nodeMeta";

export type FlowNodeData = {
  label?: string;
  flowType: string;
  text?: string;
  prompt?: string;
  promptId?: string;
  [key: string]: unknown;
};

type FlowCanvasActions = {
  openSettings: (nodeId: string) => void;
  requestDelete: (nodeId: string) => void;
};

const FlowCanvasActionsCtx = createContext<FlowCanvasActions | null>(null);

export function FlowCanvasActionsProvider({
  openSettings,
  requestDelete,
  children,
}: {
  openSettings: (nodeId: string) => void;
  requestDelete: (nodeId: string) => void;
  children: ReactNode;
}) {
  return (
    <FlowCanvasActionsCtx.Provider value={{ openSettings, requestDelete }}>
      {children}
    </FlowCanvasActionsCtx.Provider>
  );
}

function subtitle(data: FlowNodeData): string {
  const t = data.flowType;
  if (t === "announce" || t === "tts") {
    const lang = data.language ? String(data.language) : "";
    const body = String(data.text ?? data.prompt ?? data.promptId ?? "");
    return [lang, body].filter(Boolean).join(" · ");
  }
  if (t === "menu") {
    const lang = data.language ? String(data.language) : "";
    const keys = menuDigits(data).join(",");
    const body = String(data.prompt ?? data.text ?? "DTMF menu");
    return [lang, keys && `[${keys}]`, body].filter(Boolean).join(" · ");
  }
  if (t === "transfer") return `${data.destType ?? ""} ${data.destId ?? ""}`.trim();
  if (t === "queue") return String(data.queueNumber ?? data.queueId ?? "");
  if (t === "api") {
    const method = String(data.method ?? "GET").toUpperCase();
    const url = String(data.url ?? "");
    return url ? `${method} ${url}` : method;
  }
  if (t === "condition") {
    return `${data.variable ?? "?"} ${data.op ?? "="} ${data.value ?? ""}`.trim();
  }
  if (t === "set_var") return `${data.name ?? ""}=${data.value ?? ""}`;
  if (t === "get_key") {
    const name = String(data.name ?? data.variable ?? "digits");
    return `$${name} · max ${data.maxDigits ?? 4}`;
  }
  if (t === "language") return String(data.language ?? "en");
  if (t === "time_condition") return data.scheduleId ? "schedule set" : "no schedule";
  if (t === "voicemail") return String(data.extension ?? data.extensionId ?? "");
  if (t === "subflow") return data.flowId ? "subflow" : "pick flow";
  if (t === "directory") return String(data.language ?? "en");
  return "";
}

export const FlowNode = memo(function FlowNode({ id, data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const type = d.flowType || "announce";
  const outs = exitsForNode(type, d);
  const detail = subtitle(d);
  const actions = useContext(FlowCanvasActionsCtx);
  const canDelete = type !== "start" && Boolean(actions?.requestDelete);

  return (
    <div
      className={`relative min-w-[140px] rounded-xl border px-3 py-2 pr-8 shadow-sm ${
        selected
          ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_18%,var(--bg-elevated))]"
          : "border-[var(--border)] bg-[var(--bg-elevated)]"
      }`}
    >
      <div className="nodrag nopan absolute right-1 top-1 flex flex-col gap-0.5">
        <button
          type="button"
          className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] hover:text-[var(--accent)]"
          title="Edit settings"
          aria-label="Edit node settings"
          onClick={(e) => {
            e.stopPropagation();
            actions?.openSettings(id);
          }}
        >
          <Pencil size={14} />
        </button>
        {canDelete && (
          <button
            type="button"
            className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[color-mix(in_oklab,var(--danger)_18%,transparent)] hover:text-[var(--danger)]"
            title="Delete"
            aria-label="Delete node"
            onClick={(e) => {
              e.stopPropagation();
              actions?.requestDelete(id);
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
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
      {outs.map((exitId, i) => (
        <Handle
          key={exitId}
          id={exitId}
          type="source"
          position={Position.Right}
          style={{ top: `${((i + 1) / (outs.length + 1)) * 100}%` }}
          className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--accent)]"
          title={exitId}
        />
      ))}
      {outs.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5 text-[9px] text-[var(--text-muted)]">
          {outs.map((exitId) => (
            <div key={exitId} className="text-right">
              {exitId}
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
  get_key: FlowNode,
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
