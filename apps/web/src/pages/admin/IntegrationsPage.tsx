import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, CircleHelp, KeyRound, Pencil, Trash2, Webhook, Globe } from "lucide-react";
import { api } from "../../lib/api";
import { DestPicker } from "../../components/DestPicker";
import { Button, Checkbox, IconBtn, Modal, PageHeader, SectionCard, TextAreaField, TextField } from "../../components/ui";
import i18n, { tr } from "../../i18n";

function apiDocsHref(): string {
  return i18n.language.startsWith("tr")
    ? "https://www.monosip.com/tr/docs/integrations/#api"
    : "https://www.monosip.com/docs/integrations/#api";
}

const ALL_PERMS = ["cdr", "originate", "recordings", "announce"] as const;

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  key?: string | null;
  permissions: string[];
  allowedIps?: string[];
  prefixes?: string[];
  callsPerMinute?: number | null;
  maxConcurrent?: number | null;
  expiresAt?: string | null;
};

type IssuedKey = { key: string; barrier: string };

function listText(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function optionalLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n > 0 ? n : Number.NaN;
}

function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function KeyForm({
  apiKey,
  onClose,
  onReveal,
}: {
  apiKey: ApiKey | null;
  onClose: () => void;
  onReveal: (issued: IssuedKey) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(apiKey?.name ?? "");
  const [perms, setPerms] = useState<string[]>(apiKey?.permissions ?? ["cdr", "originate"]);
  const [ips, setIps] = useState((apiKey?.allowedIps ?? []).join("\n"));
  const [prefixes, setPrefixes] = useState((apiKey?.prefixes ?? []).join(", "));
  const [perMinute, setPerMinute] = useState(apiKey?.callsPerMinute ? String(apiKey.callsPerMinute) : "");
  const [concurrent, setConcurrent] = useState(apiKey?.maxConcurrent ? String(apiKey.maxConcurrent) : "");
  const [expires, setExpires] = useState(toLocalInput(apiKey?.expiresAt));

  function payload() {
    const callsPerMinute = optionalLimit(perMinute);
    const maxConcurrent = optionalLimit(concurrent);
    if (Number.isNaN(callsPerMinute) || Number.isNaN(maxConcurrent)) {
      throw new Error(tr("Enter a whole number, or leave the limit empty"));
    }
    if (expires.trim() && Number.isNaN(new Date(expires).getTime())) {
      throw new Error(tr("Enter a date, or leave expiry empty"));
    }
    return {
      name: name.trim(),
      permissions: perms,
      allowedIps: listText(ips),
      prefixes: listText(prefixes),
      callsPerMinute,
      maxConcurrent,
      expiresAt: expires.trim() ? new Date(expires).toISOString() : null,
    };
  }

  const save = useMutation({
    mutationFn: () => {
      const body = payload();
      return apiKey
        ? api.patch(`/api/v1/admin/api-keys/${apiKey.id}`, body)
        : api.post<IssuedKey>("/api/v1/admin/api-keys", body);
    },
    onSuccess: (row) => {
      const issued = row as IssuedKey;
      void qc.invalidateQueries({ queryKey: ["api-keys"] });
      if (issued.barrier && issued.key) onReveal(issued);
      else {
        toast.success(tr("Saved"));
        onClose();
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rotate = useMutation({
    mutationFn: () => api.post<IssuedKey>(`/api/v1/admin/api-keys/${apiKey?.id}/barrier`),
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: ["api-keys"] });
      onReveal(row);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <TextField
        className="sm:col-span-2"
        label={tr("Key name")}
        icon={KeyRound}
        hint={tr("The name is a label. The key and its barrier are created for you.")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <div className="flex flex-wrap items-end gap-2 text-sm sm:col-span-2">
        {ALL_PERMS.map((p) => (
          <Checkbox
            key={p}
            className="rounded-lg border border-[var(--border)] px-2"
            checked={perms.includes(p)}
            onCheckedChange={() =>
              setPerms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))
            }
            label={p}
          />
        ))}
      </div>
      <TextAreaField
        label={tr("Allowed IPs")}
        hint={tr("One IP or CIDR per line. Empty = any address.")}
        value={ips}
        onChange={(e) => setIps(e.target.value)}
      />
      <TextField
        label={tr("Number prefixes")}
        hint={tr("Comma-separated. Empty = any number.")}
        value={prefixes}
        onChange={(e) => setPrefixes(e.target.value)}
      />
      <TextField
        label={tr("Calls per minute")}
        hint={tr("Empty = no cap.")}
        inputMode="numeric"
        value={perMinute}
        onChange={(e) => setPerMinute(e.target.value)}
      />
      <TextField
        label={tr("Concurrent calls")}
        hint={tr("Empty = no cap.")}
        inputMode="numeric"
        value={concurrent}
        onChange={(e) => setConcurrent(e.target.value)}
      />
      <TextField
        className="sm:col-span-2"
        label={tr("Expires")}
        hint={tr("Empty = never.")}
        type="datetime-local"
        value={expires}
        onChange={(e) => setExpires(e.target.value)}
      />
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button variant="solid" type="submit" disabled={save.isPending}>
          {tr("Save")}
        </Button>
        {apiKey ? (
          <Button type="button" disabled={rotate.isPending} onClick={() => rotate.mutate()}>
            {tr("New barrier")}
          </Button>
        ) : null}
        <Button type="button" onClick={onClose}>
          {tr("Cancel")}
        </Button>
      </div>
    </form>
  );
}

function IssuedSecrets({ issued, onClose }: { issued: IssuedKey; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--text-muted)]">{tr("The barrier is shown only once. Copy it now.")}</p>
      <SecretLine label={tr("Key")} value={issued.key} />
      <SecretLine label={tr("Key barrier")} value={issued.barrier} />
      <Button variant="solid" type="button" onClick={onClose}>
        {tr("Done")}
      </Button>
    </div>
  );
}

function SecretLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-sm text-[var(--text-muted)]">{label}</div>
      <div className="flex items-start gap-2">
        <code className="block min-w-0 flex-1 break-all rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-xs">
          {value}
        </code>
        <IconBtn
          icon={Copy}
          label={tr("Copy")}
          onClick={() => {
            void navigator.clipboard.writeText(value).then(
              () => toast.success(tr("Copied")),
              () => toast.error(tr("Copy failed")),
            );
          }}
        />
      </div>
    </div>
  );
}

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
  const [editor, setEditor] = useState<ApiKey | "new" | null>(null);
  const [reveal, setReveal] = useState<IssuedKey | null>(null);
  const [wName, setWName] = useState("Website");
  const [wNumber, setWNumber] = useState("7001");
  const [wDestType, setWDestType] = useState("queue");
  const [wDestId, setWDestId] = useState<string | null>(null);
  const [wOrigins, setWOrigins] = useState("");
  const [wCallback, setWCallback] = useState(false);
  const [wPrefixes, setWPrefixes] = useState("05");
  const [hookOpen, setHookOpen] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [widgetView, setWidgetView] = useState<Widget | null>(null);

  const webhooks = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => api.get<Array<{ id: string; url: string; active: boolean }>>("/api/v1/admin/webhooks"),
  });
  const keys = useQuery({
    queryKey: ["api-keys"],
    queryFn: () =>
      api.get<ApiKey[]>("/api/v1/admin/api-keys"),
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
      setWidgetOpen(false);
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
    onSuccess: () => {
      setHookOpen(false);
      void qc.invalidateQueries({ queryKey: ["webhooks"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Webhook}
        title={t("nav.integrations")}
        tone="blue"
        description={tr("Webhooks, API keys, widgets")}
      />
      <SectionCard
        title={tr("Webhooks")}
        icon={Webhook}
        tone="coral"
        flush
        actions={
          <Button type="button" variant="solid" onClick={() => setHookOpen(true)}>
            {t("common.create")}
          </Button>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th className="col-grow">{tr("Webhook URL")}</th>
              <th className="col-actions">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.data?.map((w) => (
              <tr key={w.id}>
                <td className="col-grow truncate">{w.url}</td>
                <td className="col-actions">
                  <div className="btn-icon-row">
                    <Button
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
                    </Button>
                    <IconBtn
                      icon={Trash2}
                      label={t("common.delete")}
                      danger
                      onClick={() =>
                        void api.delete(`/api/v1/admin/webhooks/${w.id}`).then(() => {
                          toast.success(tr("Webhook deleted"));
                          void qc.invalidateQueries({ queryKey: ["webhooks"] });
                        })
                      }
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
      <Modal open={hookOpen} onOpenChange={setHookOpen} title={tr("Webhooks")}>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            addHook.mutate();
          }}
        >
          <TextField
            label={tr("Webhook URL")}
            icon={Webhook}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button variant="solid" type="submit">
            {t("common.create")}
          </Button>
        </form>
      </Modal>
      <SectionCard
        title={tr("Website call widgets")}
        icon={Globe}
        tone="cyan"
        flush
        actions={
          <Button type="button" variant="solid" onClick={() => setWidgetOpen(true)}>
            {tr("Create widget")}
          </Button>
        }
      >
        <p className="px-4 pb-3 text-sm text-[var(--text-muted)]">
          {tr("Embed a “Call us” button on any site. Visitors talk over WebRTC or leave a number for call-back.")}
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>{tr("Name")}</th>
              <th>{tr("Virtual DID")}</th>
              <th className="col-grow">{tr("Key")}</th>
              <th className="col-actions">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(widgets.data ?? []).map((w) => (
              <tr key={w.id}>
                <td>{w.name}{!w.enabled ? " (disabled)" : ""}</td>
                <td className="font-mono">{w.number}</td>
                <td className="col-grow font-mono text-xs">{w.publicKey}</td>
                <td className="col-actions">
                  <div className="btn-icon-row">
                    <IconBtn icon={Pencil} label={tr("Edit")} onClick={() => setWidgetView(w)} />
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
      <Modal open={widgetOpen} onOpenChange={setWidgetOpen} title={tr("Create widget")} maxWidth="44rem">
        <form
          className="grid gap-3 sm:grid-cols-2"
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
          <Checkbox checked={wCallback} onCheckedChange={setWCallback} label={tr("Enable call-back form")} />
          <TextField
            label={tr("Call-back prefixes")}
            value={wPrefixes}
            onChange={(e) => setWPrefixes(e.target.value)}
            disabled={!wCallback}
            hint="e.g. 05,90"
          />
          <Button variant="solid" className="sm:col-span-2" type="submit" disabled={addWidget.isPending}>
            {tr("Create widget")}
          </Button>
        </form>
      </Modal>
      {widgetView ? (
        <Modal open onOpenChange={(next) => { if (!next) setWidgetView(null); }} title={widgetView.name} maxWidth="44rem">
          <p className="mb-2 text-sm text-[var(--text-muted)]">
            {tr("· DID")} {widgetView.number}
          </p>
          <code className="block break-all rounded-lg bg-[var(--bg)] p-2 font-mono text-xs">
            {`<script src="${window.location.origin}/widget.js" data-widget="${widgetView.publicKey}" async></script>`}
          </code>
          <IconBtn
            className="mt-2"
            icon={Copy}
            label={tr("Copy embed")}
            onClick={() => {
              void navigator.clipboard.writeText(
                `<script src="${window.location.origin}/widget.js" data-widget="${widgetView.publicKey}" async></script>`,
              );
              toast.success(tr("Embed code copied"));
            }}
          />
        </Modal>
      ) : null}
      <SectionCard
        title={tr("API keys")}
        icon={KeyRound}
        tone="blue"
        flush
        actions={
          <Button
            type="button"
            variant="solid"
            onClick={() => {
              setReveal(null);
              setEditor("new");
            }}
          >
            {tr("Add key")}
          </Button>
        }
      >
        <p className="px-4 pb-3 text-sm text-[var(--text-muted)]">
          {tr("Add as many keys as you need. Each one keeps its own permissions.")}
        </p>
        <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{tr("Name")}</th>
              <th>{tr("Key")}</th>
              <th className="col-grow">{tr("Permissions")}</th>
              <th className="col-actions">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(keys.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="text-[var(--text-muted)]">
                  {tr("No API keys yet.")}
                </td>
              </tr>
            ) : (
              keys.data?.map((k) => {
                const kp = k.permissions ?? [];
                return (
                  <tr key={k.id}>
                    <td>{k.name}</td>
                    <td className="font-mono whitespace-nowrap">{k.key || k.keyPrefix}</td>
                    <td className="text-[var(--text-muted)]">{kp.length ? kp.join(", ") : "—"}</td>
                    <td className="col-actions">
                      <span className="inline-flex items-center gap-3">
                        <IconBtn
                          icon={Pencil}
                          label={tr("Edit")}
                          onClick={() => {
                            setReveal(null);
                            setEditor(k);
                          }}
                        />
                        <IconBtn
                          icon={Trash2}
                          label={tr("Revoke")}
                          danger
                          onClick={() => {
                            if (editor !== "new" && editor?.id === k.id) setEditor(null);
                            void api.delete(`/api/v1/admin/api-keys/${k.id}`).then(() =>
                              qc.invalidateQueries({ queryKey: ["api-keys"] }),
                            );
                          }}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </SectionCard>
      <Modal
        open={editor !== null || reveal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditor(null);
            setReveal(null);
          }
        }}
        title={reveal ? tr("Key barrier") : editor === "new" ? tr("Add key") : tr("Edit")}
        maxWidth="44rem"
        dismissable={!reveal}
        headerAside={
          <a
            href={apiDocsHref()}
            target="_blank"
            rel="noreferrer"
            aria-label={tr("API documentation")}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] no-underline hover:bg-[var(--bg-soft)] hover:text-[var(--text)]"
          >
            <CircleHelp size={18} strokeWidth={2.25} />
          </a>
        }
      >
        {reveal ? (
          <IssuedSecrets issued={reveal} onClose={() => setReveal(null)} />
        ) : editor ? (
          <KeyForm
            key={editor === "new" ? "new" : editor.id}
            apiKey={editor === "new" ? null : editor}
            onClose={() => setEditor(null)}
            onReveal={(issued) => {
              setEditor(null);
              setReveal(issued);
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
