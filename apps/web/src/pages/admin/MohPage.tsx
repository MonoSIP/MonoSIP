import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Music, Pause, Pencil, Play, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { Button, ConfirmDialog, IconBtn, Modal, PageHeader, SectionCard, TextField, usePendingAction } from "../../components/ui";
import { tr } from "../../i18n";

type MohClass = { id: string; name: string; files: unknown };

export function MohPage() {
  const qc = useQueryClient();
  const actions = usePendingAction();
  const [name, setName] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingClass, setPendingClass] = useState<MohClass | null>(null);
  const [playing, setPlaying] = useState<{ id: string; file: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const list = useQuery({
    queryKey: ["moh"],
    queryFn: () => api.get<MohClass[]>("/api/v1/admin/moh"),
  });

  const create = useMutation({
    mutationFn: () => api.post("/api/v1/admin/moh", { name: name.trim(), files: [] }),
    onSuccess: () => {
      toast.success(tr("MOH class created"));
      setName("");
      setFormOpen(false);
      void qc.invalidateQueries({ queryKey: ["moh"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeClass = useMutation({
    mutationFn: (m: MohClass) => api.delete(`/api/v1/admin/moh/${m.id}`),
    onSuccess: () => {
      toast.success(tr("Removed"));
      void qc.invalidateQueries({ queryKey: ["moh"] });
    },
    // 409 names the queue / IVR that still uses the class
    onError: (e) => toast.error((e as Error).message),
  });

  // One class per name (it is also the Asterisk section and folder name)
  const nameKey = name.trim().toLowerCase();
  const nameTaken =
    nameKey === "default" || (list.data ?? []).some((m) => m.name.trim().toLowerCase() === nameKey);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  function clearBlob() {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }

  async function playFile(id: string, file: string) {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      clearBlob();
      const res = await fetch(
        `/api/v1/admin/moh/${id}/files/${encodeURIComponent(file)}/stream`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      if (blob.size < 64) throw new Error(tr("Audio file is empty"));
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      audio.src = url;
      await audio.play();
      setPlaying({ id, file });
      setIsPlaying(true);
    } catch (e) {
      setIsPlaying(false);
      setPlaying(null);
      toast.error(tr("Playback failed: {{v0}}", { v0: (e as Error).message }));
    }
  }

  async function upload(id: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/v1/admin/moh/${id}/upload`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      file?: string;
      converted?: boolean;
    };
    if (!res.ok) throw new Error(body.error ?? res.statusText);
    toast.success(
      body.converted
        ? `Uploaded & converted to 8 kHz WAV: ${body.file}`
        : `Uploaded ${body.file ?? file.name}`,
    );
    void qc.invalidateQueries({ queryKey: ["moh"] });
  }

  function togglePlay(id: string, file: string) {
    const audio = audioRef.current;
    if (playing?.id === id && playing.file === file) {
      if (!audio) return;
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        void audio
          .play()
          .then(() => setIsPlaying(true))
          .catch((e) => toast.error(tr("Playback failed: {{v0}}", { v0: (e as Error).message })));
      }
      return;
    }
    void playFile(id, file);
  }

  function stopPlay() {
    audioRef.current?.pause();
    clearBlob();
    if (audioRef.current) {
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    setPlaying(null);
    setIsPlaying(false);
  }

  function removeFile(id: string, file: string, active: boolean) {
    if (active) stopPlay();
    return api
      .delete(`/api/v1/admin/moh/${id}/files/${encodeURIComponent(file)}`)
      .then(() => {
        toast.success(tr("Removed"));
        void qc.invalidateQueries({ queryKey: ["moh"] });
      })
      .catch((e) => toast.error(String(e)));
  }

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
        icon={Music}
        title={tr("Music on Hold")}
        tone="blue"
        description={tr("Hold music files")}
      />
      <SectionCard
        title={tr("Classes")}
        icon={Music}
        tone="blue"
        flush
        actions={
          <Button type="button" variant="solid" onClick={() => setFormOpen(true)}>
            {tr("New MOH class")}
          </Button>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th className="col-grow">{tr("Class name")}</th>
              <th>{tr("File")}</th>
              <th className="col-actions">{tr("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={3} className="text-[var(--text-muted)]">{tr("No MOH classes yet.")}</td>
              </tr>
            ) : (
              list.data?.map((m) => {
                const files = Array.isArray(m.files) ? (m.files as string[]) : [];
                return (
                  <tr key={m.id}>
                    <td className="col-grow">{m.name}</td>
                    <td>{files.length}</td>
                    <td className="col-actions">
                      <div className="btn-icon-row">
                        <IconBtn icon={Pencil} label={tr("Edit")} onClick={() => setOpenId(m.id)} />
                        <IconBtn
                          icon={Trash2}
                          label={tr("Delete class")}
                          danger
                          pending={removeClass.isPending}
                          onClick={() => {
                            if (!removeClass.isPending) setPendingClass(m);
                          }}
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
      {list.data?.filter((m) => m.id === openId).map((m) => {
            const files = Array.isArray(m.files) ? (m.files as string[]) : [];
            return (
              <Modal
                key={m.id}
                open
                onOpenChange={(next) => {
                  if (!next) setOpenId(null);
                }}
                title={m.name}
                maxWidth="44rem"
                headerAside={
                  <>
                    <IconBtn
                      icon={Trash2}
                      label={tr("Delete class")}
                      danger
                      pending={removeClass.isPending}
                      onClick={() => {
                        if (!removeClass.isPending) setPendingClass(m);
                      }}
                    />
                    <input
                      ref={(el) => {
                        fileInputRefs.current[m.id] = el;
                      }}
                      type="file"
                      accept="audio/*,.wav,.mp3,.ogg,.m4a,.flac"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) {
                          void actions.run(`upload:${m.id}`, () =>
                            upload(m.id, f).catch((err) => toast.error((err as Error).message)),
                          );
                        }
                      }}
                    />
                    <Button
                      variant="solid"
                      type="button"
                      pending={actions.isPending(`upload:${m.id}`)}
                      onClick={() => {
                        if (!actions.isPending(`upload:${m.id}`)) fileInputRefs.current[m.id]?.click();
                      }}
                    >
                      <Upload size={16} />
                      {tr("Upload")}
                    </Button>
                  </>
                }
              >
                {files.length === 0 ? (
                  <div className="px-4 pb-4 text-sm text-[var(--text-muted)]">{tr("No files yet.")}</div>
                ) : (
                  <table className="table">
                      <thead>
                        <tr>
                          <th className="col-grow">{tr("File")}</th>
                          <th className="col-actions">{tr("Actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {files.map((f) => {
                          const active = playing?.id === m.id && playing.file === f;
                          const playingThis = active && isPlaying;
                          return (
                            <tr key={f}>
                              <td className="col-grow font-mono text-sm">{f}</td>
                              <td className="col-actions">
                                <div className="btn-icon-row">
                                  <IconBtn
                                    icon={playingThis ? Pause : Play}
                                    label={playingThis ? "Pause" : "Play"}
                                    primary={playingThis}
                                    onClick={() => togglePlay(m.id, f)}
                                  />
                                  <IconBtn
                                    icon={Trash2}
                                    label={tr("Delete")}
                                    danger
                                    pending={actions.isPending(`file:${m.id}:${f}`)}
                                    onClick={() => void actions.run(`file:${m.id}:${f}`, () => removeFile(m.id, f, active))}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                )}
              </Modal>
            );
          })}
      <Modal open={formOpen} onOpenChange={setFormOpen} title={tr("New MOH class")}>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (create.isPending || !nameKey || nameTaken) return;
            create.mutate();
          }}
        >
          <TextField
            label={tr("Class name")}
            icon={Music}
            className="max-w-xs"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr("Class name")}
            required
          />
          <Button variant="solid" type="submit" disabled={!nameKey || nameTaken} pending={create.isPending}>
            {tr("Create class")}
          </Button>
          {nameKey && nameTaken && (
            <span className="self-center text-sm text-[var(--danger)]" role="alert">
              {tr("A class with this name already exists")}
            </span>
          )}
        </form>
      </Modal>
      <ConfirmDialog
        open={pendingClass != null}
        onOpenChange={(open) => {
          if (!open) setPendingClass(null);
        }}
        title={tr("Delete class")}
        description={tr("Delete hold music class “{{name}}” and its files?", { name: pendingClass?.name ?? "" })}
        confirmLabel={tr("Delete class")}
        cancelLabel={tr("Cancel")}
        pending={removeClass.isPending}
        onConfirm={() => {
          if (pendingClass) removeClass.mutate(pendingClass);
        }}
      />
    </div>
  );
}
