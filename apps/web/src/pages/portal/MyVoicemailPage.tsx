import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Pause, Play, Trash2, Voicemail } from "lucide-react";
import { api } from "../../lib/api";
import { PageHeader, SectionCard } from "../../components/ui";

type VoicemailRow = {
  id: string;
  caller: string | null;
  at: string;
  read: boolean;
};

export function MyVoicemailPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["voicemails"],
    queryFn: () => api.get<VoicemailRow[]>("/api/v1/me/voicemails"),
  });

  function toggle(id: string) {
    setConfirmId(null);
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    void api
      .patch(`/api/v1/me/voicemails/${id}`, { read: true })
      .then(() => qc.invalidateQueries({ queryKey: ["voicemails"] }))
      .catch((e: Error) => toast.error(e.message));
  }

  async function remove(id: string) {
    try {
      await api.delete(`/api/v1/me/voicemails/${id}`);
      if (openId === id) setOpenId(null);
      setConfirmId(null);
      toast.success(t("portal.deleted"));
      void qc.invalidateQueries({ queryKey: ["voicemails"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader icon={Voicemail} title={t("nav.voicemail")} tone="cyan" />
      <SectionCard title={t("nav.voicemail")} icon={Voicemail} tone="cyan">
        {(list.data ?? []).length === 0 ? (
          <p className="text-[var(--text-muted)]">{t("portal.voicemailEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {list.data?.map((v) => {
              const open = openId === v.id;
              return (
                <li
                  key={v.id}
                  className={`overflow-hidden rounded-lg border ${
                    open ? "border-[var(--accent)]" : "border-[var(--border)]"
                  }`}
                >
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 px-3 py-3 text-left ${
                      open ? "bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]" : ""
                    }`}
                    aria-expanded={open}
                    onClick={() => toggle(v.id)}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${v.read ? "bg-transparent" : "bg-[var(--accent)]"}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-base">{v.caller || "—"}</span>
                      <span className="block text-xs text-[var(--text-muted)]">
                        {new Date(v.at).toLocaleString()}
                        {!v.read ? ` · ${t("portal.unread")}` : ""}
                      </span>
                    </span>
                  </button>
                  {open && (
                    <MessageDetail
                      row={v}
                      confirming={confirmId === v.id}
                      onAskDelete={() => setConfirmId(v.id)}
                      onDelete={() => void remove(v.id)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function MessageDetail({
  row,
  confirming,
  onAskDelete,
  onDelete,
}: {
  row: VoicemailRow;
  confirming: boolean;
  onAskDelete: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setSrc(null);
    setError(null);
    setPlaying(false);
    void (async () => {
      const res = await fetch(`/api/v1/me/voicemails/${row.id}/stream`, { credentials: "include" });
      if (!res.ok) {
        throw new Error(res.status === 404 ? t("portal.recordingMissing") : t("portal.playbackFailed"));
      }
      const blob = await res.blob();
      if (blob.size < 128) throw new Error(t("portal.recordingMissing"));
      objectUrl = URL.createObjectURL(blob);
      if (cancelled) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setSrc(objectUrl);
    })().catch((e: Error) => {
      if (!cancelled) setError(e.message || t("portal.playbackFailed"));
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [row.id, t]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!src || !audio) return;
    try {
      const started = audio.play();
      if (started && typeof started.then === "function") {
        void started.then(() => setPlaying(true)).catch(() => setPlaying(false));
      }
    } catch {
      setPlaying(false);
    }
  }, [src]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      setPlaying(false);
      return;
    }
    try {
      const started = audio.play();
      if (started && typeof started.then === "function") {
        void started.then(() => setPlaying(true)).catch(() => setError(t("portal.playbackFailed")));
      }
    } catch {
      setError(t("portal.playbackFailed"));
    }
  }

  return (
    <div className="space-y-3 border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--accent)_5%,var(--card))] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[var(--text-muted)]">{t("portal.callerId")}</p>
          <p className="font-mono text-2xl leading-tight">{row.caller || "—"}</p>
          <p className="text-sm text-[var(--text-muted)]">{new Date(row.at).toLocaleString()}</p>
        </div>
        {confirming ? (
          <button className="btn btn-danger" type="button" onClick={onDelete}>
            <Trash2 size={16} />
            {t("portal.confirmDelete")}
          </button>
        ) : (
          <button className="btn" type="button" onClick={onAskDelete}>
            <Trash2 size={16} />
            {t("portal.delete")}
          </button>
        )}
      </div>
      {error ? (
        <p className="text-sm text-[var(--danger)]">{error}</p>
      ) : src ? (
        <div className="space-y-2">
          <button className="btn btn-primary" type="button" onClick={togglePlay}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
            {playing ? t("portal.pause") : t("portal.play")}
          </button>
          <audio
            ref={audioRef}
            className="w-full"
            controls
            src={src}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => setError(t("portal.playbackFailed"))}
          />
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">{t("common.loading")}</p>
      )}
    </div>
  );
}
