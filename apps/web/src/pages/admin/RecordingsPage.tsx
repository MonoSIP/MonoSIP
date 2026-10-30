import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import WaveSurfer from "wavesurfer.js";
import { ClipboardList, Disc, Download, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { IconBtn, IconLink, Modal, PageHeader, SectionCard } from "../../components/ui";
import { tr } from "../../i18n";

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

  const list = useQuery({
    queryKey: ["recordings"],
    queryFn: () => api.get<Rec[]>("/api/v1/admin/recordings"),
  });
  const playing = (list.data ?? []).find((r) => r.id === playingId) ?? null;
  const accessRec = (list.data ?? []).find((r) => r.id === accessId) ?? null;

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
            ? `${new Date(playing.createdAt).toLocaleString()} · ${playing.duration}s`
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
                {new Date(a.at).toLocaleString()} · {a.actorType} · {a.action}
              </li>
            ))}
          </ul>
        )}
      </Modal>
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
              {(list.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4}>—</td>
                </tr>
              ) : (
                list.data?.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-sm">{parties(r)}</td>
                    <td>{r.duration}s</td>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
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
      </SectionCard>
    </div>
  );
}
