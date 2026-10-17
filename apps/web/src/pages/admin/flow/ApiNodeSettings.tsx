import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../../../lib/api";
import type { FlowNodeData } from "./FlowNodes";
import { ExitsHint, Field, SegmentedSelect, SettingsSection } from "./settingsUi";

type Mapping = { path: string; var: string };
type HeaderRow = { key: string; value: string };

const METHODS = [
  { value: "GET", label: "GET" },
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
  { value: "PATCH", label: "PATCH" },
  { value: "DELETE", label: "DELETE" },
] as const;

function jsonPath(obj: unknown, pathExpr: string): unknown {
  let p = pathExpr.trim();
  if (p.startsWith("$.")) p = p.slice(2);
  else if (p.startsWith("$")) p = p.slice(1);
  if (!p) return obj;
  return p.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function headersToRows(headers: unknown): HeaderRow[] {
  if (!headers) return [{ key: "", value: "" }];
  let obj: Record<string, string> = {};
  if (typeof headers === "string") {
    try {
      obj = JSON.parse(headers) as Record<string, string>;
    } catch {
      return [{ key: "", value: "" }];
    }
  } else if (typeof headers === "object") {
    obj = headers as Record<string, string>;
  }
  const rows = Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
  return rows.length ? rows : [{ key: "", value: "" }];
}

function rowsToHeaders(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    out[k] = r.value;
  }
  return out;
}

function mappingsFromData(raw: unknown): Mapping[] {
  if (Array.isArray(raw)) {
    return raw
      .map((m) => ({
        path: String((m as Mapping).path ?? ""),
        var: String((m as Mapping).var ?? ""),
      }))
      .filter((m) => m.path || m.var);
  }
  return [];
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
      <Field label="Secret">
        <select className="input w-full" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— select secret —</option>
          {(secrets.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
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

export function ApiNodeSettings({
  data,
  patch,
  prompts,
  mohClasses,
}: {
  data: FlowNodeData;
  patch: (p: Partial<FlowNodeData>) => void;
  prompts: Array<{ id: string; name: string }>;
  mohClasses: Array<{ id: string; name: string }>;
}) {
  const method = String(data.method ?? "GET").toUpperCase();
  const needsBody = method === "POST" || method === "PUT" || method === "PATCH";
  const headerRows = useMemo(() => headersToRows(data.headers), [data.headers]);
  const mappings = useMemo(() => {
    const m = mappingsFromData(data.mappings);
    return m.length ? m : [{ path: "", var: "" }];
  }, [data.mappings]);

  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<number | null>(null);
  const [testBody, setTestBody] = useState("");
  const [mappedPreview, setMappedPreview] = useState<Record<string, string> | null>(null);

  function setHeaders(rows: HeaderRow[]) {
    patch({ headers: rowsToHeaders(rows) });
  }

  function setMappings(rows: Mapping[]) {
    patch({ mappings: rows.filter((m) => m.path.trim() || m.var.trim()) });
  }

  async function runTest() {
    const url = String(data.url ?? "").trim();
    if (!url) {
      toast.error("URL required");
      return;
    }
    setTesting(true);
    setMappedPreview(null);
    try {
      const headers = rowsToHeaders(headerRows);
      const authType = String(data.authType ?? "none");
      const r = await api.post<{ status: number; body: string }>("/api/v1/admin/flows/test-http", {
        method,
        url,
        headers,
        body: needsBody && data.body ? String(data.body) : undefined,
        timeoutMs: Number(data.timeoutMs ?? 3000),
        authType: authType !== "none" ? authType : undefined,
        secretId: data.secretId ? String(data.secretId) : undefined,
        authHeader: data.authHeader ? String(data.authHeader) : undefined,
      });
      setTestStatus(r.status);
      setTestBody(r.body);
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(r.body);
      } catch {
        parsed = null;
      }
      if (parsed && typeof parsed === "object") {
        const preview: Record<string, string> = { http_status: String(r.status) };
        for (const m of mappingsFromData(data.mappings)) {
          if (!m.var.trim()) continue;
          preview[m.var] = String(jsonPath(parsed, m.path) ?? "");
        }
        setMappedPreview(preview);
      } else {
        setMappedPreview({ http_status: String(r.status) });
      }
      toast.success(`HTTP ${r.status}`);
    } catch (e) {
      setTestStatus(null);
      setTestBody((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-3">
      <ExitsHint exits={["success", "error"]} />

      <SettingsSection
        step={1}
        title="Request"
        hint={`How the call sends the HTTP request. Use $caller, $pin, or {{caller}} in URL / body.`}
      >
        <Field label="Method" hint="Select GET, POST, or another verb">
          <SegmentedSelect
            aria-label="HTTP method"
            value={method}
            options={[...METHODS]}
            onChange={(v) => patch({ method: v })}
          />
        </Field>

        <Field label="URL">
          <input
            className="input w-full font-mono text-xs"
            value={String(data.url ?? "")}
            onChange={(e) => patch({ url: e.target.value })}
            placeholder="https://api.example.com/lookup?phone=$caller&pin=$pin"
          />
        </Field>

        {needsBody && (
          <Field label="Body" hint="JSON or text — shown for POST / PUT / PATCH">
            <textarea
              className="input w-full font-mono text-xs"
              rows={4}
              value={String(data.body ?? "")}
              onChange={(e) => patch({ body: e.target.value })}
              placeholder={'{\n  "phone": "{{caller}}"\n}'}
            />
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Timeout (ms)">
            <input
              className="input w-full"
              type="number"
              min={500}
              max={10000}
              value={Number(data.timeoutMs ?? 3000)}
              onChange={(e) =>
                patch({ timeoutMs: Math.max(500, Math.min(10000, Number(e.target.value) || 3000)) })
              }
            />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-xs text-[var(--text)]">
            <input
              type="checkbox"
              checked={Number(data.retry ?? 0) > 0}
              onChange={(e) => patch({ retry: e.target.checked ? 1 : 0 })}
            />
            Retry once on failure
          </label>
        </div>
      </SettingsSection>

      <SettingsSection step={2} title="Auth & headers" hint="Secrets stay encrypted — never stored in the flow JSON.">
        <Field label="Auth type">
          <select
            className="input w-full"
            value={String(data.authType ?? "none")}
            onChange={(e) => patch({ authType: e.target.value })}
          >
            <option value="none">None</option>
            <option value="bearer">Bearer token</option>
            <option value="basic">Basic (secret = base64 user:pass)</option>
            <option value="header">Custom header + secret</option>
          </select>
        </Field>
        {(data.authType === "bearer" || data.authType === "basic" || data.authType === "header") && (
          <SecretPicker
            value={String(data.secretId ?? "")}
            onChange={(secretId) => patch({ secretId })}
          />
        )}
        {data.authType === "header" && (
          <Field label="Header name">
            <input
              className="input w-full"
              value={String(data.authHeader ?? "X-Api-Key")}
              onChange={(e) => patch({ authHeader: e.target.value })}
            />
          </Field>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text)]">Extra headers</span>
            <button
              className="btn text-xs"
              type="button"
              onClick={() => setHeaders([...headerRows, { key: "", value: "" }])}
            >
              + Header
            </button>
          </div>
          {headerRows.map((row, i) => (
            <div key={`h-${i}`} className="flex gap-1">
              <input
                className="input flex-1 font-mono text-xs"
                placeholder="Name"
                value={row.key}
                onChange={(e) => {
                  const next = headerRows.map((r, idx) =>
                    idx === i ? { ...r, key: e.target.value } : r,
                  );
                  setHeaders(next);
                }}
              />
              <input
                className="input flex-[1.4] font-mono text-xs"
                placeholder="Value"
                value={row.value}
                onChange={(e) => {
                  const next = headerRows.map((r, idx) =>
                    idx === i ? { ...r, value: e.target.value } : r,
                  );
                  setHeaders(next);
                }}
              />
              <button
                className="btn"
                type="button"
                title="Remove"
                onClick={() => setHeaders(headerRows.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        step={3}
        title="While waiting"
        hint="Optional audio while the HTTP call runs (caller hears this)."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prompt">
            <select
              className="input w-full"
              value={String(data.waitPromptId ?? "")}
              onChange={(e) =>
                patch({
                  waitPromptId: e.target.value || undefined,
                  waitMoh: e.target.value ? undefined : data.waitMoh,
                })
              }
            >
              <option value="">— none —</option>
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Music on hold" hint="Used only if no prompt">
            <select
              className="input w-full"
              value={String(data.waitMoh ?? "")}
              disabled={Boolean(data.waitPromptId)}
              onChange={(e) => patch({ waitMoh: e.target.value || undefined })}
            >
              <option value="">— none —</option>
              {mohClasses.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        step={4}
        title="Response → variables"
        hint="Map JSON fields into flow variables. Status is always saved as http_status."
      >
        <div className="flex justify-end">
          <button
            className="btn text-xs"
            type="button"
            onClick={() => setMappings([...mappings, { path: "", var: "" }])}
          >
            + Mapping
          </button>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-1 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
          <span>JSON path</span>
          <span />
          <span>Variable name</span>
          <span />
        </div>
        {mappings.map((row, i) => (
          <div key={`m-${i}`} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1">
            <input
              className="input font-mono text-xs"
              placeholder="$.data.agent"
              value={row.path}
              onChange={(e) => {
                const next = mappings.map((r, idx) =>
                  idx === i ? { ...r, path: e.target.value } : r,
                );
                setMappings(next);
              }}
            />
            <span className="text-xs text-[var(--text-muted)]">→</span>
            <input
              className="input font-mono text-xs"
              placeholder="agent"
              value={row.var}
              onChange={(e) => {
                const next = mappings.map((r, idx) =>
                  idx === i ? { ...r, var: e.target.value } : r,
                );
                setMappings(next);
              }}
            />
            <button
              className="btn"
              type="button"
              title="Remove"
              onClick={() => setMappings(mappings.filter((_, idx) => idx !== i))}
            >
              ×
            </button>
          </div>
        ))}
      </SettingsSection>

      <SettingsSection
        step={5}
        title="Test"
        hint="Sends the real request (auth included). Replace {{var}} with sample values for a trial."
      >
        <button
          className="btn btn-primary w-full text-sm"
          type="button"
          disabled={testing}
          onClick={() => void runTest()}
        >
          {testing ? "Sending…" : `Send ${method} request`}
        </button>
        {(testStatus !== null || testBody) && (
          <div className="space-y-2">
            {testStatus !== null && (
              <div className="text-xs">
                Status:{" "}
                <span
                  className={
                    testStatus >= 200 && testStatus < 300 ? "badge badge-ok" : "badge badge-err"
                  }
                >
                  {testStatus}
                </span>
              </div>
            )}
            {mappedPreview && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-[var(--text-muted)]">
                  Mapped variables
                </div>
                <pre className="max-h-28 overflow-auto rounded bg-[var(--bg)] p-2 text-[10px]">
                  {JSON.stringify(mappedPreview, null, 2)}
                </pre>
              </div>
            )}
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase text-[var(--text-muted)]">
                Raw response
              </div>
              <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded bg-[var(--bg)] p-2 text-[10px]">
                {testBody.slice(0, 4000)}
              </pre>
            </div>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
