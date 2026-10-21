import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, KeyRound, Trash2, Webhook, Globe } from "lucide-react";
import { api } from "../../lib/api";
import { DestPicker } from "../../components/DestPicker";
import { IconBtn, PageHeader, SectionCard, TextAreaField, TextField } from "../../components/ui";
import { tr } from "../../i18n";

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
      toast.success(tr("Widget {{v0}} created", { v0: row.publicKey }));
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
      toast.success(tr("API key: {{v0}}", { v0: r.key }));
      void qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  function togglePerm(p: string) {
    setPerms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  async function saveKeyPerms(id: string, permissions: string[]) {
    await api.patch(`/api/v1/admin/api-keys/${id}`, { permissions });
    toast.success(tr("Permissions updated"));
    void qc.invalidateQueries({ queryKey: ["api-keys"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Webhook}
        title={t("nav.integrations")}
        tone="blue"
        description={tr("Webhooks, API keys, and website call widgets")}
      />
      <SectionCard title={tr("Webhooks")} icon={Webhook} tone="coral">
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            addHook.mutate();
          }}
        >
          <TextField
            className="min-w-[16rem] flex-1"
            label={tr("Webhook URL")}
            icon={Webhook}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
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
                        r.ok ? tr("Test OK ({{status}})", { status: r.status ?? "" }) : r.error ?? tr("Test failed"),
                      ),
                    )
                }
              >
                {tr("Test")}
              </button>
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard title={tr("Website call widgets")} icon={Globe} tone="cyan">
        <p className="text-sm text-[var(--text-muted)]">
          {tr("Embed a “Call us” button on any site. Visitors talk over WebRTC or leave a number for call-back.")}
        </p>
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            addWidget.mutate();
          }}
        >
          <TextField label={tr("Name")} value={wName} onChange={(e) => setWName(e.target.value)} required />
          <TextField
            label={tr("Virtual DID")}
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
          <TextAreaField
            className="sm:col-span-2"
            label={tr("Allowed websites")}
            hint={tr("One host per line (www.example.com or *.example.com). Empty = any.")}
            value={wOrigins}
            onChange={(e) => setWOrigins(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={wCallback} onChange={(e) => setWCallback(e.target.checked)} />
            {tr("Enable call-back form")}
          </label>
          <TextField
            label={tr("Call-back prefixes")}
            value={wPrefixes}
            onChange={(e) => setWPrefixes(e.target.value)}
            disabled={!wCallback}
            hint="e.g. 05,90"
          />
          <button className="btn btn-primary sm:col-span-2" type="submit" disabled={addWidget.isPending}>
            {tr("Create widget")}
          </button>
        </form>
        <ul className="space-y-3">
          {(widgets.data ?? []).map((w) => {
            const embed = `<script src="${window.location.origin}/widget.js" data-widget="${w.publicKey}" async></script>`;
            return (
              <li key={w.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)]/40 p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>{w.name}</strong> {tr("· DID")} {w.number} ·{" "}
                    <span className="font-mono text-[var(--text-muted)]">{w.publicKey}</span>
                    {!w.enabled ? " (disabled)" : ""}
                  </span>
                  <IconBtn
                    icon={Trash2}
                    label={tr("Delete")}
                    danger
                    onClick={() =>
                      void api.delete(`/api/v1/admin/widgets/${w.id}`).then(() => {
                        toast.message(tr("Widget deleted"));
                        void qc.invalidateQueries({ queryKey: ["widgets"] });
                      })
                    }
                  />
                </div>
                <code className="block break-all rounded-lg bg-[var(--bg)] p-2 font-mono text-xs">{embed}</code>
                <IconBtn
                  className="mt-2"
                  icon={Copy}
                  label={tr("Copy embed")}
                  onClick={() => {
                    void navigator.clipboard.writeText(embed);
                    toast.success(tr("Embed code copied"));
                  }}
                />
              </li>
            );
          })}
        </ul>
      </SectionCard>
      <SectionCard title={tr("API keys")} icon={KeyRound} tone="blue">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addKey.mutate();
          }}
        >
          <TextField
            className="max-w-xs"
            label={tr("Key name")}
            icon={KeyRound}
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2 self-end text-sm">
            {ALL_PERMS.map((p) => (
              <label key={p} className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1">
                <input type="checkbox" checked={perms.includes(p)} onChange={() => togglePerm(p)} />
                {p}
              </label>
            ))}
          </div>
          <button className="btn btn-primary self-end" type="submit">
            {t("common.create")}
          </button>
        </form>
        <ul className="space-y-3">
          {keys.data?.map((k) => {
            const kp = (k.permissions ?? []) as string[];
            return (
              <li key={k.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)]/40 p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono">
                    {k.name} · {k.keyPrefix}…
                  </span>
                  <IconBtn
                    icon={Trash2}
                    label={tr("Revoke")}
                    danger
                    onClick={() =>
                      void api.delete(`/api/v1/admin/api-keys/${k.id}`).then(() =>
                        qc.invalidateQueries({ queryKey: ["api-keys"] }),
                      )
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALL_PERMS.map((p) => (
                    <label key={p} className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1">
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
      </SectionCard>
    </div>
  );
}
