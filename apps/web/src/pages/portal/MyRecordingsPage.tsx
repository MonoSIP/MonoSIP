import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import WaveSurfer from "wavesurfer.js";
import { toast } from "sonner";
import { FileAudio, Pause, Play } from "lucide-react";
import { api } from "../../lib/api";
import { tr } from "../../i18n";
import { Button, IconBtn, Modal, PageHeader, SectionCard } from "../../components/ui";

export function MyRecordingsPage() {
  const { t } = useTranslation();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [waveNode, setWaveNode] = useState<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);

  const list = useQuery({
    queryKey: ["my-recordings"],
    queryFn: () =>
      api.get<
        Array<{
          id: string;
          callId: string;
          caller: string | null;
          callee: string | null;
          duration: number;
          createdAt: string;
        }>
      >("/api/v1/me/recordings"),
  });
  const playing = (list.data ?? []).find((r) => r.id === playingId) ?? null;

  useEffect(() => {
    if (!playingId || !waveNode) return;
    setLoadError(null);
    setIsPlaying(false);
    wsRef.current?.destroy();
    const ws = WaveSurfer.create({
      container: waveNode,
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
  }, [playingId, waveNode]);

  return (
    <div className="space-y-4">
      <PageHeader icon={FileAudio} title={t("nav.myRecordings")} tone="coral" />
      <Modal
        open={!!playingId}
        onOpenChange={(next) => {
          if (!next) setPlayingId(null);
        }}
        title={
          playing
            ? playing.caller || playing.callee
              ? `${playing.caller || "—"} → ${playing.callee || "—"}`
              : tr("Player")
            : tr("Player")
        }
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
            disabled={!!loadError}
            onClick={() => {
              const ws = wsRef.current;
              if (!ws) return;
              if (ws.isPlaying()) ws.pause();
              else void ws.play();
            }}
          />
        }
      >
        <div ref={setWaveNode} className="min-h-16 w-full" />
      </Modal>
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
                  <div className="font-mono text-sm">
                    {r.caller || r.callee ? `${r.caller || "—"} → ${r.callee || "—"}` : "—"}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {new Date(r.createdAt).toLocaleString()} · {r.duration}s
                  </div>
                </div>
                <Button type="button" onClick={() => setPlayingId(r.id)}>
                  Play
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
