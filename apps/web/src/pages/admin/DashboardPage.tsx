import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Clock3,
  LayoutDashboard,
  PhoneCall,
  PhoneMissed,
  PhoneOutgoing,
  Trash2,
  Tv,
} from "lucide-react";
import { api } from "../../lib/api";
import { Button, PageHeader, SelectInput, StatTile } from "../../components/ui";
import { LiveDot } from "../../components/motion";
import { tr } from "../../i18n";

/** Presence words (server: lib/presence.ts) — DND comes from the extensions table. */
const PRESENCE_LABEL: Record<string, string> = {
  online: "Online",
  busy: "On a call",
  dnd: "Do not disturb",
  offline: "Offline",
};

export function DashboardPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tv, setTv] = useState(false);
  const [wsNote, setWsNote] = useState("…");
  const [listenerExt, setListenerExt] = useState("100");

  const live = useQuery({
    queryKey: ["live"],
    queryFn: () =>
      api.get<{
        asteriskConnected: boolean;
        calls: Array<{
          id: string;
          name?: string;
          caller: string;
          callee: string;
          state: string;
          tech?: string;
        }>;
        extensions: Array<{ number: string; name?: string; dnd?: boolean; state: string }>;
        queues: Array<{ number: string; name: string; members: number; paused: number; waiting: number }>;
        trunks?: Array<{ id: string; name: string; host: string; state: string }>;
      }>("/api/v1/admin/live/calls"),
    refetchInterval: tv ? 2000 : 4000,
  });
  const summary = useQuery({
    queryKey: ["report-summary"],
    queryFn: () =>
      api.get<{ total: number; answered: number; missed: number; avgDuration: number }>(
        "/api/v1/admin/reports/summary",
      ),
  });
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<{ ok: boolean; db: boolean; asterisk: boolean }>("/api/v1/health"),
    refetchInterval: 10000,
  });
  const extensions = useQuery({
    queryKey: ["extensions"],
    queryFn: () =>
      api.get<Array<{ id: string; number: string; name: string }>>("/api/v1/admin/extensions"),
  });

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    ws.onopen = () => setWsNote("live");
    ws.onclose = () => setWsNote("offline");
    ws.onmessage = () => {
      void qc.invalidateQueries({ queryKey: ["live"] });
    };
    return () => ws.close();
  }, [qc]);

  useEffect(() => {
    const online = (live.data?.extensions ?? [])
      .filter((e) => e.state === "idle" || e.state === "busy" || e.state === "ringing")
      .map((e) => e.number);
    const registered = online[0] ?? extensions.data?.[0]?.number;
    if (!registered) return;
    // Prefer an online listener; avoid defaulting to offline 100
    const stillOk =
      online.includes(listenerExt) ||
      (extensions.data ?? []).some((e) => e.number === listenerExt);
    if (!stillOk || listenerExt === "100") {
      const prefer = online.find((n) => n !== "101") ?? online[0] ?? registered;
      if (prefer) setListenerExt(prefer);
    }
  }, [extensions.data, live.data?.extensions, listenerExt]);

  async function spy(id: string, mode: "listen" | "whisper" | "barge") {
    try {
      await api.post(`/api/v1/admin/live/calls/${id}/spy`, {
        mode,
        listenerExtension: listenerExt,
      });
      toast.success(tr("{{v0}} → {{v1}} (answer the ringing softphone)", { v0: mode, v1: listenerExt }));
      void qc.invalidateQueries({ queryKey: ["live"] });
    } catch (e) {
      toast.error((e as Error).message);
      void qc.invalidateQueries({ queryKey: ["live"] });
    }
  }

  async function cleanupSnoops() {
    try {
      const r = await api.post<{ hungupSnoops: number }>("/api/v1/admin/live/cleanup", {});
      toast.success(tr("Cleared {{v0}} stuck spy channel(s)", { v0: r.hungupSnoops }));
      void qc.invalidateQueries({ queryKey: ["live"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className={tv ? "fixed inset-0 z-50 overflow-auto bg-[var(--bg)] p-8" : ""}>
      <PageHeader
        icon={LayoutDashboard}
        title={t("dashboard.title")}
        tone="cyan"
        description={
          <>
            {tr("Asterisk:")}{" "}
            <span className={health.data?.asterisk ? "badge badge-ok" : "badge badge-err"}>
              {health.data?.asterisk ? t("dashboard.connected") : t("dashboard.disconnected")}
            </span>{" "}
            {tr("· WS:")} {wsNote}
          </>
        }
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              {tr("Spy listener")}
              <SelectInput
                className="w-auto min-w-[8rem]"
                aria-label={tr("Spy listener")}
                value={listenerExt}
                onValueChange={setListenerExt}
                options={
                  (extensions.data ?? []).length > 0
                    ? (extensions.data ?? []).map((e) => ({
                        value: e.number,
                        label: `${e.number} — ${e.name}`,
                      }))
                    : [{ value: listenerExt || " ", label: listenerExt || "—" }]
                }
              />
            </label>
            <Button type="button" onClick={() => void cleanupSnoops()}>
              <Trash2 size={16} />
              {tr("Clear stuck spy")}
            </Button>
            <Button type="button" onClick={() => setTv((v) => !v)}>
              <Tv size={16} />
              {tv ? tr("Exit TV") : tr("TV mode")}
            </Button>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={PhoneCall}
          label={t("dashboard.activeCalls")}
          value={live.data?.calls.length ?? 0}
          tone="cyan"
        />
        <StatTile
          icon={PhoneOutgoing}
          label={t("reports.answered")}
          value={summary.data?.answered ?? 0}
          tone="success"
        />
        <StatTile
          icon={PhoneMissed}
          label={t("reports.missed")}
          value={summary.data?.missed ?? 0}
          tone="danger"
        />
        <StatTile
          icon={Clock3}
          label={t("reports.avgTalk")}
          value={`${summary.data?.avgDuration ?? 0}s`}
          tone="blue"
        />
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-3 font-medium">{tr("Trunks")}</div>
          <div className="flex flex-wrap gap-2 p-4">
            {(live.data?.trunks ?? []).length === 0 ? (
              <span className="text-sm text-[var(--text-muted)]">{tr("No trunks")}</span>
            ) : (
              (live.data?.trunks ?? []).map((t) => {
                const up = /regist|ok|avail/i.test(t.state);
                return (
                  <span key={t.id} className={`badge gap-1.5 ${up ? "badge-ok" : "badge-err"}`} title={t.host}>
                    <LiveDot live={up} tone={up ? "ok" : "err"} />
                    {t.name}: {t.state}
                  </span>
                );
              })
            )}
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-3 font-medium">{tr("Extensions")}</div>
          <div className="flex flex-wrap gap-2 p-4">
            {(live.data?.extensions ?? []).length === 0 ? (
              <span className="text-sm text-[var(--text-muted)]">{tr("No presence data yet")}</span>
            ) : (
              live.data?.extensions.map((e) => (
                <span key={e.number} className="badge gap-1.5" title={e.name}>
                  <LiveDot
                    live={e.state === "busy"}
                    tone={e.state === "offline" ? "err" : e.state === "online" ? "ok" : "busy"}
                  />
                  {e.number} · {tr(PRESENCE_LABEL[e.state] ?? e.state)}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-3 font-medium">{tr("Queues")}</div>
          <table className="table">
            <thead>
              <tr>
                <th>{tr("Queue")}</th>
                <th>{tr("Members")}</th>
                <th>{tr("Paused")}</th>
                <th>{tr("Waiting")}</th>
              </tr>
            </thead>
            <tbody>
              {(live.data?.queues ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4}>—</td>
                </tr>
              ) : (
                live.data?.queues.map((q) => (
                  <tr key={q.number}>
                    <td className="font-mono">
                      {q.number} {q.name}
                    </td>
                    <td>{q.members}</td>
                    <td>{q.paused}</td>
                    <td>{q.waiting}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3 font-medium">
          {t("dashboard.activeCalls")}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>{tr("ID")}</th>
              <th>{t("cdr.caller")}</th>
              <th>{t("cdr.callee")}</th>
              <th>{t("common.status")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(live.data?.calls ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="text-[var(--text-muted)]">
                  —
                </td>
              </tr>
            ) : (
              live.data?.calls.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-sm" title={c.name ?? c.id}>
                    {(c.name ?? c.id).slice(0, 22)}
                  </td>
                  <td>{c.caller || "—"}</td>
                  <td>{c.callee || "—"}</td>
                  <td>
                    <span className="badge">{c.state}</span>
                  </td>
                  <td className="flex flex-wrap gap-1">
                    <Button type="button" onClick={() => void spy(c.id, "listen")}>
                      {tr("Spy")}
                    </Button>
                    <Button type="button" onClick={() => void spy(c.id, "whisper")}>
                      {tr("Whisper")}
                    </Button>
                    <Button type="button" onClick={() => void spy(c.id, "barge")}>
                      {tr("Barge")}
                    </Button>
                    <Button
                      variant="solid" color="red"
                      type="button"
                      onClick={() =>
                        void api
                          .post(`/api/v1/admin/live/calls/${c.id}/hangup`)
                          .then(() => qc.invalidateQueries({ queryKey: ["live"] }))
                          .catch((e: Error) => toast.error(e.message))
                      }
                    >
                      {tr("Hangup")}
                    </Button>
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
