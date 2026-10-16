import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import WaveSurfer from "wavesurfer.js";
import { toast } from "sonner";
import { api } from "../../lib/api";

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
      <h1 className="text-2xl font-semibold">{t("nav.myRecordings")}</h1>
      {playingId && (
        <div className="card space-y-2 p-4">
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
        </div>
      )}
      <div className="space-y-3">
        {(list.data ?? []).length === 0 ? (
          <div className="card p-4 text-[var(--text-muted)]">—</div>
        ) : (
          list.data?.map((r) => (
            <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
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
          ))
        )}
      </div>
    </div>
  );
}
