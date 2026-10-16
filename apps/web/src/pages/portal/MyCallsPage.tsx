import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

type Tab = "all" | "inbound" | "outbound" | "missed";

export function MyCallsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("all");

  const list = useQuery({
    queryKey: ["my-calls"],
    queryFn: () =>
      api.get<
        Array<{
          id: string;
          startedAt: string;
          direction: string;
          caller: string;
          callee: string;
          disposition: string;
        }>
      >("/api/v1/me/calls"),
  });

  const missed = useQuery({
    queryKey: ["my-missed"],
    queryFn: () =>
      api.get<
        Array<{
          id: string;
          number: string;
          target: string | null;
          status: string;
          at: string;
        }>
      >("/api/v1/me/missed-calls"),
  });

  function peer(c: { direction: string; caller: string; callee: string }) {
    return c.direction === "outbound" ? c.callee : c.caller;
  }

  const filtered = (list.data ?? []).filter((c) => {
    if (tab === "inbound") return c.direction === "inbound";
    if (tab === "outbound") return c.direction === "outbound";
    if (tab === "missed") return c.disposition !== "ANSWERED";
    return true;
  });

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "all", label: "All" },
    { id: "inbound", label: "Inbound" },
    { id: "outbound", label: "Outbound" },
    { id: "missed", label: "Missed" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("nav.myCalls")}</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            className={`btn ${tab === x.id ? "btn-primary" : ""}`}
            onClick={() => setTab(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>
      {tab === "missed" && (missed.data ?? []).length > 0 && (
        <div className="card mb-4 overflow-auto">
          <div className="border-b border-[var(--border)] px-4 py-2 text-sm font-medium">
            Pending missed
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Number</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {missed.data?.map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.at).toLocaleString()}</td>
                  <td className="font-mono">{m.number}</td>
                  <td>{m.status}</td>
                  <td>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => navigate(`/?dial=${encodeURIComponent(m.number)}`)}
                    >
                      {t("portal.dial")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>{t("cdr.caller")}</th>
              <th>{t("cdr.callee")}</th>
              <th>{t("cdr.disposition")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5}>—</td>
              </tr>
            ) : (
              filtered.map((c) => {
                const num = peer(c);
                return (
                  <tr key={c.id}>
                    <td>{new Date(c.startedAt).toLocaleString()}</td>
                    <td className="font-mono">{c.caller}</td>
                    <td className="font-mono">{c.callee}</td>
                    <td>{c.disposition}</td>
                    <td>
                      {num && (
                        <button
                          className="btn"
                          type="button"
                          onClick={() => navigate(`/?dial=${encodeURIComponent(num)}`)}
                        >
                          {t("portal.dial")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
