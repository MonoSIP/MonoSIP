import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, KeyRound, Pencil, Trash2, Upload, UserPlus, Users } from "lucide-react";
import { api } from "../../lib/api";
import { DestPicker } from "../../components/DestPicker";
import { IconBtn, PageHeader, SectionCard, SelectField, TextField, Switch } from "../../components/ui";
import { tr } from "../../i18n";

type Ext = {
  id: string;
  number: string;
  name: string;
  email?: string | null;
  dnd: boolean;
  portalEnabled: boolean;
  recordingMode?: string;
  recordingListenAllowed?: boolean;
  mobileForwardAllowed?: boolean;
  outboundCli?: string | null;
  bossSecretaryOf?: string | null;
  callPermissions?: {
    localFixed?: boolean;
    mobile?: boolean;
    short444?: boolean;
    international?: boolean;
    outboundBlocked?: boolean;
    recording?: boolean;
  };
};

/** Same rule as the API (ExtensionPasswordSchema): it is also the SIP secret in pjsip.conf. */
function passwordProblem(pw: string): string | null {
  if (!pw) return null;
  if (pw.length < 8) return tr("At least 8 characters");
  if (pw.length > 64) return tr("At most 64 characters");
  if (/[\s;"'\\]/.test(pw)) return tr("No spaces, quotes, semicolons or backslashes");
  return null;
}

/** 14 characters without look-alikes (0/O, 1/l/I), easy to type on a desk phone. */
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function ExtensionsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [edit, setEdit] = useState<Ext | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [editName, setEditName] = useState("");
  const [editPortal, setEditPortal] = useState(true);
  const [editRecording, setEditRecording] = useState("always");
  const [editBoss, setEditBoss] = useState("");
  const [fwdRules, setFwdRules] = useState<
    Array<{ condition: string; destType: string; destId: string; ringSeconds: number }>
  >([{ condition: "noanswer", destType: "voicemail", destId: "", ringSeconds: 20 }]);
  const [perms, setPerms] = useState({
    localFixed: true,
    mobile: true,
    short444: true,
    international: false,
    outboundBlocked: false,
    recording: true,
  });
  const [mobileFwd, setMobileFwd] = useState(false);
  const [listenRec, setListenRec] = useState(true);
  const [cli, setCli] = useState("");
  const [spendDaily, setSpendDaily] = useState("");
  const [spendMonthly, setSpendMonthly] = useState("");

  const list = useQuery({
    queryKey: ["extensions"],
    queryFn: () => api.get<Ext[]>("/api/v1/admin/extensions"),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<{ portalPassword?: string }>("/api/v1/admin/extensions", {
        number,
        name,
        ...(password ? { portalPassword: password } : {}),
      }),
    onSuccess: (r) => {
      toast.success(
        r.portalPassword ? tr("Extension created. Password (portal + SIP): {{v0}}", { v0: r.portalPassword }) : "OK",
        { duration: 15000 },
      );
      setNumber("");
      setName("");
      setPassword("");
      void qc.invalidateQueries({ queryKey: ["extensions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDnd = useMutation({
    mutationFn: (ext: Ext) => api.patch(`/api/v1/admin/extensions/${ext.id}`, { dnd: !ext.dnd }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["extensions"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/extensions/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["extensions"] }),
  });

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!edit) return;
      await api.patch(`/api/v1/admin/extensions/${edit.id}`, {
        name: editName,
        portalEnabled: editPortal,
        recordingMode: editRecording,
        bossSecretaryOf: editBoss || null,
        callPermissions: perms,
        mobileForwardAllowed: mobileFwd,
        recordingListenAllowed: listenRec,
        outboundCli: cli || null,
        // one password for the portal and SIP; empty keeps the current one
        ...(editPassword ? { portalPassword: editPassword } : {}),
      });
      await api.put(
        `/api/v1/admin/extensions/${edit.id}/forwarding`,
        fwdRules.map((r) => ({
          condition: r.condition,
          ringSeconds: r.ringSeconds,
          destType: r.destType,
          destId: r.destType === "hangup" ? null : r.destId || null,
        })),
      );
      await api.put(`/api/v1/admin/extensions/${edit.id}/spend-limit`, {
        dailyLimitMinutes: spendDaily === "" ? null : Number(spendDaily),
        monthlyLimitMinutes: spendMonthly === "" ? null : Number(spendMonthly),
      });
    },
    onSuccess: () => {
      toast.success(tr("Saved"));
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ["extensions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (edit) editRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [edit]);

  async function openEdit(ext: Ext) {
    setEdit(ext);
    setEditPassword("");
    setEditName(ext.name);
    setEditPortal(ext.portalEnabled);
    setEditRecording(ext.recordingMode ?? "always");
    setEditBoss(ext.bossSecretaryOf ?? "");
    setPerms({
      localFixed: ext.callPermissions?.localFixed ?? true,
      mobile: ext.callPermissions?.mobile ?? true,
      short444: ext.callPermissions?.short444 ?? true,
      international: ext.callPermissions?.international ?? false,
      outboundBlocked: ext.callPermissions?.outboundBlocked ?? false,
      recording: ext.callPermissions?.recording ?? true,
    });
    setMobileFwd(!!ext.mobileForwardAllowed);
    setListenRec(ext.recordingListenAllowed ?? true);
    setCli(ext.outboundCli ?? "");
    setSpendDaily("");
    setSpendMonthly("");
    try {
      const spend = await api.get<{
        dailyLimitMinutes: number | null;
        monthlyLimitMinutes: number | null;
      }>(`/api/v1/admin/extensions/${ext.id}/spend-limit`);
      setSpendDaily(spend.dailyLimitMinutes != null ? String(spend.dailyLimitMinutes) : "");
      setSpendMonthly(spend.monthlyLimitMinutes != null ? String(spend.monthlyLimitMinutes) : "");
    } catch {
      /* ignore */
    }
    try {
      const detail = await api.get<{
        forwarding: Array<{ condition: string; destType: string; destId: string | null }>;
        callPermissions?: Ext["callPermissions"];
        mobileForwardAllowed?: boolean;
        recordingListenAllowed?: boolean;
        outboundCli?: string | null;
      }>(`/api/v1/admin/extensions/${ext.id}`);
      if (detail.forwarding?.length) {
        setFwdRules(
          detail.forwarding.map((f) => ({
            condition: f.condition,
            destType: f.destType,
            destId: f.destId ?? "",
            ringSeconds: 20,
          })),
        );
      } else {
        setFwdRules([{ condition: "noanswer", destType: "voicemail", destId: "", ringSeconds: 20 }]);
      }
      if (detail.callPermissions) {
        setPerms({
          localFixed: detail.callPermissions.localFixed ?? true,
          mobile: detail.callPermissions.mobile ?? true,
          short444: detail.callPermissions.short444 ?? true,
          international: detail.callPermissions.international ?? false,
          outboundBlocked: detail.callPermissions.outboundBlocked ?? false,
          recording: detail.callPermissions.recording ?? true,
        });
      }
      if (detail.mobileForwardAllowed != null) setMobileFwd(detail.mobileForwardAllowed);
      if (detail.recordingListenAllowed != null) setListenRec(detail.recordingListenAllowed);
      if (detail.outboundCli != null) setCli(detail.outboundCli);
    } catch {
      /* ignore */
    }
  }

  async function exportCsv() {
    const res = await fetch("/api/v1/admin/extensions/export", { credentials: "include" });
    const text = await res.text();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = "extensions.csv";
    a.click();
  }

  async function importCsv(file: File) {
    const csv = await file.text();
    const r = await api.post<{ created: number; updated: number }>("/api/v1/admin/extensions/import", {
      csv,
    });
    toast.success(tr("Import: +{{v0}} / ~{{v1}}", { v0: r.created, v1: r.updated }));
    void qc.invalidateQueries({ queryKey: ["extensions"] });
  }

  return (
    <div>
      <PageHeader
        icon={Users}
        title={t("extensions.title")}
        tone="blue"
        description={tr("Desk phones, softphones, and portal accounts")}
        actions={
          <div className="flex gap-2">
            <button className="btn" type="button" onClick={() => void exportCsv()}>
              <Download size={16} />
              {tr("Export CSV")}
            </button>
            <label className="btn cursor-pointer">
              <Upload size={16} />
              {tr("Import CSV")}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importCsv(f);
                }}
              />
            </label>
          </div>
        }
      />
      <SectionCard title={tr("Extensions")} icon={Users} tone="blue" flush className="mb-6">
        <table className="table">
          <thead>
            <tr>
              <th>{t("extensions.number")}</th>
              <th>{t("extensions.name")}</th>
              <th>{t("extensions.dnd")}</th>
              <th>{t("extensions.portal")}</th>
              <th>{tr("Secretary")}</th>
              <th className="col-actions">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.map((e) => (
              <tr key={e.id}>
                <td className="font-mono">{e.number}</td>
                <td className="col-grow">{e.name}</td>
                <td>
                  {(() => {
                    const pending = toggleDnd.isPending && toggleDnd.variables?.id === e.id;
                    return (
                      <Switch
                        label={`${tr("DND")} ${e.number}`}
                        checked={pending ? !e.dnd : !!e.dnd}
                        pending={pending}
                        onChange={() => toggleDnd.mutate(e)}
                      />
                    );
                  })()}
                </td>
                <td>{e.portalEnabled ? t("common.yes") : t("common.no")}</td>
                <td className="font-mono text-xs">
                  {e.bossSecretaryOf
                    ? list.data?.find((x) => x.id === e.bossSecretaryOf)?.number ?? "…"
                    : "—"}
                </td>
                <td className="col-actions">
                  <div className="btn-icon-row">
                    <IconBtn icon={Pencil} label={tr("Edit")} onClick={() => void openEdit(e)} />
                    <IconBtn icon={Trash2} label={t("common.delete")} danger onClick={() => remove.mutate(e.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title={tr("Add extension")} icon={UserPlus} tone="cyan" className="mb-6">
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <TextField
            label={t("extensions.number")}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            required
          />
          <TextField
            label={t("extensions.name")}
            className="min-w-[16rem]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <TextField
            label={tr("Password")}
            className="min-w-[14rem]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={tr("Empty = generate")}
            hint={passwordProblem(password) ?? undefined}
            autoComplete="new-password"
            spellCheck={false}
            aria-invalid={!!passwordProblem(password)}
          />
          <button className="btn btn-primary justify-center" type="submit" disabled={!!passwordProblem(password)}>
            <UserPlus size={16} />
            {t("extensions.add")}
          </button>
        </form>
      </SectionCard>

      {edit && (
        <div ref={editRef}>
        <SectionCard title={tr("Edit extension {{v0}}", { v0: edit.number })} icon={Users} tone="coral" className="mb-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={tr("Name")} value={editName} onChange={(e) => setEditName(e.target.value)} />
            <SelectField
              label={tr("Recording")}
              value={editRecording}
              onChange={(e) => setEditRecording(e.target.value)}
            >
              <option value="off">off</option>
              <option value="always">always</option>
              <option value="external">{tr("external only")}</option>
            </SelectField>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editPortal} onChange={(e) => setEditPortal(e.target.checked)} />
              {tr("Portal enabled")}
            </label>
            <SelectField label={tr("Secretary of")} value={editBoss} onChange={(e) => setEditBoss(e.target.value)}>
              <option value="">{tr("— none —")}</option>
              {list.data
                ?.filter((x) => x.id !== edit.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.number} — {x.name}
                  </option>
                ))}
            </SelectField>
            <div className="sm:col-span-2 flex items-end gap-2">
              <TextField
                className="flex-1"
                label={tr("New password")}
                hint={passwordProblem(editPassword) ?? tr("Used for portal login and SIP (softphone, desk phone). Empty keeps the current one.")}
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                autoComplete="new-password"
                spellCheck={false}
                aria-invalid={!!passwordProblem(editPassword)}
              />
              <button type="button" className="btn mb-[1.6rem]" onClick={() => setEditPassword(generatePassword())}>
                <KeyRound size={15} />
                {tr("Generate")}
              </button>
            </div>
            <TextField
              className="sm:col-span-2"
              label={tr("Outbound CLI")}
              value={cli}
              onChange={(e) => setCli(e.target.value)}
            />
            <TextField
              label={tr("Daily spend limit (min)")}
              hint={tr("Empty = global default")}
              type="number"
              min={0}
              value={spendDaily}
              onChange={(e) => setSpendDaily(e.target.value)}
              placeholder="—"
            />
            <TextField
              label={tr("Monthly spend limit (min)")}
              type="number"
              min={0}
              value={spendMonthly}
              onChange={(e) => setSpendMonthly(e.target.value)}
              placeholder="—"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{tr("Forwarding rules")}</span>
              <button
                className="btn text-xs"
                type="button"
                onClick={() =>
                  setFwdRules((r) => [
                    ...r,
                    { condition: "busy", destType: "voicemail", destId: "", ringSeconds: 20 },
                  ])
                }
              >
                {tr("Add rule")}
              </button>
            </div>
            {fwdRules.map((rule, i) => (
              <div key={i} className="space-y-2 rounded border border-[var(--border)] p-3">
                <div className="flex flex-wrap gap-2">
                  <select
                    className="input"
                    value={rule.condition}
                    onChange={(e) =>
                      setFwdRules((rs) =>
                        rs.map((x, j) => (j === i ? { ...x, condition: e.target.value } : x)),
                      )
                    }
                  >
                    <option value="always">always</option>
                    <option value="noanswer">noanswer</option>
                    <option value="busy">busy</option>
                    <option value="chanunavail">chanunavail</option>
                  </select>
                  <input
                    className="input w-24"
                    type="number"
                    title={tr("Ring seconds")}
                    value={rule.ringSeconds}
                    onChange={(e) =>
                      setFwdRules((rs) =>
                        rs.map((x, j) => (j === i ? { ...x, ringSeconds: Number(e.target.value) } : x)),
                      )
                    }
                  />
                  <button
                    className="btn btn-danger text-xs"
                    type="button"
                    onClick={() => setFwdRules((rs) => rs.filter((_, j) => j !== i))}
                  >
                    {tr("Remove")}
                  </button>
                </div>
                <DestPicker
                  destType={rule.destType}
                  destId={rule.destId || null}
                  onChange={(t, id) =>
                    setFwdRules((rs) =>
                      rs.map((x, j) => (j === i ? { ...x, destType: t, destId: id ?? "" } : x)),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {(
              [
                ["localFixed", "Local"],
                ["mobile", "Mobile"],
                ["short444", "444"],
                ["international", "Intl"],
                ["outboundBlocked", "Block outbound"],
                ["recording", "Allow recording"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={perms[k]}
                  onChange={(e) => setPerms({ ...perms, [k]: e.target.checked })}
                />
                {tr(label)}
              </label>
            ))}
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={mobileFwd} onChange={(e) => setMobileFwd(e.target.checked)} />
              {tr("Mobile forward OK")}
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={listenRec} onChange={(e) => setListenRec(e.target.checked)} />
              {tr("Listen recordings")}
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={!!passwordProblem(editPassword)} className="btn btn-primary" type="button" onClick={() => saveEdit.mutate()}>
              {t("common.save")}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() =>
                void api
                  .post<{ portalPassword: string }>(`/api/v1/admin/extensions/${edit.id}/reset-password`)
                  .then((r) =>
                    toast.success(tr("New password (portal + SIP): {{v0}}", { v0: r.portalPassword }), { duration: 15000 }),
                  )
                  .catch((e) => toast.error(String(e)))
              }
            >
              {tr("Generate new password now")}
            </button>
            <button className="btn" type="button" onClick={() => setEdit(null)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
          </div>
        </SectionCard>
        </div>
      )}
    </div>
  );
}