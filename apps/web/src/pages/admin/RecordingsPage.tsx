import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import WaveSurfer from "wavesurfer.js";
import { ClipboardList, Disc, FileAudio } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { PageHeader, SectionCard } from "../../components/ui";

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
        setLoadError("Recording file is empty or unreadable");
        return;
      }
      void ws.play().then(() => setIsPlaying(true)).catch((e) => {
        setLoadError(String(e));
        toast.error("Playback failed — check browser audio permission");
      });
    });
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));
    ws.on("error", (e) => {
      console.error("[recordings] wavesurfer", e);
      setLoadError("Could not load audio (auth or file missing)");
      toast.error("Could not load recording");
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
        description="Listen, download, and review access logs for stored call recordings"
      />
      {playingId && (
        <SectionCard title="Player" icon={FileAudio} tone="coral">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-[var(--text-muted)]">
                {loadError
                  ? loadError
                  : isPlaying
                    ? `Playing ${playingId.slice(0, 8)}…`
                    : `Loaded ${playingId.slice(0, 8)}`}
              </span>
              <div className="flex gap-2">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!!loadError}
                  onClick={() => {
                    const ws = wsRef.current;
                    if (!ws) return;
                    if (ws.isPlaying()) ws.pause();
                    else void ws.play();
                  }}
                >
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button className="btn" type="button" onClick={() => setPlayingId(null)}>
                  Close
                </button>
              </div>
            </div>
            <div ref={waveRef} />
          </div>
        </SectionCard>
      )}
      <SectionCard title="Recordings" icon={Disc} tone="blue" className="!p-0 overflow-hidden">
        <div className="overflow-auto px-4 pb-4 md:px-5 md:pb-5">
          <table className="table">
            <thead>
              <tr>
                <th>Call</th>
                <th>{t("cdr.duration")}</th>
                <th>Created</th>
                <th>{t("common.actions")}</th>
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
                    <td className="flex flex-wrap gap-2">
                      <button className="btn" type="button" onClick={() => setPlayingId(r.id)}>
                        Play
                      </button>
                      <a className="btn" href={`/api/v1/admin/recordings/${r.id}/download`}>
                        Download
                      </a>
                      <button className="btn" type="button" onClick={() => setAccessId(r.id)}>
                        Access log
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
      {accessId && (
        <SectionCard
          title="Access log"
          icon={ClipboardList}
          tone="coral"
          actions={
            <button className="btn" type="button" onClick={() => setAccessId(null)}>
              Close
            </button>
          }
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
