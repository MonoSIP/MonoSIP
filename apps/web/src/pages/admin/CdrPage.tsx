import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Download, Filter, History, Play } from "lucide-react";
import { api } from "../../lib/api";
import { Button, IconBtn, IconLink, PageHeader, SectionCard, SelectField, TextField } from "../../components/ui";
import { tr } from "../../i18n";
import { nodeTitle } from "./flow/nodeMeta";

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
  answeredAt?: string | null;
  endedAt?: string | null;
  did?: string | null;
  queueNumber?: string | null;
  waitSec?: number | null;
  trunkId?: string | null;
};

type TimelineEvent = { id: string; at: string; type: string; data: unknown };

/** One readable line per IVR event: "Menu · Main menu", "Key: 1", "Exit: hangup". */
function describeEvent(e: TimelineEvent): { title: string; detail: string } {
  const d = (e.data ?? {}) as Record<string, unknown>;
  if (e.type === "flow.node") {
    const type = String(d.nodeType ?? "");
    const label = d.label ? String(d.label) : "";
    return { title: type ? nodeTitle(type) : tr("Step"), detail: label && label !== type ? label : "" };
  }
  if (e.type === "ivr.dtmf") return { title: tr("Key pressed"), detail: String(d.digit ?? "") };
  if (e.type === "flow.exit") return { title: tr("Flow ended"), detail: String(d.reason ?? "") };
  return { title: e.type, detail: Object.keys(d).length ? JSON.stringify(d) : "" };
}

const DIRECTION_LABEL: Record<string, string> = { internal: "Internal", inbound: "Inbound", outbound: "Outbound" };

const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString() : "—");

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
        description={tr("Call detail records and quality metrics")}
        actions={
          <Button asChild>
            <a href={exportHref}>
              <Download size={16} />
              {t("common.export")}
            </a>
          </Button>
        }
      />
      <SectionCard title={tr("Filters")} icon={Filter} tone="cyan">
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            void list.refetch();
          }}
        >
          <TextField label={tr("From")} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField label={tr("To")} type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          <TextField
            label={t("cdr.caller")}
            value={caller}
            onChange={(e) => setCaller(e.target.value)}
          />
          <SelectField
            label={t("cdr.disposition")}
            value={disposition}
            onValueChange={setDisposition}
            options={[
              { value: "", label: tr("All dispositions") },
              { value: "ANSWERED", label: tr("ANSWERED") },
              { value: "NOANSWER", label: tr("NOANSWER") },
              { value: "BUSY", label: tr("BUSY") },
              { value: "FAILED", label: tr("FAILED") },
            ]}
          />
          <Button variant="solid" type="submit">
            <Filter size={16} />
            {tr("Filter")}
          </Button>
        </form>
      </SectionCard>
      <SectionCard title={tr("Call log")} icon={History} tone="blue" flush>
        <table className="table">
          <thead>
            <tr>
              <th>{tr("Time")}</th>
              <th className="col-narrow">{tr("Dir")}</th>
              <th>{t("cdr.caller")}</th>
              <th>{t("cdr.callee")}</th>
              <th className="col-narrow">{t("cdr.disposition")}</th>
              <th className="col-num">{t("cdr.duration")}</th>
              <th className="col-narrow">{tr("Agent")}</th>
              <th className="col-num">{tr("MOS")}</th>
              <th className="col-num">{tr("DND")}</th>
              <th className="col-narrow">{tr("Rec")}</th>
              <th className="col-actions">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={11} className="text-[var(--text-muted)]">
                  {tr("No call records yet. Dial 900 from softphone to create one.")}
                </td>
              </tr>
            ) : (
              list.data?.map((r) => {
                const open = timelineId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      className={`cdr-row${open ? " is-open" : ""}`}
                      onClick={() => setTimelineId(open ? null : r.id)}
                      aria-expanded={open}
                    >
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          {new Date(r.startedAt).toLocaleString()}
                        </span>
                      </td>
                      <td className="text-xs uppercase text-[var(--text-muted)]">{tr(DIRECTION_LABEL[r.direction] ?? r.direction)}</td>
                      <td className="font-mono">{r.caller ?? "—"}</td>
                      <td className="font-mono">{r.callee ?? "—"}</td>
                      <td>
                        <span className="badge">{r.disposition ? tr(r.disposition) : "—"}</span>
                      </td>
                      <td className="col-num">{r.duration ?? 0}s</td>
                      <td className="font-mono text-xs">{r.extensionNumber ?? "—"}</td>
                      <td className="col-num text-xs">{r.mos != null ? r.mos.toFixed(2) : "—"}</td>
                      <td>{r.dndFlag ? tr("yes") : "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {r.recordingId ? (
                          <IconLink icon={Play} label={tr("Play recording")} href={`/recordings?id=${r.recordingId}`} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="col-actions">
                        <IconBtn
                          icon={open ? ChevronDown : History}
                          label={open ? tr("Close") : tr("Details")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTimelineId(open ? null : r.id);
                          }}
                        />
                      </td>
                    </tr>
                    {open && (
                      <tr className="cdr-detail">
                        <td colSpan={11}>
                          <div className="cdr-detail-grid">
                            <dl className="cdr-facts">
                              {(
                                [
                                  [tr("Call ID"), r.callId],
                                  [tr("Started"), fmtTime(r.startedAt)],
                                  [tr("Answered"), fmtTime(r.answeredAt)],
                                  [tr("Ended"), fmtTime(r.endedAt)],
                                  [tr("Duration"), `${r.duration ?? 0}s`],
                                  [tr("Talk time"), `${r.billsec ?? 0}s`],
                                  [tr("Wait"), r.waitSec != null ? `${r.waitSec}s` : "—"],
                                  ["DID", r.did ?? "—"],
                                  [tr("Queue"), r.queueNumber ?? "—"],
                                  [tr("Trunk"), r.trunkId ? r.trunkId.slice(0, 8) : "—"],
                                  ["MOS", r.mos != null ? r.mos.toFixed(2) : "—"],
                                  [tr("Jitter / loss"), r.jitter != null ? `${r.jitter} ms / ${r.packetLoss ?? 0}%` : "—"],
                                ] as Array<[string, string]>
                              ).map(([k, v]) => (
                                <div key={k}>
                                  <dt>{k}</dt>
                                  <dd className={k === tr("Call ID") ? "font-mono text-xs" : undefined}>{v}</dd>
                                </div>
                              ))}
                            </dl>
                            <div>
                              <div className="cdr-detail-title">{tr("Call timeline")}</div>
                              {timeline.isLoading ? (
                                <p className="text-sm text-[var(--text-muted)]">{t("common.loading")}</p>
                              ) : (timeline.data?.events ?? []).length === 0 ? (
                                <p className="text-sm text-[var(--text-muted)]">{tr("No IVR/flow events for this call.")}</p>
                              ) : (
                                <ol className="cdr-steps">
                                  {timeline.data?.events.map((e) => {
                                    const { title, detail } = describeEvent(e);
                                    return (
                                      <li key={e.id} className={`cdr-step cdr-step--${e.type.replace(/\W/g, "-")}`}>
                                        <span className="cdr-step-time">{new Date(e.at).toLocaleTimeString()}</span>
                                        <span className="cdr-step-title">{title}</span>
                                        {detail && <span className="cdr-step-detail">{detail}</span>}
                                      </li>
                                    );
                                  })}
                                </ol>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
