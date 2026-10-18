import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { DestPicker } from "../../components/DestPicker";

const ALL_PERMS = ["cdr", "originate", "recordings"] as const;

type Widget = {
  id: string;
  publicKey: string;
  name: string;
  number: string;
  destType: string;
  destId: string | null;
  allowedOrigins: string[];
  browserCallEnabled: boolean;
  callbackEnabled: boolean;
  callbackPrefixes: string[];
  enabled: boolean;
  buttonText: string;
};

export function IntegrationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [url, setUrl] = useState("https://example.com/webhook");
  const [keyName, setKeyName] = useState("CRM");
  const [perms, setPerms] = useState<string[]>(["cdr", "originate"]);
  const [wName, setWName] = useState("Website");
  const [wNumber, setWNumber] = useState("7001");
  const [wDestType, setWDestType] = useState("queue");
  const [wDestId, setWDestId] = useState<string | null>(null);
  const [wOrigins, setWOrigins] = useState("");
  const [wCallback, setWCallback] = useState(false);
  const [wPrefixes, setWPrefixes] = useState("05");

  const webhooks = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => api.get<Array<{ id: string; url: string; active: boolean }>>("/api/v1/admin/webhooks"),
  });
  const keys = useQuery({
    queryKey: ["api-keys"],
    queryFn: () =>
      api.get<Array<{ id: string; name: string; keyPrefix: string; permissions: string[] }>>(
        "/api/v1/admin/api-keys",
      ),
  });
  const widgets = useQuery({
    queryKey: ["widgets"],
    queryFn: () => api.get<Widget[]>("/api/v1/admin/widgets"),
  });

  const addWidget = useMutation({
    mutationFn: () =>
      api.post<Widget>("/api/v1/admin/widgets", {
        name: wName,
        number: wNumber,
        destType: wDestType,
        destId: wDestId,
        allowedOrigins: wOrigins
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
        browserCallEnabled: true,
        callbackEnabled: wCallback,
        callbackPrefixes: wPrefixes
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
        enabled: true,
      }),
    onSuccess: (row) => {
      toast.success(`Widget ${row.publicKey} created`);
      void qc.invalidateQueries({ queryKey: ["widgets"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addHook = useMutation({
    mutationFn: () =>
      api.post("/api/v1/admin/webhooks", {
        url,
        events: ["call.ended", "call.missed"],
        active: true,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const addKey = useMutation({
    mutationFn: () =>
      api.post<{ key: string }>("/api/v1/admin/api-keys", { name: keyName, permissions: perms }),
    onSuccess: (r) => {
      toast.success(`API key: ${r.key}`);
      void qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  function togglePerm(p: string) {
    setPerms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  async function saveKeyPerms(id: string, permissions: string[]) {
    await api.patch(`/api/v1/admin/api-keys/${id}`, { permissions });
    toast.success("Permissions updated");
    void qc.invalidateQueries({ queryKey: ["api-keys"] });
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{t("nav.integrations")}</h1>
      <section className="card p-4">
        <h2 className="mb-3 font-medium">Webhooks</h2>
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addHook.mutate();
          }}
        >
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn btn-primary" type="submit">
            {t("common.create")}
          </button>
        </form>
        <ul className="space-y-2">
          {webhooks.data?.map((w) => (
            <li
              key={w.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span className="truncate">{w.url}</span>
              <button
                className="btn shrink-0"
                type="button"
                onClick={() =>
                  void api
                    .post<{ ok: boolean; status?: number; error?: string }>(
                      `/api/v1/admin/webhooks/${w.id}/test`,
                    )
                    .then((r) =>
                      toast[r.ok ? "success" : "error"](
                        r.ok ? `Test OK (${r.status})` : r.error ?? "Test failed",
                      ),
                    )
                }
              >
                Test
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="mb-1 font-medium">Website call widgets</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Embed a “Call us” button on any site. Visitors talk over WebRTC or leave a number for
          call-back. Softphone audio uses TURNS on port 443 when Compose nginx + coturn are running.
        </p>
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            addWidget.mutate();
          }}
        >
          <input
            className="input"
            placeholder="Name"
            value={wName}
            onChange={(e) => setWName(e.target.value)}
            required
          />
          <input
            className="input font-mono"
            placeholder="Virtual DID (e.g. 7001)"
            value={wNumber}
            onChange={(e) => setWNumber(e.target.value.replace(/\D/g, ""))}
            required
          />
          <div className="sm:col-span-2">
            <DestPicker
              destType={wDestType}
              destId={wDestId}
              onChange={(t, id) => {
                setWDestType(t);
                setWDestId(id);
              }}
            />
          </div>
          <textarea
            className="input sm:col-span-2 min-h-[64px]"
            placeholder="Allowed websites (one host per line, e.g. www.example.com or *.example.com). Empty = any."
            value={wOrigins}
            onChange={(e) => setWOrigins(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={wCallback} onChange={(e) => setWCallback(e.target.checked)} />
            Enable call-back form
          </label>
          <input
            className="input font-mono"
            placeholder="Call-back prefixes (05,90)"
            value={wPrefixes}
            onChange={(e) => setWPrefixes(e.target.value)}
            disabled={!wCallback}
          />
          <button className="btn btn-primary sm:col-span-2" type="submit" disabled={addWidget.isPending}>
            Create widget
          </button>
        </form>
        <ul className="space-y-3">
          {(widgets.data ?? []).map((w) => {
            const embed = `<script src="${window.location.origin}/widget.js" data-widget="${w.publicKey}" async></script>`;
            return (
              <li key={w.id} className="rounded border border-[var(--border)] p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>{w.name}</strong> · DID {w.number} ·{" "}
                    <span className="font-mono text-[var(--text-muted)]">{w.publicKey}</span>
                    {!w.enabled ? " (disabled)" : ""}
                  </span>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() =>
                      void api.delete(`/api/v1/admin/widgets/${w.id}`).then(() => {
                        toast.message("Widget deleted");
                        void qc.invalidateQueries({ queryKey: ["widgets"] });
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
                <code className="block break-all rounded bg-[var(--bg-muted)] p-2 text-xs">{embed}</code>
                <button
                  className="btn mt-2"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(embed);
                    toast.success("Embed code copied");
                  }}
                >
                  Copy embed
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="font-medium">API keys</h2>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addKey.mutate();
          }}
        >
          <input className="input max-w-xs" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {ALL_PERMS.map((p) => (
              <label key={p} className="flex items-center gap-1">
                <input type="checkbox" checked={perms.includes(p)} onChange={() => togglePerm(p)} />
                {p}
              </label>
            ))}
          </div>
          <button className="btn btn-primary" type="submit">
            {t("common.create")}
          </button>
        </form>
        <ul className="space-y-3">
          {keys.data?.map((k) => {
            const kp = (k.permissions ?? []) as string[];
            return (
              <li key={k.id} className="rounded border border-[var(--border)] p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono">
                    {k.name} · {k.keyPrefix}…
                  </span>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() =>
                      void api.delete(`/api/v1/admin/api-keys/${k.id}`).then(() =>
                        qc.invalidateQueries({ queryKey: ["api-keys"] }),
                      )
                    }
                  >
                    Revoke
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALL_PERMS.map((p) => (
                    <label key={p} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={kp.includes(p)}
                        onChange={() => {
                          const next = kp.includes(p) ? kp.filter((x) => x !== p) : [...kp, p];
                          void saveKeyPerms(k.id, next);
                        }}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
