import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Cable, Link2, Plus } from "lucide-react";
import { api } from "../../lib/api";
import { PageHeader, SectionCard, SelectField, TextAreaField, TextField } from "../../components/ui";

type Trunk = {
  id: string;
  name: string;
  host: string;
  port: number;
  transport: string;
  authType: string;
  username?: string | null;
  fromDomain?: string | null;
  outboundProxy?: string | null;
  register?: boolean;
  codecs?: string[];
  maxChannels?: number;
  notes?: string | null;
  enabled: boolean;
  status: string;
  latencyMs?: number | null;
};

type InboundRoute = {
  id: string;
  did: string;
  destType: string;
  destId: string | null;
};

type TrunkForm = {
  name: string;
  host: string;
  port: number;
  transport: "udp" | "tcp" | "tls";
  authType: "userpass" | "ip";
  username: string;
  secret: string;
  fromDomain: string;
  outboundProxy: string;
  register: boolean;
  codecs: string;
  maxChannels: number;
  notes: string;
  enabled: boolean;
};

const emptyForm = (): TrunkForm => ({
  name: "",
  host: "",
  port: 5060,
  transport: "udp",
  authType: "userpass",
  username: "",
  secret: "",
  fromDomain: "",
  outboundProxy: "",
  register: true,
  codecs: "ulaw,alaw",
  maxChannels: 10,
  notes: "",
  enabled: true,
});

function trunkToForm(tr: Trunk): TrunkForm {
  return {
    name: tr.name,
    host: tr.host,
    port: tr.port ?? 5060,
    transport: (tr.transport as TrunkForm["transport"]) || "udp",
    authType: (tr.authType as TrunkForm["authType"]) || "userpass",
    username: tr.username ?? "",
    secret: "",
    fromDomain: tr.fromDomain ?? "",
    outboundProxy: tr.outboundProxy ?? "",
    register: tr.register !== false,
    codecs: (tr.codecs ?? ["ulaw", "alaw"]).join(","),
    maxChannels: tr.maxChannels ?? 10,
    notes: tr.notes ?? "",
    enabled: tr.enabled,
  };
}

function formPayload(form: TrunkForm, forCreate: boolean) {
  const codecs = form.codecs
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const body: Record<string, unknown> = {
    name: form.name.trim(),
    host: form.host.trim(),
    port: form.port,
    transport: form.transport,
    authType: form.authType,
    username: form.authType === "userpass" ? form.username.trim() || null : null,
    fromDomain: form.fromDomain.trim() || null,
    outboundProxy: form.outboundProxy.trim() || null,
    register: form.authType === "userpass" ? form.register : false,
    codecs: codecs.length ? codecs : ["ulaw", "alaw"],
    maxChannels: form.maxChannels,
    notes: form.notes.trim() || null,
    enabled: form.enabled,
  };
  if (form.secret.trim()) body.secret = form.secret;
  else if (forCreate && form.authType === "userpass") body.secret = form.secret;
  return body;
}

export function TrunksPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<TrunkForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["trunks"],
    queryFn: () => api.get<Trunk[]>("/api/v1/admin/trunks"),
  });
  const inbound = useQuery({
    queryKey: ["routes-inbound"],
    queryFn: () => api.get<InboundRoute[]>("/api/v1/admin/routes/inbound"),
  });

  const didsByNote = useMemo(() => {
    const routes = inbound.data ?? [];
    return routes.map((r) => r.did).filter(Boolean);
  }, [inbound.data]);

  const save = useMutation({
    mutationFn: async () => {
      const body = formPayload(form, !editingId);
      if (editingId) return api.patch(`/api/v1/admin/trunks/${editingId}`, body);
      return api.post("/api/v1/admin/trunks", body);
    },
    onSuccess: () => {
      toast.success(editingId ? t("common.save") : t("trunks.add"));
      setForm(emptyForm());
      setEditingId(null);
      void qc.invalidateQueries({ queryKey: ["trunks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit(tr: Trunk) {
    setEditingId(tr.id);
    setForm(trunkToForm(tr));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function toggle(tr: Trunk) {
    await api.patch(`/api/v1/admin/trunks/${tr.id}`, { enabled: !tr.enabled });
    void qc.invalidateQueries({ queryKey: ["trunks"] });
  }

  async function refreshStatus(id: string) {
    try {
      const s = await api.get<{ status: string; latencyMs?: number }>(
        `/api/v1/admin/trunks/${id}/status`,
      );
      toast.message(`${s.status}${s.latencyMs != null ? ` · ${s.latencyMs}ms` : ""}`);
      void qc.invalidateQueries({ queryKey: ["trunks"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const set = <K extends keyof TrunkForm>(key: K, value: TrunkForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        icon={Cable}
        title={t("trunks.title")}
        tone="coral"
        description={t("trunks.blurb")}
      />

      <SectionCard
        title={editingId ? t("trunks.edit") : t("trunks.addProvider")}
        icon={Plus}
        tone="cyan"
        actions={
          editingId ? (
            <button className="btn" type="button" onClick={cancelEdit}>
              {t("common.cancel")}
            </button>
          ) : null
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label={t("trunks.name")}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Netgsm / Turkcell / Custom"
            required
          />
          <TextField
            label={t("trunks.host")}
            className="font-mono"
            value={form.host}
            onChange={(e) => set("host", e.target.value)}
            placeholder="sip.provider.example"
            required
          />
          <TextField
            label={t("trunks.port")}
            type="number"
            min={1}
            max={65535}
            value={form.port}
            onChange={(e) => set("port", Number(e.target.value) || 5060)}
          />
          <SelectField
            label={t("trunks.transport")}
            value={form.transport}
            onChange={(e) => set("transport", e.target.value as TrunkForm["transport"])}
          >
            <option value="udp">UDP</option>
            <option value="tcp">TCP</option>
            <option value="tls">TLS</option>
          </SelectField>
          <SelectField
            label={t("trunks.authType")}
            value={form.authType}
            onChange={(e) => set("authType", e.target.value as TrunkForm["authType"])}
          >
            <option value="userpass">{t("trunks.authUserpass")}</option>
            <option value="ip">{t("trunks.authIp")}</option>
          </SelectField>
          <TextField
            label={t("trunks.maxChannels")}
            type="number"
            min={1}
            max={100}
            value={form.maxChannels}
            onChange={(e) => set("maxChannels", Number(e.target.value) || 1)}
          />
        </div>

        {form.authType === "userpass" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label={t("trunks.username")}
              className="font-mono"
              value={form.username}
              onChange={(e) => set("username", e.target.value)}
              autoComplete="off"
            />
            <TextField
              label={`${t("trunks.secret")}${editingId ? ` (${t("trunks.secretKeep")})` : ""}`}
              className="font-mono"
              type="password"
              value={form.secret}
              onChange={(e) => set("secret", e.target.value)}
              autoComplete="new-password"
              required={!editingId}
            />
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.register}
                onChange={(e) => set("register", e.target.checked)}
              />
              {t("trunks.register")}
            </label>
          </div>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">{t("trunks.authIpHint")}</p>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label={t("trunks.fromDomain")}
            className="font-mono"
            value={form.fromDomain}
            onChange={(e) => set("fromDomain", e.target.value)}
            placeholder="realm.example (optional)"
          />
          <TextField
            label={t("trunks.outboundProxy")}
            className="font-mono"
            value={form.outboundProxy}
            onChange={(e) => set("outboundProxy", e.target.value)}
            placeholder="proxy.example:5060"
          />
          <TextField
            label={t("trunks.codecs")}
            className="font-mono md:col-span-2"
            value={form.codecs}
            onChange={(e) => set("codecs", e.target.value)}
            placeholder="ulaw,alaw,g722"
          />
          <TextAreaField
            label={t("trunks.notes")}
            className="md:col-span-2 min-h-[4.5rem]"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder={t("trunks.notesPlaceholder")}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
            />
            {t("common.enabled")}
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" type="submit" disabled={save.isPending}>
            <Plus size={16} />
            {editingId ? t("common.save") : t("trunks.add")}
          </button>
          <Link className="btn" to="/routes">
            <Link2 size={16} />
            {t("trunks.manageDids")}
          </Link>
        </div>
        </form>
      </SectionCard>

      {didsByNote.length ? (
        <p className="text-sm text-[var(--text-muted)]">
          {t("trunks.didSummary", { count: didsByNote.length })}:{" "}
          <span className="font-mono">{didsByNote.slice(0, 8).join(", ")}</span>
          {didsByNote.length > 8 ? "…" : ""}
        </p>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">{t("trunks.noDids")}</p>
      )}

      <SectionCard title="Trunk list" icon={Cable} tone="blue" className="overflow-auto !space-y-0">
        <table className="table">
          <thead>
            <tr>
              <th>{t("trunks.name")}</th>
              <th>{t("trunks.host")}</th>
              <th>{t("trunks.transport")}</th>
              <th>{t("common.status")}</th>
              <th>{t("common.enabled")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.map((trow) => (
              <tr key={trow.id}>
                <td>
                  <div className="font-medium">{trow.name}</div>
                  {trow.username ? (
                    <div className="font-mono text-xs text-[var(--text-muted)]">{trow.username}</div>
                  ) : (
                    <div className="text-xs text-[var(--text-muted)]">{t("trunks.authIp")}</div>
                  )}
                </td>
                <td className="font-mono text-sm">
                  {trow.host}:{trow.port ?? 5060}
                </td>
                <td className="uppercase text-sm">{trow.transport ?? "udp"}</td>
                <td>
                  <span className="badge">{trow.status}</span>
                  {trow.latencyMs != null ? ` ${trow.latencyMs}ms` : ""}
                </td>
                <td>{trow.enabled ? t("common.yes") : t("common.no")}</td>
                <td className="flex flex-wrap gap-1">
                  <button className="btn" type="button" onClick={() => startEdit(trow)}>
                    {t("common.edit")}
                  </button>
                  <button className="btn" type="button" onClick={() => void toggle(trow)}>
                    {trow.enabled ? t("trunks.disable") : t("trunks.enable")}
                  </button>
                  <button className="btn" type="button" onClick={() => void refreshStatus(trow.id)}>
                    {t("trunks.status")}
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() =>
                      void api.delete(`/api/v1/admin/trunks/${trow.id}`).then(() => {
                        toast.success(t("common.delete"));
                        if (editingId === trow.id) cancelEdit();
                        void qc.invalidateQueries({ queryKey: ["trunks"] });
                      })
                    }
                  >
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
