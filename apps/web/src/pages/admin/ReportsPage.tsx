import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

export function ReportsPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rangeQs = () => {
    const q = new URLSearchParams();
    if (from) q.set("from", new Date(from).toISOString());
    if (to) q.set("to", new Date(to).toISOString());
    const s = q.toString();
    return s ? `?${s}` : "";
  };
  const summary = useQuery({
    queryKey: ["report-summary", from, to],
    queryFn: () =>
      api.get<{
        total: number;
        answered: number;
        missed: number;
        abandoned?: number;
        avgDuration: number;
        slaPercent?: number;
        abandonRate?: number;
      }>(`/api/v1/admin/reports/summary${rangeQs()}`),
  });
  const byExt = useQuery({
    queryKey: ["report-ext", from, to],
    queryFn: () =>
      api.get<Array<{ extension: string; total: number; talk: number }>>(
        `/api/v1/admin/reports/extensions${rangeQs()}`,
      ),
  });
  const byQueue = useQuery({
    queryKey: ["report-queues", from, to],
    queryFn: () =>
      api.get<
        Array<{
          queue: string | null;
          total: number;
          answered?: number;
          abandoned?: number;
          avgWait: number;
        }>
      >(`/api/v1/admin/reports/queues${rangeQs()}`),
  });
  const ivr = useQuery({
    queryKey: ["report-ivr", from, to],
    queryFn: () =>
      api.get<{
        items: Array<{ digit: string; count: number }>;
        hangups?: Array<{ where: string; count: number }>;
      }>(`/api/v1/admin/reports/ivr${rangeQs()}`),
  });
  const quality = useQuery({
    queryKey: ["report-quality", from, to],
    queryFn: () =>
      api.get<{ total: number; avgMos: number; avgJitter: number; avgLoss: number }>(
        `/api/v1/admin/reports/quality${rangeQs()}`,
      ),
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{t("reports.title")}</h1>
      <div className="flex flex-wrap gap-2">
        <input className="input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="input" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Total", summary.data?.total ?? 0],
          [t("reports.answered"), summary.data?.answered ?? 0],
          [t("reports.missed"), summary.data?.missed ?? 0],
          ["Abandoned", summary.data?.abandoned ?? 0],
          ["SLA ≤20s", `${summary.data?.slaPercent ?? 0}%`],
          [t("reports.avgTalk"), `${summary.data?.avgDuration ?? 0}s`],
        ].map(([label, value]) => (
          <div key={String(label)} className="card p-4">
            <div className="text-sm text-[var(--text-muted)]">{label}</div>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {(quality.data?.total ?? 0) === 0 ? (
          <div className="card col-span-full p-4 text-sm text-[var(--text-muted)]">
            Voice quality (MOS/jitter/loss) has no samples yet — make answered calls so dialplan can post RTP QoS
            this lab build.
          </div>
        ) : (
          [
            ["MOS avg", (quality.data?.avgMos ?? 0).toFixed(2)],
            ["Jitter avg", (quality.data?.avgJitter ?? 0).toFixed(1)],
            ["Loss %", (quality.data?.avgLoss ?? 0).toFixed(2)],
            ["Quality samples", quality.data?.total ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="card p-4">
              <div className="text-sm text-[var(--text-muted)]">{label}</div>
              <div className="mt-1 text-2xl font-semibold">{value}</div>
            </div>
          ))
        )}
      </div>
      <div className="card overflow-auto">
        <div className="border-b border-[var(--border)] px-4 py-3 font-medium">By queue</div>
        <table className="table">
          <thead>
            <tr>
              <th>Queue</th>
              <th>Calls</th>
              <th>Answered</th>
              <th>Abandoned</th>
              <th>Avg wait</th>
            </tr>
          </thead>
          <tbody>
            {(byQueue.data ?? []).filter((r) => r.queue).length === 0 ? (
              <tr>
                <td colSpan={5}>—</td>
              </tr>
            ) : (
              (byQueue.data ?? [])
                .filter((r) => r.queue)
                .map((r) => (
                  <tr key={String(r.queue)}>
                    <td className="font-mono">{r.queue}</td>
                    <td>{r.total}</td>
                    <td>{r.answered ?? "—"}</td>
                    <td>{r.abandoned ?? "—"}</td>
                    <td>{r.avgWait}s</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
      <div className="card overflow-auto">
        <div className="border-b border-[var(--border)] px-4 py-3 font-medium">By extension</div>
        <table className="table">
          <thead>
            <tr>
              <th>{t("extensions.number")}</th>
              <th>Calls</th>
              <th>Talk</th>
            </tr>
          </thead>
          <tbody>
            {(byExt.data ?? [])
              .filter((r) => r.extension)
              .map((r) => (
                <tr key={r.extension}>
                  <td className="font-mono">{r.extension}</td>
                  <td>{r.total}</td>
                  <td>{r.talk}s</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-auto">
          <div className="border-b border-[var(--border)] px-4 py-3 font-medium">IVR DTMF</div>
          <table className="table">
            <thead>
              <tr>
                <th>Digit</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {(ivr.data?.items ?? []).length === 0 ? (
                <tr>
                  <td colSpan={2}>—</td>
                </tr>
              ) : (
                ivr.data?.items.map((r) => (
                  <tr key={r.digit}>
                    <td className="font-mono">{r.digit}</td>
                    <td>{r.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="card overflow-auto">
          <div className="border-b border-[var(--border)] px-4 py-3 font-medium">IVR hangup location</div>
          <table className="table">
            <thead>
              <tr>
                <th>Where</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {(ivr.data?.hangups ?? []).length === 0 ? (
                <tr>
                  <td colSpan={2}>—</td>
                </tr>
              ) : (
                (ivr.data?.hangups ?? []).map((r) => (
                  <tr key={r.where}>
                    <td className="font-mono text-sm">{r.where}</td>
                    <td>{r.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
