import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";

type Fwd = {
  id?: string;
  condition: string;
  ringSeconds: number;
  destType: string;
  destId: string | null;
};

const DEVICE_KEY = "dsip.audioDevices";

export function MySettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [dnd, setDnd] = useState(false);
  const [fwds, setFwds] = useState<Fwd[]>([
    { condition: "noanswer", ringSeconds: 20, destType: "voicemail", destId: null },
    { condition: "busy", ringSeconds: 5, destType: "voicemail", destId: null },
    { condition: "chanunavail", ringSeconds: 5, destType: "voicemail", destId: null },
  ]);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState("");
  const [speakerId, setSpeakerId] = useState("");
  const [ringId, setRingId] = useState("");
  const [playingVm, setPlayingVm] = useState<string | null>(null);

  const vm = useQuery({
    queryKey: ["voicemails"],
    queryFn: () =>
      api.get<Array<{ id: string; caller: string; at: string; read: boolean; filePath?: string }>>(
        "/api/v1/me/voicemails",
      ),
  });
  const forwarding = useQuery({
    queryKey: ["forwarding"],
    queryFn: () => api.get<Fwd[]>("/api/v1/me/forwarding"),
  });
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api.get<{ dnd: boolean; mobileForwardAllowed?: boolean }>("/api/v1/me"),
  });

  useEffect(() => {
    if (!forwarding.data?.length) return;
    const byCond = new Map(forwarding.data.map((f) => [f.condition, f]));
    setFwds((prev) =>
      prev.map((p) => {
        const hit = byCond.get(p.condition);
        return hit
          ? {
              condition: hit.condition,
              ringSeconds: hit.ringSeconds,
              destType: hit.destType,
              destId: hit.destId,
            }
          : p;
      }),
    );
  }, [forwarding.data]);

  useEffect(() => {
    if (me.data) setDnd(!!me.data.dnd);
  }, [me.data]);

  useEffect(() => {
    void (async () => {
      let saved: { mic?: string; speaker?: string; ring?: string } = {};
      try {
        saved = JSON.parse(localStorage.getItem(DEVICE_KEY) ?? "{}") as typeof saved;
      } catch {
        /* ignore */
      }
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const all = await navigator.mediaDevices.enumerateDevices();
        const inDevs = all.filter((d) => d.kind === "audioinput");
        const outDevs = all.filter((d) => d.kind === "audiooutput");
        setInputs(inDevs);
        setOutputs(outDevs);
        const mic = saved.mic && inDevs.some((d) => d.deviceId === saved.mic) ? saved.mic : "";
        const speaker =
          saved.speaker && outDevs.some((d) => d.deviceId === saved.speaker) ? saved.speaker : "";
        const ring = saved.ring && outDevs.some((d) => d.deviceId === saved.ring) ? saved.ring : "";
        setMicId(mic);
        setSpeakerId(speaker);
        setRingId(ring);
        if (mic !== saved.mic || speaker !== saved.speaker || ring !== saved.ring) {
          localStorage.setItem(DEVICE_KEY, JSON.stringify({ mic, speaker, ring }));
        }
      } catch {
        toast.error("Microphone permission needed for device list");
      }
    })();
  }, []);

  function saveDevices() {
    // Only persist IDs that still exist (avoids NotFoundError on softphone)
    const micOk = !micId || inputs.some((d) => d.deviceId === micId);
    const spkOk = !speakerId || outputs.some((d) => d.deviceId === speakerId);
    const ringOk = !ringId || outputs.some((d) => d.deviceId === ringId);
    const next = {
      mic: micOk ? micId : "",
      speaker: spkOk ? speakerId : "",
      ring: ringOk ? ringId : "",
    };
    if (!micOk) setMicId("");
    if (!spkOk) setSpeakerId("");
    if (!ringOk) setRingId("");
    localStorage.setItem(DEVICE_KEY, JSON.stringify(next));
    toast.success("Audio devices saved");
  }

  const savePass = useMutation({
    mutationFn: () => api.patch("/api/v1/me/password", { password }),
    onSuccess: () => {
      toast.success("OK");
      setPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveFwd = useMutation({
    mutationFn: () =>
      api.put(
        "/api/v1/me/forwarding",
        fwds.map((f) => ({
          condition: f.condition,
          ringSeconds: f.ringSeconds,
          destType: f.destType,
          destId: f.destId || null,
        })),
      ),
    onSuccess: () => {
      toast.success("Forwarding saved");
      void qc.invalidateQueries({ queryKey: ["forwarding"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function patchFwd(condition: string, patch: Partial<Fwd>) {
    setFwds((prev) => prev.map((f) => (f.condition === condition ? { ...f, ...patch } : f)));
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">{t("nav.mySettings")}</h1>
      <div className="card space-y-3 p-4">
        <button
          className={`btn ${dnd ? "btn-primary" : ""}`}
          type="button"
          onClick={async () => {
            const next = !dnd;
            try {
              await api.put("/api/v1/me/dnd", { dnd: next });
              setDnd(next);
            } catch (e) {
              // Keep showing the server's truth and surface the failure rather
              // than leaving an unhandled rejection in the console.
              toast.error((e as Error).message);
            }
          }}
        >
          {t("portal.dnd")}: {dnd ? "ON" : "OFF"}
        </button>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--text-muted)]">{t("auth.password")}</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => savePass.mutate()}
          disabled={password.length < 8}
        >
          {t("common.save")}
        </button>
      </div>

      <div className="card space-y-3 p-4">
        <h2 className="font-medium">Audio devices</h2>
        <label className="block text-sm text-[var(--text-muted)]">
          Microphone
          <select className="input mt-1 w-full" value={micId} onChange={(e) => setMicId(e.target.value)}>
            <option value="">System default</option>
            {inputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || d.deviceId.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-[var(--text-muted)]">
          Speaker
          <select className="input mt-1 w-full" value={speakerId} onChange={(e) => setSpeakerId(e.target.value)}>
            <option value="">System default</option>
            {outputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || d.deviceId.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-[var(--text-muted)]">
          Ringtone output
          <select className="input mt-1 w-full" value={ringId} onChange={(e) => setRingId(e.target.value)}>
            <option value="">Same as speaker</option>
            {outputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || d.deviceId.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" type="button" onClick={saveDevices}>
          Save devices
        </button>
      </div>

      <div className="card space-y-4 p-4">
        <h2 className="font-medium">Call forwarding</h2>
        {fwds.map((fwd) => (
          <div key={fwd.condition} className="space-y-2 rounded border border-[var(--border)] p-3">
            <div className="text-sm font-medium capitalize">
              {fwd.condition === "noanswer"
                ? "No answer"
                : fwd.condition === "chanunavail"
                  ? "Unavailable"
                  : fwd.condition === "busy"
                    ? "Busy"
                    : fwd.condition}
            </div>
            <select
              className="input"
              value={fwd.destType}
              onChange={(e) =>
                patchFwd(fwd.condition, {
                  destType: e.target.value,
                  destId: e.target.value === "voicemail" || e.target.value === "hangup" ? null : fwd.destId,
                })
              }
            >
              <option value="voicemail">Voicemail</option>
              <option value="extension">Extension</option>
              <option value="hangup">Hangup</option>
              {me.data?.mobileForwardAllowed && <option value="external">Mobile / external</option>}
            </select>
            {(fwd.destType === "extension" || fwd.destType === "external") && (
              <input
                className="input"
                placeholder={fwd.destType === "external" ? "Mobile number" : "Extension number"}
                value={fwd.destId ?? ""}
                onChange={(e) => patchFwd(fwd.condition, { destId: e.target.value })}
              />
            )}
            {fwd.condition === "noanswer" && (
              <label className="block text-xs text-[var(--text-muted)]">
                Ring seconds
                <input
                  className="input mt-1"
                  type="number"
                  value={fwd.ringSeconds}
                  onChange={(e) => patchFwd(fwd.condition, { ringSeconds: Number(e.target.value) })}
                />
              </label>
            )}
          </div>
        ))}
        <button className="btn btn-primary" type="button" onClick={() => saveFwd.mutate()}>
          Save forwarding
        </button>
      </div>

      <div className="card p-4">
        <h2 className="mb-3 font-medium">Voicemail</h2>
        <ul className="space-y-2">
          {(vm.data ?? []).length === 0 ? (
            <li className="text-[var(--text-muted)]">—</li>
          ) : (
            vm.data?.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {v.caller} · {new Date(v.at).toLocaleString()}
                  {!v.read ? " · new" : ""}
                </span>
                <span className="flex flex-col items-end gap-1">
                  {playingVm === v.id ? (
                    <audio
                      className="max-w-[12rem]"
                      controls
                      autoPlay
                      src={`/api/v1/me/voicemails/${v.id}/stream`}
                      onEnded={() => setPlayingVm(null)}
                    />
                  ) : (
                    <button
                      className="btn"
                      type="button"
                      onClick={async () => {
                      try {
                        await api.patch(`/api/v1/me/voicemails/${v.id}`, { read: true });
                        setPlayingVm(v.id);
                        void qc.invalidateQueries({ queryKey: ["voicemails"] });
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    Play
                  </button>
                  )}
                  <button
                    className="btn"
                    type="button"
                    onClick={async () => {
                      try {
                        await api.patch(`/api/v1/me/voicemails/${v.id}`, { read: true });
                        void qc.invalidateQueries({ queryKey: ["voicemails"] });
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    Read
                  </button>
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
