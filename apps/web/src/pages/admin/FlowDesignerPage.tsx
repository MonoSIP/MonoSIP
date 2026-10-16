import { useCallback, useEffect, useMemo, useState } from "react";
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
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { DestPicker } from "../../components/DestPicker";
import { flowNodeTypes, type FlowNodeData } from "./flow/FlowNodes";

const palette = [
  "announce",
  "tts",
  "menu",
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

function SecretPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [newName, setNewName] = useState("");
  const [newVal, setNewVal] = useState("");
  const secrets = useQuery({
    queryKey: ["secrets"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/api/v1/admin/secrets"),
  });
  return (
    <div className="space-y-2">
      <label className="block text-xs text-[var(--text-muted)]">
        Secret
        <select className="input mt-1 w-full" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— select —</option>
          {(secrets.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-1">
        <input
          className="input flex-1"
          placeholder="New secret name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <input
          className="input flex-1"
          placeholder="Value"
          type="password"
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
        />
        <button
          className="btn"
          type="button"
          onClick={() => {
            if (!newName || !newVal) return;
            void api
              .post<{ id: string }>("/api/v1/admin/secrets", { name: newName, value: newVal })
              .then((r) => {
                toast.success("Secret saved");
                setNewName("");
                setNewVal("");
                onChange(r.id);
                void secrets.refetch();
              })
              .catch((e: Error) => toast.error(e.message));
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

export function FlowDesignerPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [simSteps, setSimSteps] = useState<string[]>([]);
  const [simCaller, setSimCaller] = useState("05551234567");
  const [simDid, setSimDid] = useState("default");
  const [simDtmf, setSimDtmf] = useState("1,timeout");
  const [simMockApi, setSimMockApi] = useState("");
  const [versions, setVersions] = useState<Array<{ id: string; version: number; publishedAt: string }>>([]);
  const [httpTestResult, setHttpTestResult] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("");
  const [extensionNumber, setExtensionNumber] = useState("");
  const [mobileView, setMobileView] = useState(false);

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
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
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

  const onSelectionChange = useCallback((p: OnSelectionChangeParams) => {
    setSelectedId(p.nodes[0]?.id ?? null);
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

  async function testHttp() {
    if (!selected || selected.data.flowType !== "api") return;
    try {
      let headers: Record<string, string> = {};
      try {
        headers =
          typeof selected.data.headers === "string"
            ? (JSON.parse(selected.data.headers) as Record<string, string>)
            : ((selected.data.headers as Record<string, string>) ?? {});
      } catch {
        headers = {};
      }
      const r = await api.post<{ status: number; body: string }>("/api/v1/admin/flows/test-http", {
        method: String(selected.data.method ?? "GET"),
        url: String(selected.data.url ?? ""),
        headers,
        body: selected.data.body ? String(selected.data.body) : undefined,
        timeoutMs: Number(selected.data.timeoutMs ?? 3000),
      });
      setHttpTestResult(`${r.status}: ${r.body.slice(0, 500)}`);
      toast.success(`HTTP ${r.status}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function addNode(type: string) {
    const nid = `${type}-${Date.now()}`;
    setNodes((ns) => [
      ...ns,
      {
        id: nid,
        type,
        position: { x: 160 + (ns.length % 5) * 48, y: 60 + ns.length * 28 },
        data: {
          flowType: type,
          label: type,
          ...(type === "menu" ? { prompt: "Press 1 or 2" } : {}),
          ...(type === "announce" || type === "tts" ? { text: "Welcome" } : {}),
        },
      },
    ]);
  }

  function patchSelected(patch: Partial<FlowNodeData>) {
    if (!selectedId) return;
    setNodes((ns) =>
      ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
  }

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
        <div className="card w-40 shrink-0 space-y-2 overflow-auto p-3">
          <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">Nodes</div>
          {palette.map((p) => (
            <button key={p} type="button" className="btn w-full justify-start text-sm" onClick={() => addNode(p)}>
              {p}
            </button>
          ))}
        </div>
        )}

        <div className="card relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={flowNodeTypes}
            onNodesChange={mobileView ? undefined : onNodesChange}
            onEdgesChange={mobileView ? undefined : onEdgesChange}
            onConnect={mobileView ? undefined : onConnect}
            onSelectionChange={onSelectionChange}
            nodesDraggable={!mobileView}
            nodesConnectable={!mobileView}
            elementsSelectable={!mobileView}
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
        </div>

        <div className="card w-56 shrink-0 space-y-3 overflow-auto p-3">
          <div className="text-xs font-semibold uppercase text-[var(--text-muted)]">Inspector</div>
          {selected ? (
            <>
              <div className="text-sm font-medium">{selected.data.flowType}</div>
              <label className="block text-xs text-[var(--text-muted)]">
                Label
                <input
                  className="input mt-1 w-full"
                  value={String(selected.data.label ?? "")}
                  onChange={(e) => patchSelected({ label: e.target.value })}
                />
              </label>
              {(selected.data.flowType === "announce" ||
                selected.data.flowType === "tts" ||
                selected.data.flowType === "menu") && (
                <>
                  <label className="block text-xs text-[var(--text-muted)]">
                    {selected.data.flowType === "menu" ? "Prompt" : "Text"}
                    <textarea
                      className="input mt-1 w-full"
                      rows={3}
                      value={String(
                        selected.data.flowType === "menu"
                          ? (selected.data.prompt ?? selected.data.text ?? "")
                          : (selected.data.text ?? selected.data.prompt ?? ""),
                      )}
                      onChange={(e) =>
                        patchSelected(
                          selected.data.flowType === "menu"
                            ? { prompt: e.target.value }
                            : { text: e.target.value },
                        )
                      }
                    />
                  </label>
                  {(selected.data.flowType === "announce" ||
                    selected.data.flowType === "tts") && (
                    <>
                      <label className="block text-xs text-[var(--text-muted)]">
                        Prompt (Piper WAV)
                        <select
                          className="input mt-1 w-full"
                          value={String(selected.data.promptId ?? "")}
                          onChange={(e) => patchSelected({ promptId: e.target.value || undefined })}
                        >
                          <option value="">— none —</option>
                          {(prompts.data ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selected.data.flowType === "tts" && (
                        <label className="block text-xs text-[var(--text-muted)]">
                          Voice gender
                          <select
                            className="input mt-1 w-full"
                            value={String(selected.data.gender ?? selected.data.voice ?? "female")}
                            onChange={(e) => patchSelected({ gender: e.target.value })}
                          >
                            <option value="female">Female</option>
                            <option value="male">Male</option>
                          </select>
                        </label>
                      )}
                    </>
                  )}
                  {selected.data.flowType === "menu" && (
                    <>
                      <label className="block text-xs text-[var(--text-muted)]">
                        Voice gender
                        <select
                          className="input mt-1 w-full"
                          value={String(selected.data.gender ?? selected.data.voice ?? "female")}
                          onChange={(e) => patchSelected({ gender: e.target.value })}
                        >
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                        </select>
                      </label>
                      <label className="block text-xs text-[var(--text-muted)]">
                        Max digits
                        <input
                          className="input mt-1 w-full"
                          type="number"
                          min={1}
                          max={12}
                          value={Number(selected.data.maxDigits ?? 1)}
                          onChange={(e) =>
                            patchSelected({
                              maxDigits: Math.max(1, Math.min(12, Number(e.target.value) || 1)),
                            })
                          }
                        />
                      </label>
                      <label className="block text-xs text-[var(--text-muted)]">
                        Retries on invalid
                        <input
                          className="input mt-1 w-full"
                          type="number"
                          min={0}
                          max={5}
                          value={Number(selected.data.retries ?? 2)}
                          onChange={(e) =>
                            patchSelected({
                              retries: Math.max(0, Math.min(5, Number(e.target.value) || 0)),
                            })
                          }
                        />
                      </label>
                      <label className="block text-xs text-[var(--text-muted)]">
                        Timeout (ms)
                        <input
                          className="input mt-1 w-full"
                          type="number"
                          min={1000}
                          value={Number(selected.data.timeoutMs ?? 12000)}
                          onChange={(e) =>
                            patchSelected({ timeoutMs: Math.max(1000, Number(e.target.value) || 12000) })
                          }
                        />
                      </label>
                      <p className="text-xs text-[var(--text-muted)]">
                        Wire exits for digits, <code>timeout</code>, and <code>invalid</code>.
                      </p>
                    </>
                  )}
                </>
              )}
              {selected.data.flowType === "transfer" && (
                <DestPicker
                  destType={String(selected.data.destType ?? "extension")}
                  destId={(selected.data.destId as string | null) ?? null}
                  onChange={(destType, destId) => patchSelected({ destType, destId })}
                />
              )}
              {selected.data.flowType === "queue" && (
                <>
                  <label className="block text-xs text-[var(--text-muted)]">
                    Queue
                    <select
                      className="input mt-1 w-full"
                      value={String(selected.data.queueNumber ?? selected.data.queueId ?? "")}
                      onChange={(e) => {
                        const q = queues.data?.find(
                          (x) => x.number === e.target.value || x.id === e.target.value,
                        );
                        patchSelected({
                          queueId: q?.id,
                          queueNumber: q?.number ?? e.target.value,
                        });
                      }}
                    >
                      <option value="">— select —</option>
                      {(queues.data ?? []).map((q) => (
                        <option key={q.id} value={q.number}>
                          {q.number} — {q.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-[var(--text-muted)]">
                    Priority / VIP (0–99)
                    <input
                      className="input mt-1 w-full"
                      type="number"
                      min={0}
                      max={99}
                      value={Number(selected.data.priority ?? 0)}
                      onChange={(e) =>
                        patchSelected({ priority: Math.max(0, Math.min(99, Number(e.target.value) || 0)) })
                      }
                    />
                  </label>
                  <p className="text-xs text-[var(--text-muted)]">
                    Higher priority jumps ahead. Flow vars <code>priority</code> or{" "}
                    <code>vip=true</code> also apply.
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Overflow (timeout / full / no agents) is configured on the{" "}
                    <strong>Queues</strong> screen — flow edges after Queue are not used once the
                    call leaves Stasis.
                  </p>
                </>
              )}
              {selected.data.flowType === "voicemail" && (
                <label className="block text-xs text-[var(--text-muted)]">
                  Extension
                  <select
                    className="input mt-1 w-full"
                    value={String(selected.data.extension ?? selected.data.extensionId ?? "")}
                    onChange={(e) =>
                      patchSelected({ extension: e.target.value, extensionId: e.target.value })
                    }
                  >
                    <option value="">— select —</option>
                    {(exts.data ?? []).map((e) => (
                      <option key={e.id} value={e.number}>
                        {e.number} — {e.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected.data.flowType === "directory" && (
                <p className="text-xs text-[var(--text-muted)]">
                  Caller dials last name on the ABC keypad (2=ABC … 9=WXYZ), then #.
                  Matches surname or extension number.
                </p>
              )}
              {selected.data.flowType === "api" && (
                <>
                  <label className="block text-xs text-[var(--text-muted)]">
                    Method
                    <input
                      className="input mt-1 w-full"
                      value={String(selected.data.method ?? "GET")}
                      onChange={(e) => patchSelected({ method: e.target.value })}
                    />
                  </label>
                  <label className="block text-xs text-[var(--text-muted)]">
                    URL
                    <input
                      className="input mt-1 w-full"
                      value={String(selected.data.url ?? "")}
                      onChange={(e) => patchSelected({ url: e.target.value })}
                    />
                  </label>
                  <label className="block text-xs text-[var(--text-muted)]">
                    Auth type
                    <select
                      className="input mt-1 w-full"
                      value={String(selected.data.authType ?? "none")}
                      onChange={(e) => patchSelected({ authType: e.target.value })}
                    >
                      <option value="none">none</option>
                      <option value="bearer">Bearer (secret)</option>
                      <option value="basic">Basic (secret = base64 user:pass)</option>
                      <option value="header">Custom header (secret)</option>
                    </select>
                  </label>
                  {(selected.data.authType === "bearer" ||
                    selected.data.authType === "basic" ||
                    selected.data.authType === "header") && (
                    <SecretPicker
                      value={String(selected.data.secretId ?? "")}
                      onChange={(secretId) => patchSelected({ secretId })}
                    />
                  )}
                  {selected.data.authType === "header" && (
                    <label className="block text-xs text-[var(--text-muted)]">
                      Header name
                      <input
                        className="input mt-1 w-full"
                        value={String(selected.data.authHeader ?? "X-Api-Key")}
                        onChange={(e) => patchSelected({ authHeader: e.target.value })}
                      />
                    </label>
                  )}
                  <label className="block text-xs text-[var(--text-muted)]">
                    Headers JSON (no secrets)
                    <textarea
                      className="input mt-1 w-full font-mono"
                      rows={2}
                      value={
                        typeof selected.data.headers === "string"
                          ? selected.data.headers
                          : JSON.stringify(selected.data.headers ?? {}, null, 0)
                      }
                      onChange={(e) => {
                        try {
                          patchSelected({ headers: JSON.parse(e.target.value) });
                        } catch {
                          patchSelected({ headers: e.target.value });
                        }
                      }}
                      placeholder="{}"
                    />
                  </label>
                  <label className="block text-xs text-[var(--text-muted)]">
                    Timeout ms
                    <input
                      className="input mt-1 w-full"
                      value={String(selected.data.timeoutMs ?? 3000)}
                      onChange={(e) => patchSelected({ timeoutMs: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <input
                      type="checkbox"
                      checked={Number(selected.data.retry ?? 0) > 0}
                      onChange={(e) => patchSelected({ retry: e.target.checked ? 1 : 0 })}
                    />
                    Retry once on failure
                  </label>
                  <label className="block text-xs text-[var(--text-muted)]">
                    Wait prompt (while API runs)
                    <select
                      className="input mt-1 w-full"
                      value={String(selected.data.waitPromptId ?? "")}
                      onChange={(e) =>
                        patchSelected({
                          waitPromptId: e.target.value || undefined,
                          waitMoh: e.target.value ? undefined : selected.data.waitMoh,
                        })
                      }
                    >
                      <option value="">— none —</option>
                      {(prompts.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-[var(--text-muted)]">
                    Wait MOH class (if no prompt)
                    <select
                      className="input mt-1 w-full"
                      value={String(selected.data.waitMoh ?? "")}
                      disabled={Boolean(selected.data.waitPromptId)}
                      onChange={(e) => patchSelected({ waitMoh: e.target.value || undefined })}
                    >
                      <option value="">— none —</option>
                      {(mohClasses.data ?? []).map((m) => (
                        <option key={m.id} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-[var(--text-muted)]">
                    Body (non-GET)
                    <textarea
                      className="input mt-1 w-full"
                      rows={2}
                      value={String(selected.data.body ?? "")}
                      onChange={(e) => patchSelected({ body: e.target.value })}
                    />
                  </label>
                  <label className="block text-xs text-[var(--text-muted)]">
                    Mappings JSON (path/var)
                    <textarea
                      className="input mt-1 w-full font-mono"
                      rows={2}
                      value={JSON.stringify(selected.data.mappings ?? [])}
                      onChange={(e) => {
                        try {
                          patchSelected({ mappings: JSON.parse(e.target.value) });
                        } catch {
                          /* ignore invalid while typing */
                        }
                      }}
                    />
                  </label>
                  <button className="btn w-full text-sm" type="button" onClick={() => void testHttp()}>
                    Test HTTP
                  </button>
                  {httpTestResult && (
                    <pre className="max-h-24 overflow-auto rounded bg-[var(--bg-soft)] p-2 text-[10px]">
                      {httpTestResult}
                    </pre>
                  )}
                </>
              )}
              {selected.data.flowType === "condition" && (
                <>
                  <label className="block text-xs text-[var(--text-muted)]">
                    Variable
                    <input
                      className="input mt-1 w-full"
                      value={String(selected.data.variable ?? "")}
                      onChange={(e) => patchSelected({ variable: e.target.value })}
                      placeholder={
                        selected.data.op === "area_code" || selected.data.op === "country_code"
                          ? "empty = caller/DID"
                          : "var name"
                      }
                    />
                  </label>
                  <label className="block text-xs text-[var(--text-muted)]">
                    Operator
                    <select
                      className="input mt-1 w-full"
                      value={String(selected.data.op ?? "=")}
                      onChange={(e) => patchSelected({ op: e.target.value })}
                    >
                      <option value="=">=</option>
                      <option value="!=">!=</option>
                      <option value=">">&gt;</option>
                      <option value="<">&lt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="<=">&lt;=</option>
                      <option value="contains">contains</option>
                      <option value="starts_with">starts_with</option>
                      <option value="ends_with">ends_with</option>
                      <option value="empty">empty</option>
                      <option value="area_code">area_code</option>
                      <option value="country_code">country_code</option>
                    </select>
                  </label>
                  {selected.data.op !== "empty" && (
                    <label className="block text-xs text-[var(--text-muted)]">
                      Value
                      <input
                        className="input mt-1 w-full"
                        value={String(selected.data.value ?? "")}
                        onChange={(e) => patchSelected({ value: e.target.value })}
                        placeholder={
                          selected.data.op === "area_code"
                            ? "e.g. 212"
                            : selected.data.op === "country_code"
                              ? "e.g. 90"
                              : ""
                        }
                      />
                    </label>
                  )}
                  {(selected.data.op === "area_code" || selected.data.op === "country_code") && (
                    <p className="text-xs text-[var(--text-muted)]">
                      Uses caller or DID when variable is empty.
                    </p>
                  )}
                </>
              )}
              {selected.data.flowType === "set_var" && (
                <>
                  <label className="block text-xs text-[var(--text-muted)]">
                    Name
                    <input
                      className="input mt-1 w-full"
                      value={String(selected.data.name ?? "")}
                      onChange={(e) => patchSelected({ name: e.target.value })}
                    />
                  </label>
                  <label className="block text-xs text-[var(--text-muted)]">
                    Value
                    <input
                      className="input mt-1 w-full"
                      value={String(selected.data.value ?? "")}
                      onChange={(e) => patchSelected({ value: e.target.value })}
                    />
                  </label>
                </>
              )}
              {selected.data.flowType === "language" && (
                <label className="block text-xs text-[var(--text-muted)]">
                  Language
                  <input
                    className="input mt-1 w-full"
                    value={String(selected.data.language ?? "en")}
                    onChange={(e) => patchSelected({ language: e.target.value })}
                  />
                </label>
              )}
              {selected.data.flowType === "subflow" && (
                <label className="block text-xs text-[var(--text-muted)]">
                  Subflow
                  <select
                    className="input mt-1 w-full"
                    value={String(selected.data.flowId ?? "")}
                    onChange={(e) => patchSelected({ flowId: e.target.value })}
                  >
                    <option value="">— select —</option>
                    {(allFlows.data ?? []).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected.data.flowType === "time_condition" && (
                <label className="block text-xs text-[var(--text-muted)]">
                  Schedule
                  <select
                    className="input mt-1 w-full"
                    value={String(selected.data.scheduleId ?? "")}
                    onChange={(e) => patchSelected({ scheduleId: e.target.value })}
                  >
                    <option value="">— select —</option>
                    {(schedules.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Select a node to edit.</p>
          )}

          <div className="border-t border-[var(--border)] pt-3">
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
              <input className="input mt-1 w-full" value={simDtmf} onChange={(e) => setSimDtmf(e.target.value)} />
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
              <ol className="mt-2 space-y-1 text-xs text-[var(--text)]">
                {simSteps.map((s, i) => (
                  <li key={`${i}-${s}`} className="rounded bg-[var(--bg-soft)] px-2 py-1">
                    {i + 1}. {s}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
