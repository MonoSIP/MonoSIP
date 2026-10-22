import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import WaveSurfer from "wavesurfer.js";
import { toast } from "sonner";
import { Pause, Play, Trash2, Voicemail } from "lucide-react";
import { api } from "../../lib/api";
import { IconBtn, PageHeader } from "../../components/ui";

type VoicemailRow = {
  id: string;
  caller: string | null;
  at: string;
  read: boolean;
};

export function MyVoicemailPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const players = useRef(new Set<WaveSurfer>());

  const list = useQuery({
    queryKey: ["voicemails"],
    queryFn: () => api.get<VoicemailRow[]>("/api/v1/me/voicemails"),
  });

  function markRead(id: string) {
    void api
      .patch(`/api/v1/me/voicemails/${id}`, { read: true })
      .then(() => qc.invalidateQueries({ queryKey: ["voicemails"] }))
      .catch((e: Error) => toast.error(e.message));
  }

  async function remove(id: string) {
    try {
      await api.delete(`/api/v1/me/voicemails/${id}`);
      setConfirmId(null);
      toast.success(t("portal.deleted"));
      void qc.invalidateQueries({ queryKey: ["voicemails"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const rows = list.data ?? [];
  const unread = rows.filter((v) => !v.read).length;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Voicemail}
        title={t("nav.voicemail")}
        tone="cyan"
        actions={
          rows.length > 0 ? (
            <span className={`vm-count ${unread ? "is-new" : ""}`}>
              {unread}/{rows.length}
            </span>
          ) : null
        }
      />
      {list.isFetched && rows.length === 0 ? (
        <div className="vm-empty" role="status">
          <span className="vm-empty-mark" aria-hidden="true">
            <Voicemail size={22} strokeWidth={2.25} />
          </span>
          <span className="vm-empty-wave" aria-hidden="true">
            {Array.from({ length: 27 }, (_, i) => (
              <span key={i} />
            ))}
          </span>
          <p>{t("portal.voicemailEmpty")}</p>
        </div>
      ) : rows.length === 0 ? null : (
        <ul className="space-y-2">
          {list.data?.map((v) => (
            <MessageRow
              key={v.id}
              row={v}
              players={players}
              confirming={confirmId === v.id}
              onPlay={() => markRead(v.id)}
              onAskDelete={() => setConfirmId(v.id)}
              onDelete={() => void remove(v.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MessageRow({
  row,
  players,
  confirming,
  onPlay,
  onAskDelete,
  onDelete,
}: {
  row: VoicemailRow;
  players: React.RefObject<Set<WaveSurfer>>;
  confirming: boolean;
  onPlay: () => void;
  onAskDelete: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const waveRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;
  const [heard, setHeard] = useState(row.read);
  const [playing, setPlaying] = useState(false);
  const heardRef = useRef(row.read);

  useEffect(() => {
    if (!row.read) return;
    heardRef.current = true;
    setHeard(true);
  }, [row.read]);

  useEffect(() => {
    if (!waveRef.current) return;
    const styles = getComputedStyle(document.documentElement);
    const green = styles.getPropertyValue("--success").trim() || "#047857";
    const ws = WaveSurfer.create({
      container: waveRef.current,
      waveColor: green,
      progressColor: green,
      cursorColor: styles.getPropertyValue("--foreground").trim() || green,
      height: 36,
      normalize: true,
      url: `/api/v1/me/voicemails/${row.id}/stream`,
      fetchParams: { credentials: "include" },
    });
    wsRef.current = ws;
    players.current?.add(ws);
    ws.on("ready", () => {
      if (!ws.getDuration() || ws.getDuration() < 0.05) toast.error(t("portal.recordingMissing"));
    });
    ws.on("click", () => {
      if (ws.isPlaying()) return;
      for (const other of players.current ?? []) {
        if (other !== ws && other.isPlaying()) other.pause();
      }
      void ws.play().catch(() => toast.error(t("portal.playbackFailed")));
    });
    ws.on("play", () => {
      setPlaying(true);
      if (heardRef.current) return;
      heardRef.current = true;
      setHeard(true);
      onPlayRef.current();
    });
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));
    ws.on("error", () => {
      toast.error(t("portal.playbackFailed"));
    });
    return () => {
      players.current?.delete(ws);
      ws.destroy();
      wsRef.current = null;
    };
  }, [row.id, t, players]);

  function playFromStart() {
    const ws = wsRef.current;
    if (!ws) return;
    for (const other of players.current ?? []) {
      if (other !== ws && other.isPlaying()) other.pause();
    }
    ws.setTime(0);
    void ws.play().catch(() => toast.error(t("portal.playbackFailed")));
  }

  return (
    <li
      className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (waveRef.current?.contains(target) || target.closest("button")) return;
        playFromStart();
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className={`vm-dot ${heard ? "is-heard" : "is-new"}`}
          aria-hidden="true"
        />
        <span className="w-40 shrink-0">
          <span className="block truncate font-mono text-sm">{row.caller || "—"}</span>
          <span className="block truncate text-xs text-[var(--text-muted)]">
            {new Date(row.at).toLocaleString()}
          </span>
        </span>
        <IconBtn
          icon={playing ? Pause : Play}
          label={playing ? t("portal.pause") : t("portal.play")}
          onClick={() => {
            const ws = wsRef.current;
            if (!ws) return;
            if (ws.isPlaying()) {
              ws.pause();
              return;
            }
            playFromStart();
          }}
        />
        <div ref={waveRef} className="vm-wave min-w-0 flex-1" />
        <IconBtn
          icon={Trash2}
          label={confirming ? t("portal.confirmDelete") : t("portal.delete")}
          danger={confirming}
          onClick={confirming ? onDelete : onAskDelete}
        />
      </div>
    </li>
  );
}
