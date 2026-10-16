import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { DestPicker } from "../../components/DestPicker";

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

export function ExtensionsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<Ext | null>(null);
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
    mutationFn: () => api.post<{ portalPassword?: string }>("/api/v1/admin/extensions", { number, name }),
    onSuccess: (r) => {
      toast.success(r.portalPassword ? `${t("extensions.createdPassword")}: ${r.portalPassword}` : "OK");
      setNumber("");
      setName("");
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
      toast.success("Saved");
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ["extensions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function openEdit(ext: Ext) {
    setEdit(ext);
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
    toast.success(`Import: +${r.created} / ~${r.updated}`);
    void qc.invalidateQueries({ queryKey: ["extensions"] });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("extensions.title")}</h1>
        <div className="flex gap-2">
          <button className="btn" type="button" onClick={() => void exportCsv()}>
            Export CSV
          </button>
          <label className="btn cursor-pointer">
            Import CSV
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
      </div>
      <form
        className="card mb-6 grid gap-3 p-4 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input
          className="input"
          placeholder={t("extensions.number")}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          required
        />
        <input
          className="input sm:col-span-2"
          placeholder={t("extensions.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button className="btn btn-primary justify-center" type="submit">
          {t("extensions.add")}
        </button>
      </form>

      {edit && (
        <div className="card mb-6 space-y-3 p-4">
          <h2 className="font-medium">
            Edit {edit.number}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-[var(--text-muted)]">
              Name
              <input className="input mt-1 w-full" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </label>
            <label className="text-sm text-[var(--text-muted)]">
              Recording
              <select className="input mt-1 w-full" value={editRecording} onChange={(e) => setEditRecording(e.target.value)}>
                <option value="off">off</option>
                <option value="always">always</option>
                <option value="external">external only</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editPortal} onChange={(e) => setEditPortal(e.target.checked)} />
              Portal enabled
            </label>
            <label className="text-sm text-[var(--text-muted)]">
              Secretary of (boss extension id)
              <select className="input mt-1 w-full" value={editBoss} onChange={(e) => setEditBoss(e.target.value)}>
                <option value="">— none —</option>
                {list.data
                  ?.filter((x) => x.id !== edit.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.number} — {x.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm text-[var(--text-muted)] sm:col-span-2">
              Outbound CLI
              <input className="input mt-1 w-full font-mono" value={cli} onChange={(e) => setCli(e.target.value)} />
            </label>
            <label className="text-sm text-[var(--text-muted)]">
              Daily spend limit (min, empty=global)
              <input
                className="input mt-1 w-full font-mono"
                type="number"
                min={0}
                value={spendDaily}
                onChange={(e) => setSpendDaily(e.target.value)}
                placeholder="—"
              />
            </label>
            <label className="text-sm text-[var(--text-muted)]">
              Monthly spend limit (min)
              <input
                className="input mt-1 w-full font-mono"
                type="number"
                min={0}
                value={spendMonthly}
                onChange={(e) => setSpendMonthly(e.target.value)}
                placeholder="—"
              />
            </label>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Forwarding rules</span>
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
                Add rule
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
                    title="Ring seconds"
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
                    Remove
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
                {label}
              </label>
            ))}
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={mobileFwd} onChange={(e) => setMobileFwd(e.target.checked)} />
              Mobile forward OK
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={listenRec} onChange={(e) => setListenRec(e.target.checked)} />
              Listen recordings
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" type="button" onClick={() => saveEdit.mutate()}>
              {t("common.save")}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() =>
                void api
                  .post<{ portalPassword: string }>(`/api/v1/admin/extensions/${edit.id}/reset-password`)
                  .then((r) => toast.success(`New portal password: ${r.portalPassword}`))
                  .catch((e) => toast.error(String(e)))
              }
            >
              Reset portal password
            </button>
            <button className="btn" type="button" onClick={() => setEdit(null)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{t("extensions.number")}</th>
              <th>{t("extensions.name")}</th>
              <th>{t("extensions.dnd")}</th>
              <th>{t("extensions.portal")}</th>
              <th>Secretary</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.map((e) => (
              <tr key={e.id}>
                <td className="font-mono">{e.number}</td>
                <td>{e.name}</td>
                <td>
                  <button className="btn" type="button" onClick={() => toggleDnd.mutate(e)}>
                    {e.dnd ? "ON" : "OFF"}
                  </button>
                </td>
                <td>{e.portalEnabled ? t("common.yes") : t("common.no")}</td>
                <td className="font-mono text-xs">
                  {e.bossSecretaryOf
                    ? list.data?.find((x) => x.id === e.bossSecretaryOf)?.number ?? "…"
                    : "—"}
                </td>
                <td className="flex gap-1">
                  <button className="btn" type="button" onClick={() => void openEdit(e)}>
                    Edit
                  </button>
                  <button className="btn btn-danger" type="button" onClick={() => remove.mutate(e.id)}>
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
