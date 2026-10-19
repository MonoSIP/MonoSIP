import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { History, PhoneCall } from "lucide-react";
import { api } from "../../lib/api";
import { callPeer } from "../../lib/call-peer";
import { PageHeader, SectionCard } from "../../components/ui";

type Tab = "all" | "inbound" | "outbound" | "missed";

export function MyCallsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("all");

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<{ number: string }>("/api/v1/me"),
  });

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
    <div className="space-y-4">
      <PageHeader
        icon={PhoneCall}
        title={t("nav.myCalls")}
        tone="blue"
        actions={
          <>
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
          </>
        }
      />
      {tab === "missed" && (missed.data ?? []).length > 0 && (
        <SectionCard title="Pending missed" icon={History} tone="blue" flush>
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
        </SectionCard>
      )}
      <SectionCard title="Call history" icon={History} tone="blue" flush>
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
                const num = callPeer(c, me.data?.number);
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
      </SectionCard>
    </div>
  );
}
