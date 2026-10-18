import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
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
import { FlowCanvasActionsProvider, flowNodeTypes, type FlowNodeData } from "./flow/FlowNodes";
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

const palette = [
  "announce",
  "tts",
  "menu",
  "get_key",
  "api",
  "condition",
  "set_var",
  "language",
  "time_condition",
  "directory",
  "subflow",
  "transfer",
  "queue",
  "voicemail",
  "hangup",
] as const;

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
  const [simCaller, setSimCaller] = useState("05551234567");
  const [simDid, setSimDid] = useState("default");
  const [simDtmf, setSimDtmf] = useState("1,timeout");
  const [simMockApi, setSimMockApi] = useState("");
  const [versions, setVersions] = useState<Array<{ id: string; version: number; publishedAt: string }>>([]);
  const [flowName, setFlowName] = useState("");
  const [extensionNumber, setExtensionNumber] = useState("");
  const [mobileView, setMobileView] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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
      toast.error("Extension must be 2–8 digits");
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
    if (r.ok) toast.success("Valid");
    else toast.error(r.errors.join("; "));
  }

  async function publish() {
    await save();
    const r = await api.post<{ version: number }>(`/api/v1/admin/flows/${id}/publish`);
    toast.success(`Published v${r.version}`);
    const vers = await api.get<Array<{ id: string; version: number; publishedAt: string }>>(
      `/api/v1/admin/flows/${id}/versions`,
    );
    setVersions(vers);
  }

  async function rollback(versionId: string) {
    await api.post(`/api/v1/admin/flows/${id}/rollback`, { versionId });
    toast.success("Rolled back — reloading draft");
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
        toast.error("Mock API JSON invalid — expected { \"nodeId\": { ... } }");
        return;
      }
    }
    const r = await api.post<{ steps: Array<{ message: string }> }>(`/api/v1/admin/flows/${id}/simulate`, {
      caller: simCaller,
      did: simDid,
      dtmfSequence,
      mockApiResponses,
    });
    const msgs = r.steps.map((s) => s.message);
    setSimSteps(msgs);
    toast.message(msgs.join(" → "));
  }

  function addNode(type: string) {
    const nid = `${type}-${Date.now()}`;
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      {
        id: nid,
        type,
        position: { x: 160 + (ns.length % 5) * 48, y: 60 + ns.length * 28 },
        selected: true,
        data: {
          flowType: type,
          label: nodeTitle(type),
          ...defaultDataForType(type),
        },
      },
    ]);
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
    toast.success("Node deleted");
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
        <Link to="/flows" className="btn">
          {t("common.back")}
        </Link>
        <input
          className="input max-w-[10rem]"
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          placeholder="Flow name"
          title="Flow name"
        />
        <label className="flex items-center gap-1 text-sm text-[var(--text-muted)]">
          Ext
          <input
            className="input w-24 font-mono"
            value={extensionNumber}
            onChange={(e) => setExtensionNumber(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="900"
            title="Dial this number from softphone to test the published flow"
          />
        </label>
        {mobileView && (
          <span className="badge text-xs">Mobile: view only</span>
        )}
        {!mobileView && (
          <>
        <button className="btn" type="button" onClick={() => void save().catch((e) => toast.error(String(e)))}>
          {t("common.save")}
        </button>
        <button className="btn" type="button" onClick={() => void validate()}>
          {t("flows.validate")}
        </button>
        <button className="btn btn-primary" type="button" onClick={() => void publish()}>
          {t("flows.publish")}
        </button>
          </>
        )}
        <button className="btn" type="button" onClick={() => void simulate()}>
          {t("flows.simulate")}
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => {
            void (async () => {
              if (!id) return;
              const data = await api.get<{
                name: string;
                draftJson: unknown;
              }>(`/api/v1/admin/flows/${id}/export`);
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `${(data.name || "flow").replace(/\W+/g, "-")}.dsip-flow.json`;
              a.click();
              URL.revokeObjectURL(a.href);
              toast.success("Exported");
            })().catch((e) => toast.error(String(e)));
          }}
        >
          Export
        </button>
        <label className="btn cursor-pointer">
          Import
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || !id) return;
              void file
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
                  toast.success("Imported — reload draft");
                  window.location.reload();
                })
                .catch((err) => toast.error((err as Error).message));
            }}
          />
        </label>
        {versions[0] && (
          <select
            className="input w-auto max-w-[12rem]"
            defaultValue=""
            onChange={(e) => {
              const vid = e.target.value;
              if (vid) void rollback(vid).catch((err) => toast.error((err as Error).message));
              e.target.value = "";
            }}
          >
            <option value="">Rollback…</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-3 px-4 pb-4 md:px-8 md:pb-6">
        {!mobileView && (
        <div className="card w-44 shrink-0 overflow-hidden p-2.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Nodes
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
                  <span className="flow-palette-dot" aria-hidden />
                  {nodeShortTitle(p)}
                </button>
              );
            })}
          </div>
        </div>
        )}

        <div className="card relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <FlowCanvasActionsProvider openSettings={openSettings} requestDelete={requestDeleteNode}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={flowNodeTypes}
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
            <div className="mb-1 text-xs font-semibold uppercase text-[var(--text-muted)]">Test call</div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">
              Caller
              <input className="input mt-1 w-full" value={simCaller} onChange={(e) => setSimCaller(e.target.value)} />
            </label>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">
              DID
              <input className="input mt-1 w-full" value={simDid} onChange={(e) => setSimDid(e.target.value)} />
            </label>
            <label className="mb-2 block text-xs text-[var(--text-muted)]">
              DTMF seq (comma)
              <input
                className="input mt-1 w-full"
                value={simDtmf}
                onChange={(e) => setSimDtmf(e.target.value)}
                placeholder="1,1234,timeout"
                title="Menu: one digit. Get key: full code e.g. 1234"
              />
            </label>
            <label className="mb-2 block text-xs text-[var(--text-muted)]">
              Mock API JSON (optional)
              <textarea
                className="input mt-1 w-full font-mono text-[10px]"
                rows={3}
                placeholder='{"api1":{"temsilci":"101"}}'
                value={simMockApi}
                onChange={(e) => setSimMockApi(e.target.value)}
              />
            </label>
            <button className="btn w-full text-sm" type="button" onClick={() => void simulate()}>
              Run simulation
            </button>
            {simSteps.length > 0 && (
              <ol className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto text-xs text-[var(--text)]">
                {simSteps.map((s, i) => (
                  <li key={`${i}-${s}`} className="rounded bg-[var(--bg-soft)] px-2 py-1">
                    {i + 1}. {s}
                  </li>
                ))}
              </ol>
            )}
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Node settings"
          onClick={() => closeInspector()}
        >
          <div
            className={`card flex max-h-[min(92vh,820px)] w-full flex-col overflow-hidden shadow-xl ${modalMaxWidth(selected.data.flowType)}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Node settings
                </div>
                <div className="text-base font-semibold text-[var(--text)]">
                  {nodeTitle(selected.data.flowType)}
                </div>
                {nodeBlurb(selected.data.flowType) ? (
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {nodeBlurb(selected.data.flowType)}
                  </p>
                ) : null}
              </div>
              <button className="btn shrink-0" type="button" onClick={() => closeInspector()}>
                Done
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
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
            </div>
          </div>
        </div>
      )}

      {pendingDeleteId && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete"
          onClick={() => setPendingDeleteId(null)}
        >
          <div
            className="card w-full max-w-sm space-y-4 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="text-sm font-semibold">{t("common.delete")}</div>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {(() => {
                  const n = nodes.find((x) => x.id === pendingDeleteId);
                  const label = n?.data.label || n?.data.flowType || pendingDeleteId;
                  return `Delete “${label}” from the IVR map? Connected links will be removed.`;
                })()}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn" type="button" onClick={() => setPendingDeleteId(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-danger" type="button" onClick={() => confirmDeleteNode()}>
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
