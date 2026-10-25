import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Ban, Pencil, Plus, Route, Signpost, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { DestPicker } from "../../components/DestPicker";
import { Button, Checkbox, IconBtn, PageHeader, SectionCard, SelectField, TextField } from "../../components/ui";
import { tr } from "../../i18n";

type Inbound = {
  id: string;
  did: string;
  callerPattern: string | null;
  destType: string;
  destId: string | null;
  priority: number;
};

type Outbound = {
  id: string;
  name: string;
  pattern: string;
  enabled: boolean;
  trunkIds: string[];
  requiredPermission: string;
  stripPrefix?: number;
  prepend?: string;
};

export function RoutesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editInboundId, setEditInboundId] = useState<string | null>(null);
  const [did, setDid] = useState("default");
  const [callerPattern, setCallerPattern] = useState("");
  const [destType, setDestType] = useState("flow");
  const [destId, setDestId] = useState("");
  const [priority, setPriority] = useState(100);
  const [editOutboundId, setEditOutboundId] = useState<string | null>(null);
  const [obName, setObName] = useState("");
  const [obPattern, setObPattern] = useState("_X.");
  const [obTrunk, setObTrunk] = useState("");
  const [obPerm, setObPerm] = useState("localFixed");
  const [obEnabled, setObEnabled] = useState(true);

  const inbound = useQuery({
    queryKey: ["inbound"],
    queryFn: () => api.get<Inbound[]>("/api/v1/admin/routes/inbound"),
  });
  const outbound = useQuery({
    queryKey: ["outbound"],
    queryFn: () => api.get<Outbound[]>("/api/v1/admin/routes/outbound"),
  });
  const trunks = useQuery({
    queryKey: ["trunks"],
    queryFn: () =>
      api.get<Array<{ id: string; name: string }>>("/api/v1/admin/trunks"),
  });
  function resetInbound() {
    setEditInboundId(null);
    setDid("default");
    setCallerPattern("");
    setDestType("flow");
    setDestId("");
    setPriority(100);
  }

  function resetOutbound() {
    setEditOutboundId(null);
    setObName("");
    setObPattern("_X.");
    setObTrunk("");
    setObPerm("localFixed");
    setObEnabled(true);
  }

  function loadInbound(r: Inbound) {
    setEditInboundId(r.id);
    setDid(r.did);
    setCallerPattern(r.callerPattern ?? "");
    setDestType(r.destType);
    setDestId(r.destId ?? "");
    setPriority(r.priority);
  }

  function loadOutbound(r: Outbound) {
    setEditOutboundId(r.id);
    setObName(r.name);
    setObPattern(r.pattern);
    setObTrunk(r.trunkIds[0] ?? "");
    setObPerm(r.requiredPermission);
    setObEnabled(r.enabled);
  }

  const saveInbound = useMutation({
    mutationFn: () => {
      const body = {
        did,
        callerPattern: callerPattern || null,
        priority,
        destType,
        destId: destId || null,
      };
      if (editInboundId) {
        return api.patch(`/api/v1/admin/routes/inbound/${editInboundId}`, body);
      }
      return api.post("/api/v1/admin/routes/inbound", body);
    },
    onSuccess: () => {
      toast.success(editInboundId ? tr("Inbound route updated") : tr("Inbound route added"));
      resetInbound();
      void qc.invalidateQueries({ queryKey: ["inbound"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveOutbound = useMutation({
    mutationFn: () => {
      const body = {
        name: obName,
        pattern: obPattern,
        stripPrefix: 0,
        prepend: "",
        trunkIds: [obTrunk],
        requiredPermission: obPerm,
        enabled: obEnabled,
      };
      if (editOutboundId) {
        return api.patch(`/api/v1/admin/routes/outbound/${editOutboundId}`, body);
      }
      return api.post("/api/v1/admin/routes/outbound", body);
    },
    onSuccess: () => {
      toast.success(editOutboundId ? tr("Outbound route updated") : tr("Outbound route added"));
      resetOutbound();
      void qc.invalidateQueries({ queryKey: ["outbound"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <PageHeader icon={Route} title={t("routes.title")} tone="cyan" description={tr("Inbound DIDs and outbound patterns")} />
      <SectionCard title={t("routes.inbound")} icon={Signpost} tone="cyan">
        <table className="table">
          <thead>
            <tr>
              <th>{tr("DID")}</th>
              <th>{tr("Caller")}</th>
              <th>{tr("Destination")}</th>
              <th>{tr("Priority")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {inbound.data?.map((r) => (
              <tr key={r.id}>
                <td className="font-mono">{r.did}</td>
                <td className="font-mono text-xs">{r.callerPattern ?? "*"}</td>
                <td>
                  {r.destType}:{r.destId ?? "—"}
                </td>
                <td>{r.priority}</td>
                <td className="col-actions">
                  <div className="btn-icon-row">
                    <IconBtn icon={Pencil} label={t("common.edit", { defaultValue: "Edit" })} onClick={() => loadInbound(r)} />
                    <IconBtn
                      icon={Trash2}
                      label={t("common.delete")}
                      danger
                      onClick={() =>
                        void api.delete(`/api/v1/admin/routes/inbound/${r.id}`).then(() =>
                          qc.invalidateQueries({ queryKey: ["inbound"] }),
                        )
                      }
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form
          className="mt-3 grid gap-2 sm:grid-cols-6 sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            saveInbound.mutate();
          }}
        >
          <TextField label={tr("DID")} value={did} onChange={(e) => setDid(e.target.value)} />
          <TextField
            label={tr("Caller pattern")}
            value={callerPattern}
            onChange={(e) => setCallerPattern(e.target.value)}
          />
          <DestPicker
            className="sm:col-span-2"
            destType={destType}
            destId={destId || null}
            onChange={(t, id) => {
              setDestType(t);
              setDestId(id ?? "");
            }}
          />
          <TextField
            label={tr("Priority")}
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          />
          <div className="flex gap-2 pb-[0.85rem]">
            <Button variant="solid" type="submit">
              <Plus size={16} />
              {editInboundId ? t("common.save") : t("common.create")}
            </Button>
            {editInboundId ? (
              <Button type="button" onClick={resetInbound}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
            ) : null}
          </div>
        </form>
      </SectionCard>
      <SectionCard title={t("routes.outbound")} icon={Route} tone="blue">
        <table className="table">
          <thead>
            <tr>
              <th>{tr("Name")}</th>
              <th>{tr("Pattern")}</th>
              <th>{tr("Perm")}</th>
              <th>{t("common.enabled")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(outbound.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="text-[var(--text-muted)]">
                  —
                </td>
              </tr>
            ) : (
              outbound.data?.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="font-mono">{r.pattern}</td>
                  <td className="text-xs">{r.requiredPermission}</td>
                  <td>{r.enabled ? t("common.yes") : t("common.no")}</td>
                  <td className="col-actions">
                    <div className="btn-icon-row">
                      <IconBtn icon={Pencil} label={t("common.edit", { defaultValue: "Edit" })} onClick={() => loadOutbound(r)} />
                      <IconBtn
                        icon={Trash2}
                        label={t("common.delete")}
                        danger
                        onClick={() =>
                          void api.delete(`/api/v1/admin/routes/outbound/${r.id}`).then(() =>
                            qc.invalidateQueries({ queryKey: ["outbound"] }),
                          )
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <form
          className="mt-3 grid gap-2 sm:grid-cols-6 sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            saveOutbound.mutate();
          }}
        >
          <TextField label={tr("Name")} value={obName} onChange={(e) => setObName(e.target.value)} required />
          <TextField
            label={tr("Pattern")}
            className="font-mono"
            value={obPattern}
            onChange={(e) => setObPattern(e.target.value)}
            required
          />
          <SelectField
            label={tr("Trunk")}
            value={obTrunk}
            onValueChange={setObTrunk}
            required
            options={[
              { value: "", label: tr("Trunk…") },
              ...(trunks.data ?? []).map((trunk) => ({ value: trunk.id, label: trunk.name })),
            ]}
          />
          <SelectField
            label={tr("Permission")}
            value={obPerm}
            onValueChange={setObPerm}
            options={[
              { value: "localFixed", label: tr("Local landline") },
              { value: "mobile", label: "mobile" },
              { value: "short444", label: "short444" },
              { value: "international", label: "international" },
            ]}
          />
          <Checkbox checked={obEnabled} onCheckedChange={setObEnabled} label={t("common.enabled")} />
          <div className="flex gap-2 pb-[0.85rem]">
            <Button variant="solid" type="submit">
              <Plus size={16} />
              {editOutboundId ? t("common.save") : t("common.create")}
            </Button>
            {editOutboundId ? (
              <Button type="button" onClick={resetOutbound}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
            ) : null}
          </div>
        </form>
      </SectionCard>
      <SectionCard title={t("routes.blacklist")} icon={Ban} tone="coral">
        <p className="mb-3 text-sm text-[var(--text-muted)]">{t("routes.blacklistMoved")}</p>
        <Button asChild variant="solid">
<Link to="/blacklist">
          <Ban size={16} />
          {t("nav.blacklist")}
        </Link>
</Button>
      </SectionCard>
    </div>
  );
}
