import { useEffect, useRef, useState } from "react";
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
  ScrollText,
} from "lucide-react";
import { api } from "../../lib/api";
import { Button, PageHeader, SectionCard, TextField } from "../../components/ui";
import { LiveDot } from "../../components/motion";
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
        description={tr("Volume, queues, IVR, quality")}
      />
      <AsteriskLogCard />
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

const LOG_CAP = 800;

type LogRow = { id: number; text: string };

function lineClass(text: string): string {
  if (/\bERROR\[/.test(text)) return "asterisk-log-line is-err";
  if (/\bWARNING\[/.test(text)) return "asterisk-log-line is-warn";
  return "asterisk-log-line";
}

function AsteriskLogCard() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [state, setState] = useState<"connecting" | "open" | "missing" | "offline">("connecting");
  const [pinned, setPinned] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const seq = useRef(0);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource("/api/v1/admin/reports/asterisk-log");
    const meta = (ev: Event) => {
      const data = JSON.parse((ev as MessageEvent).data) as { state?: string };
      setState(data.state === "missing" ? "missing" : "open");
      setRows([]);
    };
    const line = (ev: Event) => {
      const text = String((ev as MessageEvent).data ?? "");
      if (!text) return;
      setState("open");
      const id = ++seq.current;
      setRows((prev) => {
        const next = prev.length >= LOG_CAP ? prev.slice(prev.length - LOG_CAP + 1) : prev.slice();
        next.push({ id, text });
        return next;
      });
    };
    es.addEventListener("meta", meta);
    es.addEventListener("line", line);
    es.onerror = () => {
      if (es.readyState !== EventSource.OPEN) setState("offline");
    };
    return () => {
      es.removeEventListener("meta", meta);
      es.removeEventListener("line", line);
      es.close();
    };
  }, []);

  useEffect(() => {
    const el = box.current;
    if (pinnedRef.current && el) el.scrollTop = el.scrollHeight;
  }, [rows]);

  function onScroll() {
    const el = box.current;
    if (!el) return;
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
    pinnedRef.current = atEnd;
    setPinned(atEnd);
  }

  function jump() {
    pinnedRef.current = true;
    setPinned(true);
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  const status =
    state === "open" ? tr("Live") : state === "missing" || state === "offline" ? tr("Offline") : tr("Waiting for lines");

  return (
    <SectionCard
      title={tr("Asterisk log")}
      icon={ScrollText}
      tone="cyan"
      actions={
        <span className="asterisk-log-status">
          <LiveDot live={state === "open"} tone={state === "open" ? "ok" : "err"} />
          {status}
          {pinned ? null : (
            <Button type="button" onClick={jump}>
              {tr("Back to live")}
            </Button>
          )}
        </span>
      }
    >
      <div ref={box} className="asterisk-log" role="log" aria-label={tr("Asterisk log")} onScroll={onScroll}>
        {rows.length === 0 ? (
          <p className="asterisk-log-empty">
            {state === "missing"
              ? tr("Asterisk log is not available yet")
              : state === "offline"
                ? tr("Log stream is not connected")
                : tr("Waiting for lines")}
          </p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className={lineClass(row.text)}>
              {row.text}
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}
