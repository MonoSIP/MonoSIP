import {
  createContext,
  memo,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { BaseEdge, getBezierPath, Handle, Position, type EdgeProps, type NodeProps } from "@xyflow/react";
import { Pencil, Trash2 } from "lucide-react";
import { exitsForNode, menuDigits, nodeColor, nodeShortTitle } from "./nodeMeta";
import { leftInset, NodeIcon, rightInset, shapeFor, shapePadding, shapePaths } from "./nodeShapes";
import { tr } from "../../../i18n";

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
    const body = String(data.prompt ?? data.text ?? tr("DTMF menu"));
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

/** Track the rendered node size so the SVG outline matches it pixel-for-pixel. */
function useBoxSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export const FlowNode = memo(function FlowNode({ id, data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const type = d.flowType || "announce";
  const color = nodeColor(type);
  const outs = exitsForNode(type, d);
  const detail = subtitle(d);
  const actions = useContext(FlowCanvasActionsCtx);
  const canDelete = type !== "start" && Boolean(actions?.requestDelete);
  const kind = shapeFor(type);
  const pad = shapePadding(kind);
  const [boxRef, { w, h }] = useBoxSize();
  const paths = w > 0 && h > 0 ? shapePaths(kind, w, h) : null;
  const exitCol = outs.length > 1 ? Math.max(...outs.map((o) => o.length)) * 5.6 + 10 : 0;
  const exitY = (i: number) => (i + 1) / (outs.length + 1);

  return (
    <div
      ref={boxRef}
      style={
        {
          ["--node-color" as string]: color,
          paddingTop: 8 + pad.top,
          paddingBottom: 8 + pad.bottom,
          paddingLeft: 12 + pad.left,
          paddingRight: 12 + pad.right + exitCol,
          minHeight: Math.max(54, (outs.length + 1) * 15) + pad.top + pad.bottom,
        } as CSSProperties
      }
      className={`flow-node flow-node--${kind} relative min-w-[150px]${selected ? " is-selected" : ""}`}
      data-shape={kind}
    >
      {paths && (
        <svg className="flow-node-shape" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
          {paths.back?.map((b, i) => (
            <path key={i} d={b} className="flow-node-back" />
          ))}
          <path d={paths.body} className="flow-node-body" />
          {paths.detail && <path d={paths.detail} className="flow-node-detail" />}
        </svg>
      )}
      <div className="flow-node-toolbar nodrag nopan">
        <button
          type="button"
          className="flow-node-tool"
          title={tr("Edit settings")}
          aria-label={tr("Edit node settings")}
          onClick={(e) => {
            e.stopPropagation();
            actions?.openSettings(id);
          }}
        >
          <Pencil size={13} />
        </button>
        {canDelete && (
          <button
            type="button"
            className="flow-node-tool flow-node-tool--danger"
            title={tr("Delete")}
            aria-label={tr("Delete node")}
            onClick={(e) => {
              e.stopPropagation();
              actions?.requestDelete(id);
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {type !== "start" && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ left: leftInset(kind) }}
          className="!h-2.5 !w-2.5 !border-white !bg-[var(--node-color)]"
        />
      )}
      <div className="relative flex items-center gap-1.5">
        <span className="flow-node-icon">
          <NodeIcon type={type} size={18} />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--node-color)]">
          {nodeShortTitle(type)}
        </span>
      </div>
      <div className="relative mt-0.5 text-sm font-medium text-[var(--text)]">{d.label || type}</div>
      {detail ? (
        <div className="relative mt-0.5 max-w-[180px] truncate text-xs text-[var(--text-muted)]">{detail}</div>
      ) : null}
      {outs.map((exitId, i) => (
        <Handle
          key={exitId}
          id={exitId}
          type="source"
          position={Position.Right}
          style={{ top: `${exitY(i) * 100}%`, right: rightInset(kind, exitY(i), h) }}
          className="!h-2.5 !w-2.5 !border-white !bg-[var(--node-color)]"
          title={exitId}
        />
      ))}
      {outs.length > 1 &&
        outs.map((exitId, i) => (
          <div
            key={exitId}
            className="flow-node-exit"
            style={{ top: `${exitY(i) * 100}%`, right: rightInset(kind, exitY(i), h) + 9 }}
          >
            {exitId}
          </div>
        ))}
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

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export type FlowEdgeData = { sim?: "visited" | "active" };

/** Bezier edge that animates the call path when selected or during simulation playback. */
export const FlowEdge = memo(function FlowEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data } = props;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const sim = (data as FlowEdgeData | undefined)?.sim;
  const live = Boolean(selected) || sim === "active";
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={props.markerEnd}
        style={{ ...props.style, strokeWidth: sim || selected ? 2.25 : 1.5 }}
        label={props.label}
        labelX={labelX}
        labelY={labelY}
        labelStyle={props.labelStyle}
        labelShowBg={props.labelShowBg}
        labelBgStyle={props.labelBgStyle}
        labelBgPadding={props.labelBgPadding}
        labelBgBorderRadius={props.labelBgBorderRadius}
      />
      {(live || sim === "visited") && (
        <path d={path} className={`flow-edge-flow${live ? " is-live" : ""}`} style={{ stroke: props.style?.stroke }} />
      )}
      {live && !reducedMotion && (
        <circle r={3.5} className="flow-edge-dot" style={{ fill: props.style?.stroke }}>
          <animateMotion dur="1.2s" repeatCount="indefinite" path={path} />
        </circle>
      )}
    </>
  );
});

export const flowEdgeTypes = { default: FlowEdge } as const;
