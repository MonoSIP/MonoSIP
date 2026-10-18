import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Download, Filter, History, Play, X } from "lucide-react";
import { api } from "../../lib/api";
import { IconBtn, IconLink, PageHeader, SectionCard, SelectField, TextField } from "../../components/ui";

type CdrRow = {
  id: string;
  callId: string;
  startedAt: string;
  direction: string;
  caller: string | null;
  callee: string | null;
  disposition: string | null;
  duration: number | null;
  billsec?: number | null;
  dndFlag?: boolean;
  recordingId?: string | null;
  mos?: number | null;
  jitter?: number | null;
  packetLoss?: number | null;
  extensionNumber?: string | null;
};

export function CdrPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [caller, setCaller] = useState("");
  const [disposition, setDisposition] = useState("");
  const [timelineId, setTimelineId] = useState<string | null>(null);

  const qs = new URLSearchParams();
  if (from) qs.set("from", new Date(from).toISOString());
  if (to) qs.set("to", new Date(to).toISOString());
  if (caller) qs.set("caller", caller);
  if (disposition) qs.set("disposition", disposition);

  const list = useQuery({
    queryKey: ["cdr", from, to, caller, disposition],
    queryFn: () => api.get<CdrRow[]>(`/api/v1/admin/cdr?${qs.toString()}`),
  });

  const timeline = useQuery({
    queryKey: ["cdr-timeline", timelineId],
    queryFn: () =>
      api.get<{
        cdr: CdrRow;
        events: Array<{ id: string; at: string; type: string; data: unknown }>;
      }>(`/api/v1/admin/cdr/${timelineId}/timeline`),
    enabled: !!timelineId,
  });

  const exportHref = `/api/v1/admin/cdr/export?${qs.toString()}`;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={History}
        title={t("cdr.title")}
        tone="blue"
        description="Call detail records and quality metrics"
        actions={
          <a className="btn" href={exportHref}>
            <Download size={16} />
            {t("common.export")}
          </a>
        }
      />
      <SectionCard title="Filters" icon={Filter} tone="cyan">
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            void list.refetch();
          }}
        >
          <TextField label="From" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="To" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          <TextField
            label={t("cdr.caller")}
            value={caller}
            onChange={(e) => setCaller(e.target.value)}
          />
          <SelectField label={t("cdr.disposition")} value={disposition} onChange={(e) => setDisposition(e.target.value)}>
            <option value="">All dispositions</option>
            <option value="ANSWERED">ANSWERED</option>
            <option value="NOANSWER">NOANSWER</option>
            <option value="BUSY">BUSY</option>
            <option value="FAILED">FAILED</option>
          </SelectField>
          <button className="btn btn-primary" type="submit">
            <Filter size={16} />
            Filter
          </button>
        </form>
      </SectionCard>
      <SectionCard title="Call log" icon={History} tone="blue" flush>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th className="col-narrow">Dir</th>
              <th>{t("cdr.caller")}</th>
              <th>{t("cdr.callee")}</th>
              <th className="col-narrow">{t("cdr.disposition")}</th>
              <th className="col-num">{t("cdr.duration")}</th>
              <th className="col-narrow">Agent</th>
              <th className="col-num">MOS</th>
              <th className="col-num">DND</th>
              <th className="col-narrow">Rec</th>
              <th className="col-actions">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={11} className="text-[var(--text-muted)]">
                  No call records yet. Dial 900 from softphone to create one.
                </td>
              </tr>
            ) : (
              list.data?.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.startedAt).toLocaleString()}</td>
                  <td className="text-xs uppercase text-[var(--text-muted)]">{r.direction}</td>
                  <td className="font-mono">{r.caller ?? "—"}</td>
                  <td className="font-mono">{r.callee ?? "—"}</td>
                  <td>
                    <span className="badge">{r.disposition ?? "—"}</span>
                  </td>
                  <td className="col-num">{r.duration ?? 0}s</td>
                  <td className="font-mono text-xs">{r.extensionNumber ?? "—"}</td>
                  <td className="col-num text-xs">
                    {r.mos != null ? r.mos.toFixed(2) : "—"}
                  </td>
                  <td>{r.dndFlag ? "yes" : "—"}</td>
                  <td>
                    {r.recordingId ? (
                      <IconLink icon={Play} label="Play recording" href={`/recordings?id=${r.recordingId}`} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="col-actions">
                    <IconBtn icon={History} label="Timeline" onClick={() => setTimelineId(r.id)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </SectionCard>
      {timelineId && (
        <SectionCard
          title="Call timeline"
          icon={History}
          tone="coral"
          actions={<IconBtn icon={X} label="Close" onClick={() => setTimelineId(null)} />}
        >
          {(timeline.data?.events ?? []).length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No IVR/flow events for this call.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {timeline.data?.events.map((e) => (
                <li key={e.id} className="rounded bg-[var(--bg-soft)] px-2 py-1 font-mono text-xs">
                  {new Date(e.at).toLocaleTimeString()} · {e.type}{" "}
                  {e.data ? JSON.stringify(e.data) : ""}
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      )}
    </div>
  );
}
