import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

export function MissedPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "returned" | "all">("pending");
  const list = useQuery({
    queryKey: ["missed"],
    queryFn: () =>
      api.get<Array<{ id: string; number: string; target: string; at: string; status: string }>>(
        "/api/v1/admin/missed-calls",
      ),
  });

  const mark = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "returned" | "ignored" | "pending" }) =>
      api.patch(`/api/v1/admin/missed-calls/${id}`, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["missed"] }),
  });

  const rows = (list.data ?? []).filter((m) => {
    if (tab === "all") return true;
    if (tab === "pending") return m.status === "pending";
    return m.status === "returned";
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">{t("nav.missed")}</h1>
      <div className="mb-4 flex gap-2">
        {(
          [
            ["pending", "Bekliyor"],
            ["returned", "Dönüldü"],
            ["all", "All"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`btn ${tab === k ? "btn-primary" : ""}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="card overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{t("cdr.caller")}</th>
              <th>Target</th>
              <th>Time</th>
              <th>{t("common.status")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>—</td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id}>
                  <td className="font-mono">{m.number}</td>
                  <td>{m.target}</td>
                  <td>{new Date(m.at).toLocaleString()}</td>
                  <td>
                    <span className="badge">{m.status}</span>
                  </td>
                  <td className="flex gap-1">
                    {m.status !== "returned" && (
                      <button
                        className="btn"
                        type="button"
                        onClick={() => mark.mutate({ id: m.id, status: "returned" })}
                      >
                        Dönüldü
                      </button>
                    )}
                    {m.status === "pending" && (
                      <button
                        className="btn"
                        type="button"
                        onClick={() => mark.mutate({ id: m.id, status: "ignored" })}
                      >
                        Ignore
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
