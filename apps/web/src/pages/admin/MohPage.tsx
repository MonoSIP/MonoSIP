import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";

type MohClass = { id: string; name: string; files: unknown };

export function MohPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("default");
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
    mutationFn: () => api.post("/api/v1/admin/moh", { name, files: [] }),
    onSuccess: () => {
      toast.success("MOH class created");
      setName("");
      void qc.invalidateQueries({ queryKey: ["moh"] });
    },
  });

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
      if (blob.size < 64) throw new Error("Audio file is empty");
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      audio.src = url;
      await audio.play();
      setPlaying({ id, file });
      setIsPlaying(true);
    } catch (e) {
      setIsPlaying(false);
      setPlaying(null);
      toast.error(`Playback failed: ${(e as Error).message}`);
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
          .catch((e) => toast.error(`Playback failed: ${(e as Error).message}`));
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
    void api
      .delete(`/api/v1/admin/moh/${id}/files/${encodeURIComponent(file)}`)
      .then(() => {
        toast.success("Removed");
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
      <h1 className="text-2xl font-semibold">Music on Hold</h1>
      <p className="text-sm text-[var(--text-muted)]">
        Upload WAV/MP3/OGG; non-WAV or wrong sample rate is converted to 8&nbsp;kHz mono WAV for
        Asterisk. Use Play to preview.
      </p>
      <form
        className="card flex flex-wrap gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input
          className="input max-w-xs"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Class name"
          required
        />
        <button className="btn btn-primary" type="submit">
          Create class
        </button>
      </form>

      <div className="space-y-4">
        {(list.data ?? []).length === 0 ? (
          <div className="card p-6 text-[var(--text-muted)]">No MOH classes yet.</div>
        ) : (
          list.data?.map((m) => {
            const files = Array.isArray(m.files) ? (m.files as string[]) : [];
            return (
              <div key={m.id} className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      Class
                    </div>
                    <div className="font-mono text-lg font-semibold">{m.name}</div>
                  </div>
                  <div>
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
                        if (f) void upload(m.id, f).catch((err) => toast.error((err as Error).message));
                      }}
                    />
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => fileInputRefs.current[m.id]?.click()}
                    >
                      <Upload size={16} />
                      Upload
                    </button>
                  </div>
                </div>

                {files.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-[var(--text-muted)]">No files yet.</div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>File</th>
                        <th className="w-[1%] whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((f) => {
                        const active = playing?.id === m.id && playing.file === f;
                        const playingThis = active && isPlaying;
                        return (
                          <tr key={f}>
                            <td className="font-mono text-sm">{f}</td>
                            <td>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  className={`btn ${playingThis ? "btn-primary" : ""}`}
                                  type="button"
                                  onClick={() => togglePlay(m.id, f)}
                                >
                                  {playingThis ? <Pause size={16} /> : <Play size={16} />}
                                  {playingThis ? "Pause" : "Play"}
                                </button>
                                <button
                                  className="btn btn-danger"
                                  type="button"
                                  onClick={() => removeFile(m.id, f, active)}
                                >
                                  <Trash2 size={16} />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
