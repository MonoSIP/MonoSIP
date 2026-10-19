import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Languages, List, Mic, Pause, Play, Tag, Trash2, Upload, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { IconBtn, PageHeader, SectionCard, SelectField, TextAreaField, TextField } from "../../components/ui";
import { voiceOptions } from "./flow/nodeMeta";

type PromptRow = {
  source: "prompt" | "cache";
  id: string;
  name: string;
  language: string;
  ttsText: string | null;
  filePath: string | null;
  voice?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

async function uploadPromptFile(opts: {
  file: File;
  name?: string;
  language?: string;
  ttsText?: string;
  promptId?: string;
}) {
  const fd = new FormData();
  // Fields before file so @fastify/multipart attaches them to file.fields
  if (opts.name) fd.append("name", opts.name);
  if (opts.language) fd.append("language", opts.language);
  if (opts.ttsText) fd.append("ttsText", opts.ttsText);
  fd.append("file", opts.file);
  const url = opts.promptId
    ? `/api/v1/admin/prompts/${opts.promptId}/upload`
    : "/api/v1/admin/prompts/upload";
  const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export function PromptsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [name, setName] = useState("");
  const [ttsText, setTtsText] = useState("");
  const [language, setLanguage] = useState<"en" | "tr">("tr");
  const [voice, setVoice] = useState("female");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PromptRow | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  function clearBlob() {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }

  async function playPrompt(id: string) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === id) {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        void audio
          .play()
          .then(() => setIsPlaying(true))
          .catch((e) => toast.error(`Playback failed: ${(e as Error).message}`));
      }
      return;
    }
    try {
      audio.pause();
      clearBlob();
      const res = await fetch(`/api/v1/admin/prompts/${id}/stream`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      if (blob.size < 64) throw new Error("Audio file is empty");
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      audio.src = url;
      await audio.play();
      setPlayingId(id);
      setIsPlaying(true);
    } catch (e) {
      setPlayingId(null);
      setIsPlaying(false);
      toast.error(`Playback failed: ${(e as Error).message}`);
    }
  }

  const list = useQuery({
    queryKey: ["prompts"],
    queryFn: () => api.get<PromptRow[]>("/api/v1/admin/prompts"),
  });
  const ttsStatus = useQuery({
    queryKey: ["tts-status"],
    queryFn: () =>
      api.get<{ ok: boolean; engine?: string; error?: string }>(
        "/api/v1/admin/tts/status",
      ),
    refetchInterval: 30_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (audioFile) {
        return uploadPromptFile({
          file: audioFile,
          name: name || audioFile.name.replace(/\.[^.]+$/, ""),
          language,
          ttsText: ttsText || undefined,
        });
      }
      return api.post("/api/v1/admin/prompts", {
        name,
        language,
        ttsText,
        voice,
        synthesize: !!ttsText.trim(),
      });
    },
    onSuccess: () => {
      toast.success(
        audioFile
          ? t("prompts.uploaded", { defaultValue: "Audio uploaded" })
          : t("prompts.saved", { defaultValue: "Prompt saved" }),
      );
      setName("");
      setTtsText("");
      setAudioFile(null);
      if (fileRef.current) fileRef.current.value = "";
      void qc.invalidateQueries({ queryKey: ["prompts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const synthesize = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/admin/prompts/${id}/synthesize`, {}),
    onSuccess: () => {
      toast.success(t("prompts.synthesized", { defaultValue: "TTS audio generated" }));
      void qc.invalidateQueries({ queryKey: ["prompts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const replaceAudio = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      uploadPromptFile({ file, promptId: id }),
    onSuccess: () => {
      toast.success(t("prompts.uploaded", { defaultValue: "Audio uploaded" }));
      setReplaceId(null);
      if (replaceRef.current) replaceRef.current.value = "";
      void qc.invalidateQueries({ queryKey: ["prompts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/prompts/${id}`),
    onSuccess: (_data, id) => {
      toast.success(t("prompts.deleted", { defaultValue: "Prompt deleted" }));
      if (playingId === id) {
        audioRef.current?.pause();
        clearBlob();
        setPlayingId(null);
        setIsPlaying(false);
      }
      setPendingDelete(null);
      void qc.invalidateQueries({ queryKey: ["prompts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ttsBadge = (
    <span className="text-sm text-[var(--text-muted)]">
      TTS:{" "}
      <span className={ttsStatus.data?.ok ? "badge badge-ok" : "badge badge-err"}>
        {ttsStatus.data?.ok
          ? t("prompts.ttsReady", { defaultValue: "ready (EN + TR)" })
          : ttsStatus.data?.error ?? t("prompts.ttsOffline", { defaultValue: "offline" })}
      </span>
    </span>
  );

  return (
    <div className="space-y-6">
      <audio
        ref={audioRef}
        className="hidden"
        preload="auto"
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
      <PageHeader
        icon={Mic}
        title={t("nav.prompts")}
        tone="coral"
        description="IVR prompts — upload WAV or generate with TTS"
        actions={ttsBadge}
      />

      <SectionCard title={t("common.create", { defaultValue: "Create prompt" })} icon={AudioLines} tone="coral">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() && !audioFile) {
              toast.error(t("prompts.nameRequired", { defaultValue: "Name is required" }));
              return;
            }
            create.mutate();
          }}
        >
          <TextField
            label={t("prompts.name", { defaultValue: "Name" })}
            icon={Tag}
            placeholder={t("prompts.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required={!audioFile}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label={t("prompts.language", { defaultValue: "Language" })}
              icon={Languages}
              value={language}
              onChange={(e) => {
                const lang = e.target.value as "en" | "tr";
                setLanguage(lang);
                // EMA=TR-only, Kokoro=EN-only — fall back if voice becomes invalid.
                if (!voiceOptions(lang).some((o) => o.value === voice)) setVoice("female");
              }}
            >
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </SelectField>
            <SelectField
              label={t("prompts.voice", { defaultValue: "TTS model" })}
              icon={AudioLines}
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
            >
              {voiceOptions(language, { includeDefault: false }).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectField>
          </div>
          <TextAreaField
            label="TTS text"
            className="min-h-24"
            value={ttsText}
            onChange={(e) => setTtsText(e.target.value)}
            placeholder={t("prompts.ttsPlaceholder", {
              defaultValue: "Optional TTS text — or upload a WAV below",
            })}
          />

          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-soft)] p-4">
            <div className="mb-2 text-sm font-medium">
              {t("prompts.uploadTitle", { defaultValue: "Audio file upload" })}
            </div>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              {t("prompts.uploadHint", {
                defaultValue: "WAV recommended (mono, 8–22 kHz). Max 25 MB. Used directly in IVR.",
              })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".wav,.ulaw,.alaw,.gsm,audio/wav,audio/x-wav,audio/*"
                className="block w-full max-w-md text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--bg)]"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setAudioFile(f);
                  if (f && !name.trim()) setName(f.name.replace(/\.[^.]+$/, ""));
                }}
              />
              {audioFile && (
                <span className="text-sm text-[var(--text-muted)]">
                  {audioFile.name} ({Math.round(audioFile.size / 1024)} KB)
                  <button
                    type="button"
                    className="btn ml-2"
                    onClick={() => {
                      setAudioFile(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  >
                    {t("common.clear", { defaultValue: "Clear" })}
                  </button>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary w-fit" type="submit" disabled={create.isPending}>
              {audioFile
                ? t("prompts.createWithUpload", { defaultValue: "Create with audio file" })
                : ttsText.trim()
                  ? t("prompts.createAndSpeak", { defaultValue: "Create + generate TTS" })
                  : t("common.create")}
            </button>
          </div>
        </form>
      </SectionCard>

      <input
        ref={replaceRef}
        type="file"
        accept=".wav,.ulaw,.alaw,.gsm,audio/wav,audio/x-wav,audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && replaceId) replaceAudio.mutate({ id: replaceId, file: f });
        }}
      />

      <SectionCard title="All prompts" icon={List} tone="blue" flush>
        <table className="table">
            <thead>
              <tr>
                <th>Name / text</th>
                <th>Type</th>
                <th>Lang</th>
                <th>Created</th>
                <th>Expires</th>
                <th>File</th>
                <th className="col-actions">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7}>—</td>
                </tr>
              ) : (
                list.data?.map((p) => {
                  const isCache = p.source === "cache";
                  return (
                  <tr key={`${p.source}-${p.id}`}>
                    <td className="max-w-xs truncate" title={p.ttsText ?? p.name}>
                      {p.name}
                    </td>
                    <td>
                      <span className={`badge ${isCache ? "badge-ok" : ""}`}>
                        {isCache
                          ? t("prompts.typeCache", { defaultValue: "Cache" })
                          : t("prompts.typePrompt", { defaultValue: "Prompt" })}
                      </span>
                    </td>
                    <td>{p.language}</td>
                    <td className="whitespace-nowrap text-xs text-[var(--text-muted)]">
                      {fmtDate(p.createdAt)}
                    </td>
                    <td className="whitespace-nowrap text-xs text-[var(--text-muted)]">
                      {isCache ? fmtDate(p.expiresAt) : "—"}
                    </td>
                    <td className="font-mono text-xs">{p.filePath ? "yes" : "—"}</td>
                    <td className="col-actions">
                      <div className="btn-icon-row">
                        {p.filePath && (
                          <IconBtn
                            icon={playingId === p.id && isPlaying ? Pause : Play}
                            label={
                              playingId === p.id && isPlaying
                                ? t("prompts.pause", { defaultValue: "Pause" })
                                : t("prompts.play", { defaultValue: "Play" })
                            }
                            primary={playingId === p.id && isPlaying}
                            onClick={() => void playPrompt(p.id)}
                          />
                        )}
                        {!isCache && (
                          <>
                            <IconBtn
                              icon={Upload}
                              label={t("prompts.uploadReplace", { defaultValue: "Upload audio" })}
                              onClick={() => {
                                setReplaceId(p.id);
                                replaceRef.current?.click();
                              }}
                            />
                            <IconBtn
                              icon={Wand2}
                              label={t("prompts.generate", { defaultValue: "Generate TTS" })}
                              disabled={!p.ttsText || synthesize.isPending}
                              onClick={() => synthesize.mutate(p.id)}
                            />
                          </>
                        )}
                        <IconBtn
                          icon={Trash2}
                          label={t("common.delete", { defaultValue: "Delete" })}
                          danger
                          disabled={remove.isPending}
                          onClick={() => setPendingDelete(p)}
                        />
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
      </SectionCard>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prompt-delete-title"
          onClick={() => !remove.isPending && setPendingDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="prompt-delete-title" className="text-lg font-semibold">
              {pendingDelete.source === "cache"
                ? t("prompts.deleteCacheTitle", { defaultValue: "Delete cache entry?" })
                : t("prompts.deleteTitle", { defaultValue: "Delete prompt?" })}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {t("prompts.deleteConfirm", {
                name: pendingDelete.name,
                defaultValue: `Delete “${pendingDelete.name}”? The audio file will be removed. This cannot be undone.`,
              })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="btn"
                type="button"
                disabled={remove.isPending}
                onClick={() => setPendingDelete(null)}
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(pendingDelete.id)}
              >
                {remove.isPending
                  ? t("common.deleting", { defaultValue: "Deleting…" })
                  : t("common.delete", { defaultValue: "Delete" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
