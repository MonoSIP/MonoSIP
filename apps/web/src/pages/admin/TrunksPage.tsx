import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";

type Trunk = {
  id: string;
  name: string;
  host: string;
  enabled: boolean;
  status: string;
  latencyMs?: number | null;
};

export function TrunksPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", host: "", username: "", secret: "" });
  const list = useQuery({
    queryKey: ["trunks"],
    queryFn: () => api.get<Trunk[]>("/api/v1/admin/trunks"),
  });
  const create = useMutation({
    mutationFn: () => api.post("/api/v1/admin/trunks", { ...form, enabled: true }),
    onSuccess: () => {
      toast.success("OK");
      setForm({ name: "", host: "", username: "", secret: "" });
      void qc.invalidateQueries({ queryKey: ["trunks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("trunks.title")}</h1>
      <form
        className="card mb-6 grid gap-3 p-4 md:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        {(["name", "host", "username", "secret"] as const).map((k) => (
          <input
            key={k}
            className="input"
            type={k === "secret" ? "password" : "text"}
            placeholder={k}
            value={form[k]}
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            required={k === "name" || k === "host"}
          />
        ))}
        <button className="btn btn-primary" type="submit">
          {t("trunks.add")}
        </button>
      </form>
      <div className="card overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{t("extensions.name")}</th>
              <th>{t("trunks.host")}</th>
              <th>{t("common.status")}</th>
              <th>{t("common.enabled")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.map((trow) => (
              <tr key={trow.id}>
                <td>{trow.name}</td>
                <td className="font-mono text-sm">{trow.host}</td>
                <td>
                  <span className="badge">{trow.status}</span>
                  {trow.latencyMs != null ? ` ${trow.latencyMs}ms` : ""}
                </td>
                <td>{trow.enabled ? t("common.yes") : t("common.no")}</td>
                <td className="flex flex-wrap gap-1">
                  <button className="btn" type="button" onClick={() => void toggle(trow)}>
                    {trow.enabled ? "Disable" : "Enable"}
                  </button>
                  <button className="btn" type="button" onClick={() => void refreshStatus(trow.id)}>
                    Status
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() =>
                      void api.delete(`/api/v1/admin/trunks/${trow.id}`).then(() => {
                        toast.success("Deleted");
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
      </div>
    </div>
  );
}
