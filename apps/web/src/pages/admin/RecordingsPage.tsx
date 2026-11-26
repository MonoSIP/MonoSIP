import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import WaveSurfer from "wavesurfer.js";
import { ClipboardList, Disc, Download, Filter, Pause, Play, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { Button, IconBtn, IconLink, Modal, PageHeader, Pagination, SectionCard, TextField } from "../../components/ui";
import { tr } from "../../i18n";
import { fmtDateTime, pbxLocalToIso } from "../../lib/datetime";
import { pagerLabels, type Paged } from "../../lib/pager";

type Rec = {
  id: string;
  callId: string;
  caller: string | null;
  callee: string | null;
  duration: number;
  createdAt: string;
  archived?: boolean;
  filePath?: string;
};

function parties(r: Rec): string {
  if (!r.caller && !r.callee) return "—";
  return `${r.caller || "—"} → ${r.callee || "—"}`;
}

export function RecordingsPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [playingId, setPlayingId] = useState<string | null>(params.get("id"));
  const [accessId, setAccessId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [canPlay, setCanPlay] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [waveNode, setWaveNode] = useState<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);

  // Typed filters apply on submit, so a half-typed number does not fire a query per key.
  const [draft, setDraft] = useState({ from: "", to: "", number: "" });
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const fromIso = filters.from ? pbxLocalToIso(filters.from) : null;
  const toIso = filters.to ? pbxLocalToIso(filters.to, true) : null;
  if (fromIso) qs.set("from", fromIso);
  if (toIso) qs.set("to", toIso);
  if (filters.number.trim()) qs.set("number", filters.number.trim());
  const filtered = !!(filters.from || filters.to || filters.number.trim());

  const list = useQuery({
    queryKey: ["recordings", qs.toString()],
    queryFn: () => api.get<Paged<Rec>>(`/api/v1/admin/recordings?${qs.toString()}`),
    placeholderData: (prev) => prev,
  });
  const rows = list.data?.items ?? [];
  // A recording opened from the call log (?id=) may be on another page.
  const single = useQuery({
    queryKey: ["recording", playingId],
    queryFn: () => api.get<Rec>(`/api/v1/admin/recordings/${playingId}`),
    enabled: !!playingId && !rows.some((r) => r.id === playingId),
    retry: false,
  });
  const playing = rows.find((r) => r.id === playingId) ?? single.data ?? null;
  const accessRec = rows.find((r) => r.id === accessId) ?? null;

  const access = useQuery({
    queryKey: ["rec-access", accessId],
    queryFn: () =>
      api.get<Array<{ id: string; action: string; at: string; actorType: string }>>(
        `/api/v1/admin/recordings/${accessId}/access-log`,
      ),
    enabled: !!accessId,
  });

  useEffect(() => {
    if (!playingId || !waveNode) return;
    setLoadError(null);
    setCanPlay(false);
    setIsPlaying(false);
    wsRef.current?.destroy();
    const ws = WaveSurfer.create({
      container: waveNode,
      waveColor: "var(--border)",
      progressColor: "var(--accent)",
      height: 64,
      url: `/api/v1/admin/recordings/${playingId}/stream`,
      // Cookie session auth — without this, stream returns 401 and waveform stays empty
      fetchParams: { credentials: "include" },
    });
    wsRef.current = ws;
    ws.on("ready", () => {
      const dur = ws.getDuration();
      if (!dur || dur < 0.05) {
        setLoadError(tr("Recording file is empty or unreadable"));
        return;
      }
      setCanPlay(true);
    });
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));
    ws.on("error", (e) => {
      console.error("[recordings] wavesurfer", e);
      setLoadError(tr("Could not load audio (auth or file missing)"));
      toast.error(tr("Could not load recording"));
    });
    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [playingId, waveNode]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Disc}
        title={t("nav.recordings")}
        tone="coral"
        description={tr("Listen, download, access log")}
      />
      <Modal
        open={!!playingId}
        onOpenChange={(next) => {
          if (!next) setPlayingId(null);
        }}
        title={playing ? parties(playing) : tr("Player")}
        description={
          loadError ??
          (playing
            ? `${fmtDateTime(playing.createdAt)} · ${playing.duration}s`
            : undefined)
        }
        maxWidth="40rem"
        footer={
          <IconBtn
            icon={isPlaying ? Pause : Play}
            label={isPlaying ? tr("Pause") : tr("Play")}
            primary
            disabled={!canPlay || !!loadError}
            onClick={() => {
              const ws = wsRef.current;
              if (!ws) return;
              if (ws.isPlaying()) {
                ws.pause();
                return;
              }
              void ws.play().catch(() => {
                toast.error(tr("Playback failed — check browser audio permission"));
              });
            }}
          />
        }
      >
        <div ref={setWaveNode} className="min-h-16 w-full" />
      </Modal>
      <Modal
        open={!!accessId}
        onOpenChange={(next) => {
          if (!next) setAccessId(null);
        }}
        title={tr("Access log")}
        description={accessRec ? parties(accessRec) : undefined}
      >
        {access.isError ? (
          <p className="text-sm text-[var(--text-muted)]">{tr("Could not load the access log")}</p>
        ) : !access.isFetched ? null : (access.data ?? []).length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{tr("No one has opened this recording yet.")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {access.data?.map((a) => (
              <li key={a.id}>
                {fmtDateTime(a.at)} · {a.actorType} · {a.action}
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <SectionCard title={tr("Filters")} icon={Filter} tone="cyan">
        <form
          className="toolbar toolbar-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters(draft);
            setPage(1);
          }}
        >
          <TextField
            label={tr("From")}
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          />
          <TextField
            label={tr("To")}
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          />
          <TextField
            className="flex-1"
            label={tr("Number")}
            inputMode="tel"
            placeholder={tr("Caller or called number")}
            value={draft.number}
            onChange={(e) => setDraft({ ...draft, number: e.target.value })}
          />
          <Button variant="solid" type="submit">
            <Filter size={16} />
            {tr("Filter")}
          </Button>
          {filtered || draft.from || draft.to || draft.number ? (
            <Button
              type="button"
              onClick={() => {
                const empty = { from: "", to: "", number: "" };
                setDraft(empty);
                setFilters(empty);
                setPage(1);
              }}
            >
              <X size={16} />
              {tr("Clear")}
            </Button>
          ) : null}
        </form>
      </SectionCard>
      <SectionCard title={tr("Recordings")} icon={Disc} tone="blue" flush>
        <table className="table">
            <thead>
              <tr>
                <th>{tr("Call")}</th>
                <th>{t("cdr.duration")}</th>
                <th>{tr("Created")}</th>
                <th className="col-actions">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-[var(--text-muted)]">
                    {list.isLoading
                      ? t("common.loading")
                      : filtered
                        ? tr("No recordings match these filters.")
                        : tr("No recordings yet.")}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-sm">{parties(r)}</td>
                    <td>{r.duration}s</td>
                    <td>{fmtDateTime(r.createdAt)}</td>
                    <td className="col-actions">
                      <div className="btn-icon-row">
                        <IconBtn icon={Play} label={tr("Play")} onClick={() => setPlayingId(r.id)} />
                        <IconLink
                          icon={Download}
                          label={tr("Download")}
                          href={`/api/v1/admin/recordings/${r.id}/download`}
                        />
                        <IconBtn
                          icon={ClipboardList}
                          label={tr("Access log")}
                          onClick={() => setAccessId(r.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        {(list.data?.total ?? 0) > 0 ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={list.data?.total ?? 0}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            labels={pagerLabels()}
          />
        ) : null}
      </SectionCard>
    </div>
  );
}
