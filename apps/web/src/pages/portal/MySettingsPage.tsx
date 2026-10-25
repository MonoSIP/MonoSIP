import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { KeyRound, Languages, Mic, Moon, PhoneForwarded, UserCog, Voicemail, Volume2 } from "lucide-react";
import { api } from "../../lib/api";
import { usePhoneOptional } from "../../lib/phone-context";
import { useStore } from "../../store";
import { setAppLocale } from "../../i18n";
import { PageHeader, SectionCard, Segmented, SelectField, TextAreaField, TextField } from "../../components/ui";

type Fwd = {
  id?: string;
  condition: string;
  ringSeconds: number;
  destType: string;
  destId: string | null;
};

const DEVICE_KEY = "monosip.audioDevices";

export function MySettingsPage() {
  const { t, i18n } = useTranslation();
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const phoneState = usePhoneOptional();
  const qc = useQueryClient();
  const [lang, setLangState] = useState(() => (i18n?.language || "en").slice(0, 2));
  const [password, setPassword] = useState("");
  const [greet, setGreet] = useState("");
  const [greetVoice, setGreetVoice] = useState("female");
  const [greetLang, setGreetLang] = useState<"en" | "tr">("tr");
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

  const forwarding = useQuery({
    queryKey: ["forwarding"],
    queryFn: () => api.get<Fwd[]>("/api/v1/me/forwarding"),
  });
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api.get<{
        dnd: boolean;
        mobileForwardAllowed?: boolean;
        voicemailGreeting?: string;
        voicemailGreetingVoice?: string;
        voicemailGreetingLang?: string;
      }>("/api/v1/me"),
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
    if (!me.data) return;
    setGreet(me.data.voicemailGreeting ?? "");
    setGreetVoice(me.data.voicemailGreetingVoice || "female");
    setGreetLang(me.data.voicemailGreetingLang === "en" ? "en" : "tr");
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
    void phoneState?.phone.loadPreferredDevices();
    toast.success("Audio devices saved");
  }

  const savePass = useMutation({
    mutationFn: () => api.patch("/api/v1/me/password", { password }),
    onSuccess: () => {
      toast.success("OK");
      setPassword("");
      const live = phoneState?.phone;
      if (!live || phoneState?.inCall) return;
      void api
        .get<{
          extension: string;
          password: string;
          domain: string;
          websocketUrl?: string;
          displayName: string;
        }>("/api/v1/me/sip-credentials")
        .then((creds) => live.connect(creds))
        .catch((e: Error) => toast.error(e.message));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveGreet = useMutation({
    mutationFn: () =>
      api.put("/api/v1/me/voicemail-greeting", {
        text: greet,
        voice: greetVoice,
        language: greetVoice === "ema-lightning" ? "tr" : greetLang,
      }),
    onSuccess: () => {
      toast.success(t("portal.greetingSaved"));
      void qc.invalidateQueries({ queryKey: ["me"] });
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

  function setLang(next: "en" | "tr") {
    setAppLocale(next);
    setLangState(next);
  }

  return (
    <div className="space-y-4">
      <PageHeader icon={UserCog} title={t("nav.mySettings")} tone="cyan" />
      <div className="settings-columns">
      <div className="settings-columns-side">
      <div className="space-y-4 md:hidden">
      <SectionCard title={t("common.language")} icon={Languages} tone="cyan">
        <div className="grid grid-cols-2 gap-2">
          <button
            className={`btn ${lang === "tr" ? "btn-primary" : ""}`}
            type="button"
            onClick={() => setLang("tr")}
          >
            Türkçe
          </button>
          <button
            className={`btn ${lang === "en" ? "btn-primary" : ""}`}
            type="button"
            onClick={() => setLang("en")}
          >
            English
          </button>
        </div>
      </SectionCard>
      <SectionCard title={t("portal.darkMode")} icon={Moon} tone="cyan">
        <button
          className={`btn ${theme === "dark" ? "btn-primary" : ""}`}
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {t("portal.darkMode")}: {theme === "dark" ? t("common.enabled") : t("common.disabled")}
        </button>
      </SectionCard>
      </div>
      <SectionCard title={t("auth.password")} icon={KeyRound} tone="cyan">
        <TextField
          label={t("auth.password")}
          icon={KeyRound}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => savePass.mutate()}
          disabled={password.length < 8}
        >
          {t("common.save")}
        </button>
      </SectionCard>
      <SectionCard title="Call forwarding" icon={PhoneForwarded} tone="cyan">
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
            <SelectField
              label="Destination"
              value={fwd.destType}
              onValueChange={(next) =>
                patchFwd(fwd.condition, {
                  destType: next,
                  destId: next === "voicemail" || next === "hangup" ? null : fwd.destId,
                })
              }
              options={[
                { value: "voicemail", label: "Voicemail" },
                { value: "extension", label: "Extension" },
                { value: "hangup", label: "Hangup" },
                ...(me.data?.mobileForwardAllowed ? [{ value: "external", label: "Mobile / external" }] : []),
              ]}
            />
            {(fwd.destType === "extension" || fwd.destType === "external") && (
              <TextField
                label={fwd.destType === "external" ? "Mobile number" : "Extension number"}
                placeholder={fwd.destType === "external" ? "Mobile number" : "Extension number"}
                value={fwd.destId ?? ""}
                onChange={(e) => patchFwd(fwd.condition, { destId: e.target.value })}
              />
            )}
            {fwd.condition === "noanswer" && (
              <TextField
                label="Ring seconds"
                type="number"
                value={String(fwd.ringSeconds)}
                onChange={(e) => patchFwd(fwd.condition, { ringSeconds: Number(e.target.value) })}
              />
            )}
          </div>
        ))}
        <button className="btn btn-primary" type="button" onClick={() => saveFwd.mutate()}>
          Save forwarding
        </button>
      </SectionCard>
      </div>
      <div className="settings-columns-side">
      <SectionCard title={t("portal.voicemailGreeting")} icon={Voicemail} tone="cyan">
        <p className="text-xs text-[var(--text-muted)]">{t("portal.greetingHint")}</p>
        <TextAreaField
          label={t("portal.greetingText")}
          rows={3}
          maxLength={500}
          value={greet}
          onChange={(e) => setGreet(e.target.value)}
        />
        <SelectField
          label={t("portal.greetingVoice")}
          value={greetVoice}
          onValueChange={(next) => {
            setGreetVoice(next);
            if (next === "ema-lightning") setGreetLang("tr");
          }}
          options={[
            { value: "female", label: t("portal.voiceFemale") },
            { value: "male", label: t("portal.voiceMale") },
            { value: "ema-lightning", label: t("portal.voiceEma") },
          ]}
        />
        <div className="space-y-1">
          <span className="field-label">{t("portal.greetingLang")}</span>
          <Segmented
            aria-label={t("portal.greetingLang")}
            value={greetLang}
            onValueChange={setGreetLang}
            options={[
              { value: "tr", label: "Türkçe" },
              { value: "en", label: "English", disabled: greetVoice === "ema-lightning" },
            ]}
          />
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => saveGreet.mutate()}
          disabled={saveGreet.isPending}
        >
          {t("common.save")}
        </button>
      </SectionCard>
      <SectionCard title="Audio devices" icon={Mic} tone="cyan">
        <SelectField
          label="Microphone"
          icon={Mic}
          value={micId}
          onValueChange={setMicId}
          options={[
            { value: "", label: "System default" },
            ...inputs.map((d) => ({ value: d.deviceId, label: d.label || d.deviceId.slice(0, 8) })),
          ]}
        />
        <SelectField
          label="Speaker"
          icon={Volume2}
          value={speakerId}
          onValueChange={setSpeakerId}
          options={[
            { value: "", label: "System default" },
            ...outputs.map((d) => ({ value: d.deviceId, label: d.label || d.deviceId.slice(0, 8) })),
          ]}
        />
        <SelectField
          label="Ringtone output"
          icon={Volume2}
          value={ringId}
          onValueChange={setRingId}
          options={[
            { value: "", label: "Same as speaker" },
            ...outputs.map((d) => ({ value: d.deviceId, label: d.label || d.deviceId.slice(0, 8) })),
          ]}
        />
        <button className="btn btn-primary" type="button" onClick={saveDevices}>
          Save devices
        </button>
      </SectionCard>
      </div>
      </div>
    </div>
  );
}
