import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { DestPicker } from "../../components/DestPicker";

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
  const blacklist = useQuery({
    queryKey: ["blacklist"],
    queryFn: () =>
      api.get<Array<{ id: string; pattern: string; direction: string; note: string | null }>>(
        "/api/v1/admin/blacklist",
      ),
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
      toast.success(editInboundId ? "Inbound route updated" : "Inbound route added");
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
      toast.success(editOutboundId ? "Outbound route updated" : "Outbound route added");
      resetOutbound();
      void qc.invalidateQueries({ queryKey: ["outbound"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{t("routes.title")}</h1>
      <section className="card p-4">
        <h2 className="mb-3 font-medium">{t("routes.inbound")}</h2>
        <form
          className="mb-3 grid gap-2 sm:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            saveInbound.mutate();
          }}
        >
          <input className="input" value={did} onChange={(e) => setDid(e.target.value)} placeholder="DID" />
          <input
            className="input"
            value={callerPattern}
            onChange={(e) => setCallerPattern(e.target.value)}
            placeholder="Caller pattern"
          />
          <DestPicker
            destType={destType}
            destId={destId || null}
            onChange={(t, id) => {
              setDestType(t);
              setDestId(id ?? "");
            }}
          />
          <input
            className="input"
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          />
          <div className="flex gap-2">
            <button className="btn btn-primary" type="submit">
              {editInboundId ? t("common.save") : t("common.create")}
            </button>
            {editInboundId ? (
              <button className="btn" type="button" onClick={resetInbound}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </button>
            ) : null}
          </div>
        </form>
        <table className="table">
          <thead>
            <tr>
              <th>DID</th>
              <th>Caller</th>
              <th>Destination</th>
              <th>Priority</th>
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
                <td className="space-x-2">
                  <button className="btn" type="button" onClick={() => loadInbound(r)}>
                    {t("common.edit", { defaultValue: "Edit" })}
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() =>
                      void api.delete(`/api/v1/admin/routes/inbound/${r.id}`).then(() =>
                        qc.invalidateQueries({ queryKey: ["inbound"] }),
                      )
                    }
                  >
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card p-4">
        <h2 className="mb-3 font-medium">{t("routes.outbound")}</h2>
        <form
          className="mb-3 grid gap-2 sm:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            saveOutbound.mutate();
          }}
        >
          <input className="input" value={obName} onChange={(e) => setObName(e.target.value)} placeholder="Name" required />
          <input className="input font-mono" value={obPattern} onChange={(e) => setObPattern(e.target.value)} placeholder="Pattern" required />
          <select className="input" value={obTrunk} onChange={(e) => setObTrunk(e.target.value)} required>
            <option value="">Trunk…</option>
            {(trunks.data ?? []).map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.name}
              </option>
            ))}
          </select>
          <select className="input" value={obPerm} onChange={(e) => setObPerm(e.target.value)}>
            <option value="localFixed">localFixed</option>
            <option value="mobile">mobile</option>
            <option value="short444">short444</option>
            <option value="international">international</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={obEnabled} onChange={(e) => setObEnabled(e.target.checked)} />
            {t("common.enabled")}
          </label>
          <div className="flex gap-2">
            <button className="btn btn-primary" type="submit">
              {editOutboundId ? t("common.save") : t("common.create")}
            </button>
            {editOutboundId ? (
              <button className="btn" type="button" onClick={resetOutbound}>
                {t("common.cancel", { defaultValue: "Cancel" })}
              </button>
            ) : null}
          </div>
        </form>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Pattern</th>
              <th>Perm</th>
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
                  <td className="space-x-2">
                    <button className="btn" type="button" onClick={() => loadOutbound(r)}>
                      {t("common.edit", { defaultValue: "Edit" })}
                    </button>
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() =>
                        void api.delete(`/api/v1/admin/routes/outbound/${r.id}`).then(() =>
                          qc.invalidateQueries({ queryKey: ["outbound"] }),
                        )
                      }
                    >
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <section className="card p-4">
        <h2 className="mb-3 font-medium">{t("routes.blacklist")}</h2>
        <form
          className="mb-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void api
              .post("/api/v1/admin/blacklist", {
                pattern: String(fd.get("pattern") ?? ""),
                direction: String(fd.get("direction") ?? "both"),
                note: String(fd.get("note") ?? "") || null,
              })
              .then(() => {
                e.currentTarget.reset();
                void qc.invalidateQueries({ queryKey: ["blacklist"] });
              });
          }}
        >
          <input className="input" name="pattern" placeholder="Pattern" required />
          <select className="input" name="direction" defaultValue="both">
            <option value="inbound">inbound</option>
            <option value="outbound">outbound</option>
            <option value="both">both</option>
          </select>
          <input className="input" name="note" placeholder="Note" />
          <button className="btn btn-primary" type="submit">
            {t("common.create")}
          </button>
        </form>
        <table className="table">
          <thead>
            <tr>
              <th>Pattern</th>
              <th>Direction</th>
              <th>Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {blacklist.data?.map((b) => (
              <tr key={b.id}>
                <td className="font-mono">{b.pattern}</td>
                <td>{b.direction}</td>
                <td>{b.note ?? "—"}</td>
                <td>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() =>
                      void api.delete(`/api/v1/admin/blacklist/${b.id}`).then(() =>
                        qc.invalidateQueries({ queryKey: ["blacklist"] }),
                      )
                    }
                  >
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
