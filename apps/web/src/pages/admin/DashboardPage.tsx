import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";

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
        extensions: Array<{ number: string; state: string }>;
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
      toast.success(`${mode} → ${listenerExt} (answer the ringing softphone)`);
      void qc.invalidateQueries({ queryKey: ["live"] });
    } catch (e) {
      toast.error((e as Error).message);
      void qc.invalidateQueries({ queryKey: ["live"] });
    }
  }

  async function cleanupSnoops() {
    try {
      const r = await api.post<{ hungupSnoops: number }>("/api/v1/admin/live/cleanup", {});
      toast.success(`Cleared ${r.hungupSnoops} stuck spy channel(s)`);
      void qc.invalidateQueries({ queryKey: ["live"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className={tv ? "fixed inset-0 z-50 overflow-auto bg-[var(--bg)] p-8" : ""}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
          <p className="text-[var(--text-muted)]">
            Asterisk:{" "}
            <span className={health.data?.asterisk ? "badge badge-ok" : "badge badge-err"}>
              {health.data?.asterisk ? t("dashboard.connected") : t("dashboard.disconnected")}
            </span>{" "}
            · WS: {wsNote}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            Spy listener
            <select
              className="input w-auto min-w-[8rem]"
              value={listenerExt}
              onChange={(e) => setListenerExt(e.target.value)}
            >
              {(extensions.data ?? []).map((e) => (
                <option key={e.id} value={e.number}>
                  {e.number} — {e.name}
                </option>
              ))}
              {(extensions.data ?? []).length === 0 && <option value={listenerExt}>{listenerExt}</option>}
            </select>
          </label>
          <button className="btn" type="button" onClick={() => void cleanupSnoops()}>
            Clear stuck spy
          </button>
          <button className="btn" type="button" onClick={() => setTv((v) => !v)}>
            {tv ? "Exit TV" : "TV mode"}
          </button>
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t("dashboard.activeCalls"), value: live.data?.calls.length ?? 0 },
          { label: t("reports.answered"), value: summary.data?.answered ?? 0 },
          { label: t("reports.missed"), value: summary.data?.missed ?? 0 },
          { label: t("reports.avgTalk"), value: `${summary.data?.avgDuration ?? 0}s` },
        ].map((c) => (
          <div key={c.label} className="card p-5">
            <div className="text-sm text-[var(--text-muted)]">{c.label}</div>
            <div className="mt-2 text-3xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-3 font-medium">Trunks</div>
          <div className="flex flex-wrap gap-2 p-4">
            {(live.data?.trunks ?? []).length === 0 ? (
              <span className="text-sm text-[var(--text-muted)]">No trunks</span>
            ) : (
              (live.data?.trunks ?? []).map((t) => (
                <span
                  key={t.id}
                  className={`badge ${/regist|ok|avail/i.test(t.state) ? "badge-ok" : "badge-err"}`}
                  title={t.host}
                >
                  {t.name}: {t.state}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-3 font-medium">Extensions</div>
          <div className="flex flex-wrap gap-2 p-4">
            {(live.data?.extensions ?? []).length === 0 ? (
              <span className="text-sm text-[var(--text-muted)]">No presence data yet</span>
            ) : (
              live.data?.extensions.map((e) => (
                <span key={e.number} className="badge">
                  {e.number}:{e.state}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-3 font-medium">Queues</div>
          <table className="table">
            <thead>
              <tr>
                <th>Queue</th>
                <th>Members</th>
                <th>Paused</th>
                <th>Waiting</th>
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
              <th>ID</th>
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
                    <button className="btn" type="button" onClick={() => void spy(c.id, "listen")}>
                      Spy
                    </button>
                    <button className="btn" type="button" onClick={() => void spy(c.id, "whisper")}>
                      Whisper
                    </button>
                    <button className="btn" type="button" onClick={() => void spy(c.id, "barge")}>
                      Barge
                    </button>
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() =>
                        void api
                          .post(`/api/v1/admin/live/calls/${c.id}/hangup`)
                          .then(() => qc.invalidateQueries({ queryKey: ["live"] }))
                          .catch((e: Error) => toast.error(e.message))
                      }
                    >
                      Hangup
                    </button>
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
