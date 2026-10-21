import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  CalendarRange,
  Gauge,
  Hash,
  ListOrdered,
  Phone,
  Radio,
} from "lucide-react";
import { api } from "../../lib/api";
import { PageHeader, SectionCard, TextField } from "../../components/ui";
import { tr } from "../../i18n";

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
    <div className="space-y-6">
      <PageHeader
        icon={BarChart3}
        title={t("reports.title")}
        tone="cyan"
        description={tr("Call volume, queues, IVR, and voice quality for the selected range")}
      />
      <SectionCard title={tr("Date range")} icon={CalendarRange} tone="cyan">
        <div className="toolbar">
          <TextField
            label={tr("From")}
            type="datetime-local"
            icon={CalendarRange}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <TextField
            label={tr("To")}
            type="datetime-local"
            icon={CalendarRange}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </SectionCard>
      <SectionCard title={tr("Summary")} icon={Phone} tone="cyan">
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Total", summary.data?.total ?? 0],
            [t("reports.answered"), summary.data?.answered ?? 0],
            [t("reports.missed"), summary.data?.missed ?? 0],
            ["Abandoned", summary.data?.abandoned ?? 0],
            ["SLA ≤20s", `${summary.data?.slaPercent ?? 0}%`],
            [t("reports.avgTalk"), `${summary.data?.avgDuration ?? 0}s`],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-4">
              <div className="text-sm text-[var(--text-muted)]">{tr(String(label))}</div>
              <div className="mt-1 text-2xl font-semibold">{value}</div>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title={tr("Voice quality")} icon={Gauge} tone="blue">
        <div className="grid gap-4 sm:grid-cols-4">
          {(quality.data?.total ?? 0) === 0 ? (
            <p className="col-span-full text-sm text-[var(--text-muted)]">
              {tr("Voice quality (MOS/jitter/loss) has no samples yet — make answered calls so dialplan can post RTP QoS this lab build.")}
            </p>
          ) : (
            [
              ["MOS avg", (quality.data?.avgMos ?? 0).toFixed(2)],
              ["Jitter avg", (quality.data?.avgJitter ?? 0).toFixed(1)],
              ["Loss %", (quality.data?.avgLoss ?? 0).toFixed(2)],
              ["Quality samples", quality.data?.total ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-4">
                <div className="text-sm text-[var(--text-muted)]">{tr(String(label))}</div>
                <div className="mt-1 text-2xl font-semibold">{value}</div>
              </div>
            ))
          )}
        </div>
      </SectionCard>
      <SectionCard title={tr("By queue")} icon={ListOrdered} tone="cyan" flush>
        <table className="table">
          <thead>
            <tr>
              <th className="col-grow">{tr("Queue")}</th>
              <th className="col-num">{tr("Calls")}</th>
              <th className="col-num">{tr("Answered")}</th>
              <th className="col-num">{tr("Abandoned")}</th>
              <th className="col-num">{tr("Avg wait")}</th>
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
                    <td className="col-grow font-mono">{r.queue}</td>
                    <td className="col-num">{r.total}</td>
                    <td className="col-num">{r.answered ?? "—"}</td>
                    <td className="col-num">{r.abandoned ?? "—"}</td>
                    <td className="col-num">{r.avgWait}s</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </SectionCard>
      <SectionCard title={tr("By extension")} icon={Hash} tone="blue" flush>
        <table className="table">
          <thead>
            <tr>
              <th className="col-grow">{t("extensions.number")}</th>
              <th className="col-num">{tr("Calls")}</th>
              <th className="col-num">{tr("Talk")}</th>
            </tr>
          </thead>
          <tbody>
            {(byExt.data ?? [])
              .filter((r) => r.extension)
              .map((r) => (
                <tr key={r.extension}>
                  <td className="col-grow font-mono">{r.extension}</td>
                  <td className="col-num">{r.total}</td>
                  <td className="col-num">{r.talk}s</td>
                </tr>
              ))}
          </tbody>
        </table>
      </SectionCard>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={tr("IVR DTMF")} icon={Radio} tone="coral" flush>
          <table className="table">
            <thead>
              <tr>
                <th>{tr("Digit")}</th>
                <th className="col-num">{tr("Count")}</th>
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
                    <td className="col-num">{r.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </SectionCard>
        <SectionCard title={tr("IVR hangup location")} icon={Radio} tone="coral" flush>
          <table className="table">
            <thead>
              <tr>
                <th>{tr("Where")}</th>
                <th className="col-num">{tr("Count")}</th>
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
                    <td className="col-num">{r.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </div>
  );
}
