import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { History, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
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
      <PageHeader icon={PhoneCall} title={t("nav.myCalls")} tone="blue" />
      <div className="call-filters">
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
        <SectionCard title="Pending missed" icon={History} tone="blue">
          <ul className="call-list">
            {missed.data?.map((m) => (
              <li key={m.id} className="call-row">
                <div className="call-row-main">
                  <span className="call-row-peer font-mono">{m.number}</span>
                  <span className="call-row-meta">
                    {new Date(m.at).toLocaleString()} · {m.status}
                  </span>
                </div>
                <button
                  className="btn shrink-0"
                  type="button"
                  onClick={() => navigate(`/?dial=${encodeURIComponent(m.number)}`)}
                >
                  {t("portal.dial")}
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      {list.isFetched && filtered.length === 0 ? (
        <div className="vm-empty" role="status">
          <span className="vm-empty-mark" aria-hidden="true">
            <History size={22} strokeWidth={2.25} />
          </span>
          <span className="vm-empty-log" aria-hidden="true">
            <span><PhoneIncoming size={14} /></span>
            <span><PhoneOutgoing size={14} /></span>
            <span><PhoneMissed size={14} /></span>
          </span>
          <p>{t("portal.callsEmpty")}</p>
        </div>
      ) : filtered.length === 0 ? null : (
        <SectionCard title="Call history" icon={History} tone="blue">
          <ul className="call-list">
            {filtered.map((c) => {
              const num = callPeer(c, me.data?.number);
              return (
                <li key={c.id} className="call-row">
                  <div className="call-row-main">
                    <span className="call-row-peer">
                      <span className="font-mono">{c.caller}</span>
                      <span aria-hidden="true"> → </span>
                      <span className="font-mono">{c.callee}</span>
                    </span>
                    <span className="call-row-meta">
                      {new Date(c.startedAt).toLocaleString()} · {c.disposition}
                    </span>
                  </div>
                  {num && (
                    <button
                      className="btn shrink-0"
                      type="button"
                      onClick={() => navigate(`/?dial=${encodeURIComponent(num)}`)}
                    >
                      {t("portal.dial")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
