import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useEdgesState,
  useNodesState,
  MarkerType,
  type Connection,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { Button, Modal, SelectInput, usePendingAction } from "../../components/ui";
import {
  FlowCanvasActionsProvider,
  flowEdgeTypes,
  flowNodeTypes,
  type FlowEdgeData,
  type FlowNodeData,
} from "./flow/FlowNodes";
import { NodeIcon } from "./flow/nodeShapes";
import { NodeSettings } from "./flow/NodeSettings";
import {
  defaultDataForType,
  menuDigits,
  modalMaxWidth,
  nodeBlurb,
  nodeColor,
  nodeShortTitle,
  nodeTitle,
} from "./flow/nodeMeta";
import { tr } from "../../i18n";

const palette = [
  "announce",
  "tts",
  "menu",
  "get_key",
  "api",
  "condition",
  "set_var",
  "wait",
  "language",
  "time_condition",
  "directory",
  "subflow",
  "transfer",
  "queue",
  "voicemail",
  "hangup",
] as const;

/**
 * Top-left of the canvas the user is looking at, in flow coordinates.
 * Stepping uses the whole node list so a second add does not land on the first,
 * while a node far across the map does not push the new one off the screen.
 */
export function leftCornerFlowPosition(
  viewport: { x: number; y: number; zoom: number },
  taken: Array<{ x: number; y: number }>,
): { x: number; y: number } {
  const zoom = viewport.zoom > 0 ? viewport.zoom : 1;
  const step = 136 / zoom;
  const x = (32 - viewport.x) / zoom;
  const y0 = (32 - viewport.y) / zoom;
  for (let i = 0; i < 12; i++) {
    const y = y0 + i * step;
    const occupied = taken.some(
      (p) => Math.abs(p.x - x) < step * 0.45 && Math.abs(p.y - y) < step * 0.45,
    );
    if (!occupied) return { x, y };
  }
  return { x, y: y0 };
}

function toRfNodes(raw: Array<Record<string, unknown>>): Node<FlowNodeData>[] {
  return raw.map((n) => {
    const type = String(n.type ?? "announce");
    const data = (n.data ?? {}) as Record<string, unknown>;
    return {
      id: String(n.id),
      type,
      position: (n.position as { x: number; y: number }) ?? { x: 0, y: 0 },
      data: {
        ...data,
        flowType: type,
        label: String(data.label ?? type),
      },
    };
  });
}

function toRfEdges(raw: Array<Record<string, unknown>>): Edge[] {
  return raw.map((e) => ({
    id: String(e.id),
    source: String(e.source),
    target: String(e.target),
    sourceHandle: (e.sourceHandle as string | null | undefined) ?? undefined,
    label: typeof e.label === "string" ? e.label : (e.sourceHandle as string | undefined),
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    style: { stroke: "var(--accent)", strokeWidth: 1.5 },
  }));
}

export function FlowDesignerPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loaded, setLoaded] = useState(false);
  /** Node whose settings modal is open (pencil / add) — not the same as RF selection. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [simSteps, setSimSteps] = useState<string[]>([]);
  /** Node ids visited by the last simulation, replayed on the canvas step by step. */
  const [simTrace, setSimTrace] = useState<string[]>([]);
  const [simIndex, setSimIndex] = useState(-1);
  const [simCaller, setSimCaller] = useState("05551234567");
  const [simDid, setSimDid] = useState("default");
  const [simDtmf, setSimDtmf] = useState("1,timeout");
  const [simMockApi, setSimMockApi] = useState("");
  const [versions, setVersions] = useState<Array<{ id: string; version: number; publishedAt: string }>>([]);
  const [flowName, setFlowName] = useState("");
  const [extensionNumber, setExtensionNumber] = useState("");
  const [mobileView, setMobileView] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const server = usePendingAction();
  const flowBusy = server.isPending("flow");
  const flowRef = useRef<{ getViewport: () => { x: number; y: number; zoom: number } } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setMobileView(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const queues = useQuery({
    queryKey: ["queues"],
    queryFn: () => api.get<Array<{ id: string; number: string; name: string }>>("/api/v1/admin/queues"),
  });
  const exts = useQuery({
    queryKey: ["extensions"],
    queryFn: () =>
      api.get<Array<{ id: string; number: string; name: string }>>("/api/v1/admin/extensions"),
  });
  const schedules = useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/api/v1/admin/schedules"),
  });
  const allFlows = useQuery({
    queryKey: ["flows"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/api/v1/admin/flows"),
  });
  const prompts = useQuery({
    queryKey: ["prompts"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/api/v1/admin/prompts"),
  });
  const mohClasses = useQuery({
    queryKey: ["moh"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/api/v1/admin/moh"),
  });
  useEffect(() => {
    if (!id) return;
    void api
      .get<{
        name: string;
        extensionNumber?: string | null;
        draftJson: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> };
      }>(`/api/v1/admin/flows/${id}/draft`)
      .then((f) => {
        setFlowName(f.name);
        setExtensionNumber(f.extensionNumber ?? "");
        setNodes(toRfNodes(f.draftJson.nodes ?? []));
        setEdges(toRfEdges(f.draftJson.edges ?? []));
        setLoaded(true);
      })
      .catch((e) => toast.error(String(e)));
    void api
      .get<Array<{ id: string; version: number; publishedAt: string }>>(`/api/v1/admin/flows/${id}/versions`)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [id, setNodes, setEdges]);

  // Advance simulation playback one step at a time.
  useEffect(() => {
    if (simIndex < 0 || simIndex >= simTrace.length - 1) return;
    const t = window.setTimeout(() => setSimIndex((i) => i + 1), 750);
    return () => window.clearTimeout(t);
  }, [simIndex, simTrace.length]);

  const viewNodes = useMemo(() => {
    if (simIndex < 0) return nodes;
    const active = simTrace[simIndex];
    const visited = new Set(simTrace.slice(0, simIndex));
    return nodes.map((n) =>
      n.id === active
        ? { ...n, className: "sim-active" }
        : visited.has(n.id)
          ? { ...n, className: "sim-visited" }
          : n,
    );
  }, [nodes, simTrace, simIndex]);

  // Edges take their source node's color; only re-derive when node types change, not on drag.
  const nodeTypeKey = nodes.map((n) => `${n.id}:${n.data.flowType}`).join("|");
  const viewEdges = useMemo(() => {
    const typeById = new Map(nodeTypeKey.split("|").map((p) => p.split(":") as [string, string]));
    const hops = new Map<string, "visited" | "active">();
    for (let i = 1; i <= simIndex && i < simTrace.length; i++) {
      hops.set(`${simTrace[i - 1]}>${simTrace[i]}`, i === simIndex ? "active" : "visited");
    }
    return edges.map((e) => {
      const stroke = nodeColor(typeById.get(e.source) ?? "");
      const sim = hops.get(`${e.source}>${e.target}`);
      return {
        ...e,
        style: { ...e.style, stroke },
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: stroke },
        labelStyle: { fill: stroke, fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: "var(--bg-elevated)" },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        data: { ...e.data, sim } satisfies FlowEdgeData,
      };
    });
  }, [edges, nodeTypeKey, simTrace, simIndex]);

  const selected = useMemo(
    () => nodes.find((n) => n.id === editingId) ?? null,
    [nodes, editingId],
  );

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...c,
            id: `e-${Date.now()}`,
            label: c.sourceHandle ?? undefined,
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
            style: { stroke: "var(--accent)", strokeWidth: 1.5 },
          },
          eds,
        ),
      ),
    [setEdges],
  );

  const openSettings = useCallback((nodeId: string) => {
    setEditingId(nodeId);
  }, []);

  async function save() {
    if (!id) return;
    const num = extensionNumber.trim();
    if (num && !/^\d{2,8}$/.test(num)) {
      toast.error(tr("Extension must be 2–8 digits"));
      return;
    }
    await api.patch(`/api/v1/admin/flows/${id}`, {
      name: flowName || undefined,
      extensionNumber: num || null,
    });
    await api.put(`/api/v1/admin/flows/${id}/draft`, {
      nodes: nodes.map((n) => {
        const flowType = n.data.flowType || String(n.type);
        const { label: _l, flowType: _f, ...rest } = n.data;
        return {
          id: n.id,
          type: flowType,
          position: n.position,
          data: { ...rest, ...(n.data.label ? { label: n.data.label } : {}) },
        };
      }),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        label: typeof e.label === "string" ? e.label : e.sourceHandle ?? undefined,
      })),
      variables: ["caller", "did", "time"],
    });
    toast.success(num ? `Saved — dial ${num} from softphone` : "Saved");
  }

  async function validate() {
    const r = await api.post<{ ok: boolean; errors: string[] }>(`/api/v1/admin/flows/${id}/validate`);
    if (r.ok) toast.success(tr("Valid"));
    else toast.error(r.errors.join("; "));
  }

  async function publish() {
    await save();
    const r = await api.post<{ version: number }>(`/api/v1/admin/flows/${id}/publish`);
    toast.success(tr("Published v{{v0}}", { v0: r.version }));
    const vers = await api.get<Array<{ id: string; version: number; publishedAt: string }>>(
      `/api/v1/admin/flows/${id}/versions`,
    );
    setVersions(vers);
  }

  async function rollback(versionId: string) {
    await api.post(`/api/v1/admin/flows/${id}/rollback`, { versionId });
    toast.success(tr("Rolled back — reloading draft"));
    const f = await api.get<{
      draftJson: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> };
    }>(`/api/v1/admin/flows/${id}/draft`);
    setNodes(toRfNodes(f.draftJson.nodes ?? []));
    setEdges(toRfEdges(f.draftJson.edges ?? []));
  }

  async function simulate() {
    const dtmfSequence = simDtmf
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    let mockApiResponses: Record<string, unknown> | undefined;
    if (simMockApi.trim()) {
      try {
        mockApiResponses = JSON.parse(simMockApi) as Record<string, unknown>;
      } catch {
        toast.error(tr("Mock API JSON invalid — expected { \"nodeId\": { ... } }"));
        return;
      }
    }
    const r = await api.post<{ steps: Array<{ message: string; nodeId?: string }> }>(`/api/v1/admin/flows/${id}/simulate`, {
      caller: simCaller,
      did: simDid,
      dtmfSequence,
      mockApiResponses,
    });
    const msgs = r.steps.map((s) => s.message);
    setSimSteps(msgs);
    setSimTrace(r.steps.map((s) => s.nodeId ?? ""));
    setSimIndex(0);
    toast.message(msgs.join(" → "));
  }

  function addNode(type: string) {
    const nid = `${type}-${Date.now()}`;
    setNodes((ns) => {
      const position = leftCornerFlowPosition(
        flowRef.current?.getViewport() ?? { x: 0, y: 0, zoom: 1 },
        ns.map((n) => n.position),
      );
      return [
        ...ns.map((n) => ({ ...n, selected: false })),
        {
          id: nid,
          type,
          position,
          selected: true,
          data: {
            flowType: type,
            label: nodeTitle(type),
            ...defaultDataForType(type),
          },
        },
      ];
    });
    setEditingId(nid);
  }

  function patchSelected(patch: Partial<FlowNodeData>) {
    if (!editingId) return;
    const sid = editingId;
    setNodes((ns) =>
      ns.map((n) => (n.id === sid ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
    // Drop edges for menu digits that were unchecked
    if (Array.isArray(patch.digits)) {
      const keep = new Set([...menuDigits({ digits: patch.digits }), "timeout", "invalid"]);
      setEdges((es) =>
        es.filter((e) => {
          if (e.source !== sid) return true;
          const h = e.sourceHandle ?? (typeof e.label === "string" ? e.label : undefined);
          if (!h) return true;
          return keep.has(String(h));
        }),
      );
    }
    // Transfer to non-extension: remove dial-status edges
    if (patch.destType && patch.destType !== "extension") {
      const dial = new Set(["noanswer", "busy", "chanunavail"]);
      setEdges((es) =>
        es.filter((e) => {
          if (e.source !== sid) return true;
          const h = e.sourceHandle ?? (typeof e.label === "string" ? e.label : undefined);
          return !h || !dial.has(String(h));
        }),
      );
    }
  }

  function closeInspector() {
    setEditingId(null);
  }

  const requestDeleteNode = useCallback((nodeId: string) => {
    const n = nodes.find((x) => x.id === nodeId);
    if (!n || n.data.flowType === "start" || n.type === "start") return;
    setPendingDeleteId(nodeId);
  }, [nodes]);

  function confirmDeleteNode() {
    if (!pendingDeleteId) return;
    const idToRemove = pendingDeleteId;
    setPendingDeleteId(null);
    setNodes((ns) => ns.filter((n) => n.id !== idToRemove));
    setEdges((es) => es.filter((e) => e.source !== idToRemove && e.target !== idToRemove));
    if (editingId === idToRemove) {
      setEditingId(null);
    }
    toast.success(tr("Node deleted"));
  }

  useEffect(() => {
    if (!editingId && !pendingDeleteId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pendingDeleteId) {
        setPendingDeleteId(null);
        return;
      }
      setEditingId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId, pendingDeleteId]);

  if (!loaded) return <div className="p-4">{t("common.loading")}</div>;

  return (
    <div className="flex h-full min-h-[480px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 md:px-8 md:pt-6">
        <Button asChild variant="soft">
<Link to="/flows" >
          {t("common.back")}
        </Link>
</Button>
        <input
          className="input min-w-[12rem] max-w-[28rem] flex-1 font-medium"
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          placeholder={tr("Flow name")}
          title={tr("Flow name")}
        />
        <label className="flex items-center gap-1 text-sm text-[var(--text-muted)]">
          {tr("Ext")}
          <input
            className="input w-[5.5rem] text-center font-mono"
            inputMode="numeric"
            maxLength={8}
            value={extensionNumber}
            onChange={(e) => setExtensionNumber(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="900"
            title={tr("Dial this number from softphone to test the published flow")}
          />
        </label>
        {mobileView && (
          <span className="badge text-xs">{tr("Mobile: view only")}</span>
        )}
        {!mobileView && (
          <>
        <Button
          type="button"
          pending={flowBusy}
          onClick={() => void server.run("flow", () => save().catch((e) => toast.error(String(e))))}
        >
          {t("common.save")}
        </Button>
        <Button
          type="button"
          pending={flowBusy}
          onClick={() => void server.run("flow", () => validate().catch((e) => toast.error(String(e))))}
        >
          {t("flows.validate")}
        </Button>
        <Button
          variant="solid"
          type="button"
          pending={flowBusy}
          onClick={() => void server.run("flow", () => publish().catch((e) => toast.error(String(e))))}
        >
          {t("flows.publish")}
        </Button>
          </>
        )}
        <Button
          type="button"
          pending={flowBusy}
          onClick={() => void server.run("flow", () => simulate().catch((e) => toast.error(String(e))))}
        >
          {t("flows.simulate")}
        </Button>
        <Button
          type="button"
          pending={flowBusy}
          onClick={() =>
            void server.run("flow", async () => {
              if (!id) return;
              try {
                const data = await api.get<{
                  name: string;
                  draftJson: unknown;
                }>(`/api/v1/admin/flows/${id}/export`);
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `${(data.name || "flow").replace(/\W+/g, "-")}.monosip-flow.json`;
                a.click();
                URL.revokeObjectURL(a.href);
                toast.success(tr("Exported"));
              } catch (e) {
                toast.error(String(e));
              }
            })
          }
        >
          {tr("Export")}
        </Button>
        <Button asChild pending={flowBusy}>
          <label>
          {tr("Import")}
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            disabled={flowBusy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || !id) return;
              void server.run("flow", () =>
                file
                  .text()
                  .then(async (text) => {
                    const parsed = JSON.parse(text) as {
                      draftJson?: unknown;
                      name?: string;
                    };
                    const draftJson = parsed.draftJson ?? parsed;
                    await api.post(`/api/v1/admin/flows/${id}/import`, {
                      draftJson,
                      name: parsed.name,
                    });
                    toast.success(tr("Imported — reload draft"));
                    window.location.reload();
                  })
                  .catch((err) => toast.error((err as Error).message)),
              );
            }}
          />
          </label>
        </Button>
        {versions[0] && (
          <SelectInput
            className="w-auto max-w-[12rem]"
            aria-label={tr("Rollback…")}
            placeholder={tr("Rollback…")}
            value=""
            disabled={flowBusy}
            onValueChange={(vid) => {
              if (vid) {
                void server.run("flow", () =>
                  rollback(vid).catch((err) => toast.error((err as Error).message)),
                );
              }
            }}
            options={versions.map((v) => ({ value: v.id, label: `v${v.version}` }))}
          />
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-3 px-4 pb-4 md:px-8 md:pb-6">
        {!mobileView && (
        <div className="card w-44 shrink-0 overflow-hidden p-2.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {tr("Nodes")}
          </div>
          <div className="flex flex-col gap-1">
            {palette.map((p) => {
              const color = nodeColor(p);
              return (
                <button
                  key={p}
                  type="button"
                  title={nodeTitle(p)}
                  onClick={() => addNode(p)}
                  className="flow-palette-chip"
                  style={{ ["--chip-color" as string]: color } as CSSProperties}
                >
                  <span className="flow-palette-icon">
                    <NodeIcon type={p} size={16} />
                  </span>
                  {nodeShortTitle(p)}
                </button>
              );
            })}
          </div>
        </div>
        )}

        <div className="card relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <FlowCanvasActionsProvider
            openSettings={openSettings}
            requestDelete={requestDeleteNode}
            deleteEdge={mobileView ? undefined : (edgeId) => setEdges((es) => es.filter((e) => e.id !== edgeId))}
          >
            <ReactFlow
              nodes={viewNodes}
              edges={viewEdges}
              nodeTypes={flowNodeTypes}
              edgeTypes={flowEdgeTypes}
              onInit={(instance) => {
                flowRef.current = instance;
              }}
              onNodesChange={mobileView ? undefined : onNodesChange}
              onEdgesChange={mobileView ? undefined : onEdgesChange}
              onConnect={mobileView ? undefined : onConnect}
              nodesDraggable={!mobileView}
              nodesConnectable={!mobileView}
              elementsSelectable
              fitView
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{
                markerEnd: { type: MarkerType.ArrowClosed },
                style: { stroke: "var(--accent)" },
              }}
            >
              <Background gap={18} color="var(--border)" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </FlowCanvasActionsProvider>
        </div>

        <div className="card flex w-56 shrink-0 flex-col overflow-hidden p-3">
            <div className="mb-1 text-xs font-semibold uppercase text-[var(--text-muted)]">{tr("Test call")}</div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">
              {tr("Caller")}
              <input className="input mt-1 w-full" value={simCaller} onChange={(e) => setSimCaller(e.target.value)} />
            </label>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">
              {tr("DID")}
              <input className="input mt-1 w-full" value={simDid} onChange={(e) => setSimDid(e.target.value)} />
            </label>
            <label className="mb-2 block text-xs text-[var(--text-muted)]">
              {tr("DTMF seq (comma)")}
              <input
                className="input mt-1 w-full"
                value={simDtmf}
                onChange={(e) => setSimDtmf(e.target.value)}
                placeholder={tr("1,1234,timeout")}
                title={tr("Menu: one digit. Get key: full code e.g. 1234")}
              />
            </label>
            <label className="mb-2 block text-xs text-[var(--text-muted)]">
              {tr("Mock API JSON (optional)")}
              <textarea
                className="input mt-1 w-full font-mono text-[10px]"
                rows={3}
                placeholder={tr("{\"api1\":{\"agent\":\"101\"}}")}
                value={simMockApi}
                onChange={(e) => setSimMockApi(e.target.value)}
              />
            </label>
            <Button
              className="w-full text-sm"
              type="button"
              pending={flowBusy}
              onClick={() => void server.run("flow", () => simulate().catch((e) => toast.error(String(e))))}
            >
              {tr("Run simulation")}
            </Button>
            {simSteps.length > 0 && (
              <>
                <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                  <span>
                    {simIndex + 1} / {simSteps.length}
                  </span>
                  <span className="flex gap-1">
                    <Button className="px-2 py-0.5 text-[10px]" type="button" onClick={() => setSimIndex(0)}>
                      {tr("Replay")}
                    </Button>
                    <Button
                      className="px-2 py-0.5 text-[10px]"
                      type="button"
                      onClick={() => {
                        setSimSteps([]);
                        setSimTrace([]);
                        setSimIndex(-1);
                      }}
                    >
                      {tr("Clear")}
                    </Button>
                  </span>
                </div>
                <ol className="mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto text-xs text-[var(--text)]">
                  {simSteps.map((s, i) => (
                    <li key={`${i}-${s}`}>
                      <button
                        type="button"
                        onClick={() => setSimIndex(i)}
                        className={`sim-step w-full rounded px-2 py-1 text-left${
                          i === simIndex ? " is-current" : i < simIndex ? " is-done" : ""
                        }`}
                      >
                        {i + 1}. {s}
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            )}
        </div>
      </div>

      {selected ? (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open) closeInspector();
          }}
          className={modalMaxWidth(selected.data.flowType)}
          eyebrow={tr("Node settings")}
          title={nodeTitle(selected.data.flowType)}
          description={nodeBlurb(selected.data.flowType) || undefined}
          headerAside={
            <Button className="shrink-0" type="button" onClick={() => closeInspector()}>
              {tr("Done")}
            </Button>
          }
        >
          <NodeSettings
            data={selected.data}
            patch={patchSelected}
            ctx={{
              prompts: prompts.data ?? [],
              mohClasses: mohClasses.data ?? [],
              queues: queues.data ?? [],
              extensions: exts.data ?? [],
              schedules: schedules.data ?? [],
              flows: allFlows.data ?? [],
              currentFlowId: id,
            }}
          />
        </Modal>
      ) : null}

      {pendingDeleteId ? (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open) setPendingDeleteId(null);
          }}
          className="max-w-sm"
          title={t("common.delete")}
          description={(() => {
            const n = nodes.find((x) => x.id === pendingDeleteId);
            const label = n?.data.label || n?.data.flowType || pendingDeleteId;
            return `Delete “${label}” from the IVR map? Connected links will be removed.`;
          })()}
          footer={
            <>
              <Button type="button" onClick={() => setPendingDeleteId(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="solid" color="red" type="button" onClick={() => confirmDeleteNode()}>
                {t("common.delete")}
              </Button>
            </>
          }
        />
      ) : null}
    </div>
  );
}
