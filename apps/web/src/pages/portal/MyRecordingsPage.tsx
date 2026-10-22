import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import WaveSurfer from "wavesurfer.js";
import { toast } from "sonner";
import { Disc, FileAudio } from "lucide-react";
import { api } from "../../lib/api";
import { PageHeader, SectionCard } from "../../components/ui";

export function MyRecordingsPage() {
  const { t } = useTranslation();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);

  const list = useQuery({
    queryKey: ["my-recordings"],
    queryFn: () =>
      api.get<Array<{ id: string; callId: string; duration: number; createdAt: string }>>(
        "/api/v1/me/recordings",
      ),
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
      height: 56,
      url: `/api/v1/me/recordings/${playingId}/stream`,
      fetchParams: { credentials: "include" },
    });
    wsRef.current = ws;
    ws.on("ready", () => {
      if (!ws.getDuration() || ws.getDuration() < 0.05) {
        setLoadError("Recording file is empty");
        return;
      }
      void ws.play().then(() => setIsPlaying(true)).catch((e) => {
        setLoadError(String(e));
        toast.error("Playback failed");
      });
    });
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));
    ws.on("error", () => {
      setLoadError("Could not load audio");
      toast.error("Could not load recording");
    });
    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [playingId]);

  return (
    <div className="space-y-4">
      <PageHeader icon={FileAudio} title={t("nav.myRecordings")} tone="coral" />
      {playingId && (
        <SectionCard title="Playback" icon={Disc} tone="coral">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-[var(--text-muted)]">
              {loadError ?? (isPlaying ? "Playing…" : "Ready")}
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
        </SectionCard>
      )}
      {list.isFetched && (list.data ?? []).length === 0 ? (
        <div className="vm-empty" role="status">
          <span className="vm-empty-mark" aria-hidden="true">
            <FileAudio size={22} strokeWidth={2.25} />
          </span>
          <span className="vm-empty-wave" aria-hidden="true">
            {Array.from({ length: 27 }, (_, i) => (
              <span key={i} />
            ))}
          </span>
          <p>{t("portal.recordingsEmpty")}</p>
        </div>
      ) : (list.data ?? []).length === 0 ? null : (
        <SectionCard title="Recordings" icon={FileAudio} tone="coral">
          <div className="space-y-3">
            {list.data?.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] p-3"
              >
                <div>
                  <div className="font-mono text-sm">{r.callId}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {new Date(r.createdAt).toLocaleString()} · {r.duration}s
                  </div>
                </div>
                <button className="btn" type="button" onClick={() => setPlayingId(r.id)}>
                  Play
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
