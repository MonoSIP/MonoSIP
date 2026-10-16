import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("cdr.title")}</h1>
        <a className="btn" href={exportHref}>
          {t("common.export")}
        </a>
      </div>
      <form
        className="card flex flex-wrap gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void list.refetch();
        }}
      >
        <input className="input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="input" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        <input
          className="input"
          placeholder={t("cdr.caller")}
          value={caller}
          onChange={(e) => setCaller(e.target.value)}
        />
        <select className="input" value={disposition} onChange={(e) => setDisposition(e.target.value)}>
          <option value="">All dispositions</option>
          <option value="ANSWERED">ANSWERED</option>
          <option value="NOANSWER">NOANSWER</option>
          <option value="BUSY">BUSY</option>
          <option value="FAILED">FAILED</option>
        </select>
        <button className="btn btn-primary" type="submit">
          Filter
        </button>
      </form>
      <div className="card overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Dir</th>
              <th>{t("cdr.caller")}</th>
              <th>{t("cdr.callee")}</th>
              <th>{t("cdr.disposition")}</th>
              <th>{t("cdr.duration")}</th>
              <th>Agent</th>
              <th>MOS</th>
              <th>DND</th>
              <th>Rec</th>
              <th />
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
                  <td>{r.duration ?? 0}s</td>
                  <td className="font-mono text-xs">{r.extensionNumber ?? "—"}</td>
                  <td className="text-xs tabular-nums">
                    {r.mos != null ? r.mos.toFixed(2) : "—"}
                  </td>
                  <td>{r.dndFlag ? "yes" : "—"}</td>
                  <td>
                    {r.recordingId ? (
                      <a className="btn" href={`/recordings?id=${r.recordingId}`}>
                        Play
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <button className="btn" type="button" onClick={() => setTimelineId(r.id)}>
                      Timeline
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {timelineId && (
        <div className="card space-y-2 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Call timeline</h2>
            <button className="btn" type="button" onClick={() => setTimelineId(null)}>
              Close
            </button>
          </div>
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
        </div>
      )}
    </div>
  );
}
