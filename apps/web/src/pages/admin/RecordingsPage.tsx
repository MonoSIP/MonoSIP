import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import WaveSurfer from "wavesurfer.js";
import { ClipboardList, Disc, Download, FileAudio, Pause, Play, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { IconBtn, IconLink, PageHeader, SectionCard } from "../../components/ui";
import { tr } from "../../i18n";

type Rec = {
  id: string;
  callId: string;
  duration: number;
  createdAt: string;
  archived?: boolean;
  filePath?: string;
};

export function RecordingsPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [playingId, setPlayingId] = useState<string | null>(params.get("id"));
  const [accessId, setAccessId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [canPlay, setCanPlay] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);

  const list = useQuery({
    queryKey: ["recordings"],
    queryFn: () => api.get<Rec[]>("/api/v1/admin/recordings"),
  });

  const access = useQuery({
    queryKey: ["rec-access", accessId],
    queryFn: () =>
      api.get<Array<{ id: string; action: string; at: string; actorType: string }>>(
        `/api/v1/admin/recordings/${accessId}/access-log`,
      ),
    enabled: !!accessId,
  });

  useEffect(() => {
    if (!playingId || !waveRef.current) return;
    setLoadError(null);
    setCanPlay(false);
    setIsPlaying(false);
    wsRef.current?.destroy();
    const ws = WaveSurfer.create({
      container: waveRef.current,
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
  }, [playingId]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Disc}
        title={t("nav.recordings")}
        tone="coral"
        description={tr("Listen, download, access log")}
      />
      {playingId && (
        <SectionCard title={tr("Player")} icon={FileAudio} tone="coral">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-[var(--text-muted)]">
                {loadError
                  ? loadError
                  : isPlaying
                    ? `Playing ${playingId.slice(0, 8)}…`
                    : `Loaded ${playingId.slice(0, 8)}`}
              </span>
              <div className="btn-icon-row">
                <IconBtn
                  icon={isPlaying ? Pause : Play}
                  label={isPlaying ? "Pause" : "Play"}
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
                <IconBtn icon={X} label={tr("Close")} onClick={() => setPlayingId(null)} />
              </div>
            </div>
            <div ref={waveRef} />
          </div>
        </SectionCard>
      )}
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
                    <td className="font-mono text-sm">{r.callId}</td>
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
      {accessId && (
        <SectionCard
          title={tr("Access log")}
          icon={ClipboardList}
          tone="coral"
          actions={<IconBtn icon={X} label={tr("Close")} onClick={() => setAccessId(null)} />}
        >
          <ul className="space-y-1 text-sm">
            {(access.data ?? []).length === 0 ? (
              <li className="text-[var(--text-muted)]">—</li>
            ) : (
              access.data?.map((a) => (
                <li key={a.id}>
                  {new Date(a.at).toLocaleString()} · {a.actorType} · {a.action}
                </li>
              ))
            )}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
