import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AudioLines,
  Building2,
  Globe,
  Mail,
  RefreshCw,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { api } from "../../lib/api";
import { PageHeader, SectionCard, SelectField, TextAreaField, TextField } from "../../components/ui";
import { SPEECH_VOICES } from "./flow/nodeMeta";
import { tr } from "../../i18n";

/** SSL status codes shown as words (translated with tr at render). */
const SSL_STATUS_LABEL: Record<string, string> = {
  none: "No certificate",
  pending: "Issuing…",
  ok: "Active",
  error: "Error",
};

type Settings = {
  companyName?: string;
  recordingRetentionMonths?: number;
  kvkkAnnouncementEnabled?: boolean;
  kvkkPromptId?: string | null;
  ttsVoice?: string;
  ttsVoiceApplyAll?: boolean;
  ttsCacheRetentionDays?: number;
  allowedCountries?: string[];
  blockedCountries?: string[];
  dailySpendLimitMinutes?: number;
  monthlySpendLimitMinutes?: number;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  smtpTo?: string | null;
  emailFrom?: string | null;
  recordingArchivePath?: string | null;
  recordingArchiveSftp?: string | null;
  adminIpAllowlist?: string[];
  portalIpAllowlist?: string[];
  sipIpAllowlist?: string[];
  sipIpDenylist?: string[];
  securityLoginMaxRetry?: number;
  securityLoginBanMinutes?: number;
  blockAnonymousInbound?: boolean;
  maxOutboundPerHour?: number;
  hostname?: string | null;
  autoSsl?: boolean;
  sslEmail?: string | null;
  sslStatus?: "none" | "pending" | "ok" | "error" | null;
  sslExpiresAt?: string | null;
  sslLastCheckAt?: string | null;
  sslLastError?: string | null;
};

type SslStatus = {
  hostname: string | null;
  autoSsl: boolean;
  status: "none" | "pending" | "ok" | "error";
  expiresAt: string | null;
  lastCheckAt: string | null;
  lastError: string | null;
  daysRemaining: number | null;
};

type BanRow = {
  id: string;
  ip: string;
  source: string;
  reason?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
};

export function SettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [companyName, setCompanyName] = useState("DSip");
  const [retention, setRetention] = useState(12);
  const [kvkk, setKvkk] = useState(true);
  const [kvkkPromptId, setKvkkPromptId] = useState("");
  const [ttsVoice, setTtsVoice] = useState("female");
  const [ttsVoiceApplyAll, setTtsVoiceApplyAll] = useState(true);
  const [ttsCacheRetentionDays, setTtsCacheRetentionDays] = useState(7);
  const [countries, setCountries] = useState("TR");
  const [blockedCountries, setBlockedCountries] = useState("");
  const [daily, setDaily] = useState(1000);
  const [monthly, setMonthly] = useState(20000);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpTo, setSmtpTo] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [archivePath, setArchivePath] = useState("");
  const [archiveSftp, setArchiveSftp] = useState("");
  const [ipAllow, setIpAllow] = useState("");
  const [portalIpAllow, setPortalIpAllow] = useState("");
  const [sipIpAllow, setSipIpAllow] = useState("");
  const [sipIpDeny, setSipIpDeny] = useState("");
  const [loginMaxRetry, setLoginMaxRetry] = useState(8);
  const [loginBanMin, setLoginBanMin] = useState(15);
  const [banIp, setBanIp] = useState("");
  const [banReason, setBanReason] = useState("");
  const [blockAnon, setBlockAnon] = useState(true);
  const [maxPerHour, setMaxPerHour] = useState(60);
  const [hostname, setHostname] = useState("");
  const [autoSsl, setAutoSsl] = useState(false);
  const [sslEmail, setSslEmail] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<Settings>("/api/v1/admin/settings"),
  });
  const audit = useQuery({
    queryKey: ["audit"],
    queryFn: () =>
      api.get<Array<{ id: string; action: string; at: string; objectId?: string }>>(
        "/api/v1/admin/audit-log",
      ),
  });
  const totpStatus = useQuery({
    queryKey: ["totp-status"],
    queryFn: () => api.get<{ enabled: boolean }>("/api/v1/admin/auth/totp/status"),
  });
  const prompts = useQuery({
    queryKey: ["prompts"],
    queryFn: () =>
      api.get<Array<{ id: string; name: string; source?: string }>>("/api/v1/admin/prompts"),
  });
  const bans = useQuery({
    queryKey: ["security-bans"],
    queryFn: () =>
      api.get<{ bans: BanRow[]; memoryBans: Array<{ ip: string; expiresAt: string; source: string }> }>(
        "/api/v1/admin/security/bans",
      ),
  });
  const secStatus = useQuery({
    queryKey: ["security-status"],
    queryFn: () =>
      api.get<{ clientIp?: string; fail2banHint?: string }>("/api/v1/admin/security/status"),
  });
  const sslStatus = useQuery({
    queryKey: ["ssl-status"],
    queryFn: () => api.get<SslStatus>("/api/v1/admin/ssl/status"),
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 3000 : 30_000),
  });

  useEffect(() => {
    if (settings.data) {
      setCompanyName(settings.data.companyName ?? "DSip");
      setRetention(settings.data.recordingRetentionMonths ?? 12);
      setKvkk(settings.data.kvkkAnnouncementEnabled ?? true);
      setKvkkPromptId(settings.data.kvkkPromptId ?? "");
      setTtsVoice(settings.data.ttsVoice ?? "female");
      setTtsVoiceApplyAll(settings.data.ttsVoiceApplyAll !== false);
      setTtsCacheRetentionDays(settings.data.ttsCacheRetentionDays ?? 7);
      setCountries((settings.data.allowedCountries ?? ["TR"]).join(","));
      setBlockedCountries((settings.data.blockedCountries ?? []).join(","));
      setDaily(settings.data.dailySpendLimitMinutes ?? 1000);
      setMonthly(settings.data.monthlySpendLimitMinutes ?? 20000);
      setSmtpHost(settings.data.smtpHost ?? "");
      setSmtpPort(settings.data.smtpPort ?? 587);
      setSmtpUser(settings.data.smtpUser ?? "");
      setSmtpPassword(settings.data.smtpPassword ?? "");
      setSmtpTo(settings.data.smtpTo ?? "");
      setEmailFrom(settings.data.emailFrom ?? "");
      setArchivePath(settings.data.recordingArchivePath ?? "");
      setArchiveSftp(settings.data.recordingArchiveSftp ?? "");
      setIpAllow((settings.data.adminIpAllowlist ?? []).join(","));
      setPortalIpAllow((settings.data.portalIpAllowlist ?? []).join(","));
      setSipIpAllow((settings.data.sipIpAllowlist ?? []).join(","));
      setSipIpDeny((settings.data.sipIpDenylist ?? []).join(","));
      setLoginMaxRetry(settings.data.securityLoginMaxRetry ?? 8);
      setLoginBanMin(settings.data.securityLoginBanMinutes ?? 15);
      setBlockAnon(settings.data.blockAnonymousInbound ?? true);
      setMaxPerHour(settings.data.maxOutboundPerHour ?? 60);
      setHostname(settings.data.hostname ?? "");
      setAutoSsl(settings.data.autoSsl ?? false);
      setSslEmail(settings.data.sslEmail ?? "");
    }
  }, [settings.data]);

  const splitList = (s: string) =>
    s
      .split(/[,\n]+/)
      .map((x) => x.trim())
      .filter(Boolean);

  const save = useMutation({
    mutationFn: () =>
      api.patch("/api/v1/admin/settings", {
        companyName,
        recordingRetentionMonths: retention,
        kvkkAnnouncementEnabled: kvkk,
        kvkkPromptId: kvkkPromptId || null,
        ttsVoice,
        ttsVoiceApplyAll,
        ttsCacheRetentionDays,
        allowedCountries: countries.split(",").map((s) => s.trim()).filter(Boolean),
        blockedCountries: blockedCountries
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        dailySpendLimitMinutes: daily,
        monthlySpendLimitMinutes: monthly,
        smtpHost: smtpHost || null,
        smtpPort: smtpPort || null,
        smtpUser: smtpUser || null,
        smtpPassword: smtpPassword || null,
        smtpTo: smtpTo || null,
        emailFrom: emailFrom || null,
        recordingArchivePath: archivePath || null,
        recordingArchiveSftp: archiveSftp || null,
        adminIpAllowlist: splitList(ipAllow),
        portalIpAllowlist: splitList(portalIpAllow),
        sipIpAllowlist: splitList(sipIpAllow),
        sipIpDenylist: splitList(sipIpDeny),
        securityLoginMaxRetry: loginMaxRetry,
        securityLoginBanMinutes: loginBanMin,
        blockAnonymousInbound: blockAnon,
        maxOutboundPerHour: maxPerHour,
        hostname: hostname.trim() || null,
        autoSsl,
        sslEmail: sslEmail.trim() || null,
      }),
    onSuccess: () => {
      toast.success(tr("Saved"));
      void qc.invalidateQueries({ queryKey: ["settings"] });
      void qc.invalidateQueries({ queryKey: ["security-status"] });
      void qc.invalidateQueries({ queryKey: ["ssl-status"] });
    },
  });

  const reload = useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/api/v1/admin/system/reload"),
    onSuccess: (r) => toast.success(r.ok ? tr("Reloaded") : tr("Config written (Asterisk offline)")),
  });

  async function setupTotp() {
    const r = await api.post<{ qr: string; secret: string; otpauth: string }>(
      "/api/v1/admin/auth/totp/setup",
    );
    setQr(r.qr);
    setTotpSecret(r.secret);
    setOtpauth(r.otpauth);
    setTotpCode("");
    toast.message(t("settings.totpScanHint"));
  }

  async function enableTotp() {
    await api.post("/api/v1/admin/auth/totp/enable", { code: totpCode });
    toast.success(t("settings.totpEnabled"));
    setQr(null);
    setTotpSecret(null);
    setOtpauth(null);
    setTotpCode("");
    void qc.invalidateQueries({ queryKey: ["totp-status"] });
  }

  async function disableTotp() {
    if (!totpCode.trim()) {
      toast.error(t("settings.totpCodeRequired"));
      return;
    }
    await api.post("/api/v1/admin/auth/totp/disable", { code: totpCode });
    toast.success(t("settings.totpDisabled"));
    setTotpCode("");
    setQr(null);
    setTotpSecret(null);
    setOtpauth(null);
    void qc.invalidateQueries({ queryKey: ["totp-status"] });
  }

  async function downloadBackup() {
    const res = await fetch("/api/v1/admin/backups", { credentials: "include" });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dsip-backup-${Date.now()}.json`;
    a.click();
  }

  async function restoreBackup(file: File) {
    const text = await file.text();
    const data = JSON.parse(text) as Record<string, unknown>;
    await api.post("/api/v1/admin/backups/restore", data);
    toast.success(tr("Restore applied"));
    void qc.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader icon={Settings} title={t("settings.title")} tone="coral" description={tr("Company, security, mail, and system options")} />
      <SectionCard title={t("settings.hostnameSection")} icon={Globe} tone="cyan" className="space-y-4">
        <TextField
          label={t("settings.hostname")}
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          placeholder="pbx.example.com"
          autoComplete="off"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoSsl} onChange={(e) => setAutoSsl(e.target.checked)} />
          {t("settings.autoSsl")}
        </label>
        <p className="text-xs text-[var(--text-muted)]">{t("settings.autoSslHint")}</p>
        <TextField
          label={t("settings.sslEmail")}
          type="email"
          value={sslEmail}
          onChange={(e) => setSslEmail(e.target.value)}
          placeholder="admin@example.com"
          disabled={!autoSsl}
        />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`badge ${
              sslStatus.data?.status === "ok"
                ? "badge-ok"
                : sslStatus.data?.status === "error"
                  ? "badge-err"
                  : sslStatus.data?.status === "pending"
                    ? "badge-warn"
                    : ""
            }`}
          >
            {tr(SSL_STATUS_LABEL[sslStatus.data?.status ?? settings.data?.sslStatus ?? "none"] ?? "No certificate")}
          </span>
          {sslStatus.data?.expiresAt ? (
            <span className="text-[var(--text-muted)]">
              {t("settings.sslExpires")}: {new Date(sslStatus.data.expiresAt).toLocaleString()}
              {sslStatus.data.daysRemaining != null
                ? ` (${sslStatus.data.daysRemaining}d)`
                : ""}
            </span>
          ) : null}
          {sslStatus.data?.lastError ? (
            <span className="text-[var(--danger)] text-xs break-all">{sslStatus.data.lastError}</span>
          ) : null}
        </div>
        <button
          className="btn"
          type="button"
          disabled={!autoSsl || !hostname.trim()}
          onClick={() => {
            void api
              .post<{ ok: boolean; error?: string; expiresAt?: string }>("/api/v1/admin/ssl/renew", {})
              .then((r) => {
                if (r.ok) toast.success(t("settings.sslRenewOk"));
                else toast.error(r.error ?? tr("SSL failed"));
                void qc.invalidateQueries({ queryKey: ["ssl-status"] });
                void qc.invalidateQueries({ queryKey: ["settings"] });
              })
              .catch((e) => toast.error((e as Error).message));
          }}
        >
          {t("settings.sslRenewNow")}
        </button>
      </SectionCard>
      <SectionCard title={t("settings.company")} icon={Building2} tone="blue" className="space-y-4">
        <TextField label={t("settings.company")} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        <TextField
          label={t("settings.retention")}
          type="number"
          value={retention}
          onChange={(e) => setRetention(Number(e.target.value))}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} />
          {tr("KVKK announcement")}
        </label>
        <SelectField label={tr("KVKK prompt")} value={kvkkPromptId} onChange={(e) => setKvkkPromptId(e.target.value)}>
          <option value="">{tr("Beep (default)")}</option>
          {(prompts.data ?? [])
            .filter((p) => p.source !== "cache")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </SelectField>
        <SelectField
          label={tr("IVR TTS model")}
          icon={AudioLines}
          value={ttsVoice}
          onChange={(e) => setTtsVoice(e.target.value)}
        >
          {SPEECH_VOICES.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
              {v.value === "ema-lightning"
                ? ` — ${tr("Turkish offline")}`
                : v.value === "kokoro"
                  ? ` — ${tr("English offline")}`
                  : ""}
            </option>
          ))}
        </SelectField>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ttsVoiceApplyAll}
            onChange={(e) => setTtsVoiceApplyAll(e.target.checked)}
          />
          {tr("Apply TTS model to all IVR prompts (ignore per-node voice)")}
        </label>
        <p className="text-xs text-[var(--text-muted)]">
          {tr("When enabled, live IVR speech uses this model without editing flow nodes. EMA is Turkish-only; Kokoro is English-only.")}
        </p>
        <TextField
          label={tr("TTS cache retention (days)")}
          type="number"
          min={1}
          max={90}
          value={String(ttsCacheRetentionDays)}
          onChange={(e) =>
            setTtsCacheRetentionDays(Math.min(90, Math.max(1, Number(e.target.value) || 7)))
          }
        />
        <p className="text-xs text-[var(--text-muted)]">
          {tr("Dynamic IVR speech (announce/menu) is cached as WAV and listed under Prompts. Entries auto-delete after this many days.")}
        </p>
        <TextField
          label={tr("Allowed countries (ISO, comma — e.g. TR,DE or ALL)")}
          value={countries}
          onChange={(e) => setCountries(e.target.value)}
        />
        <TextField
          label={tr("Blocked countries (ISO, comma — e.g. IR,SY)")}
          value={blockedCountries}
          onChange={(e) => setBlockedCountries(e.target.value)}
        />
        <p className="text-xs text-[var(--text-muted)]">
          {tr("Prefer the chip picker on SIP providers for country allow/block.")}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={tr("Daily limit (min)")}
            type="number"
            value={daily}
            onChange={(e) => setDaily(Number(e.target.value))}
          />
          <TextField
            label={tr("Monthly limit (min)")}
            type="number"
            value={monthly}
            onChange={(e) => setMonthly(Number(e.target.value))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={blockAnon} onChange={(e) => setBlockAnon(e.target.checked)} />
          {tr("Block anonymous inbound")}
        </label>
        <TextField
          label={tr("Max outbound calls / hour / extension")}
          type="number"
          value={maxPerHour}
          onChange={(e) => setMaxPerHour(Number(e.target.value))}
        />
        <TextField
          label={tr("Recording archive path (local/NAS mount)")}
          value={archivePath}
          onChange={(e) => setArchivePath(e.target.value)}
          placeholder="/data/archive"
        />
        <TextField
          label={tr("Recording archive SFTP")}
          value={archiveSftp}
          onChange={(e) => setArchiveSftp(e.target.value)}
          placeholder="sftp://user:pass@host:22/recordings"
        />
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" type="button" onClick={() => save.mutate()}>
            {t("common.save")}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              void api
                .post<{ ok: boolean; archived: number }>("/api/v1/admin/archive/run", {})
                .then((r) => toast.success(tr("Archived {{v0}} recording(s)", { v0: r.archived })))
                .catch((e) => toast.error((e as Error).message));
            }}
          >
            {tr("Run archive now")}
          </button>
          <button
            className="btn"
            type="button"
            disabled={!archiveSftp}
            onClick={() => {
              void api
                .post<{ ok: boolean; error?: string }>("/api/v1/admin/archive/test-sftp", {
                  uri: archiveSftp || undefined,
                })
                .then((r) =>
                  r.ok ? toast.success(tr("SFTP OK")) : toast.error(r.error ?? tr("SFTP failed")),
                )
                .catch((e) => toast.error((e as Error).message));
            }}
          >
            {tr("Test SFTP")}
          </button>
        </div>
      </SectionCard>

      <SectionCard title={tr("Security / IP")} icon={Shield} tone="cyan" className="space-y-4">
        <p className="text-xs text-[var(--text-muted)]">
          {tr("Your IP:")} <code className="font-mono">{secStatus.data?.clientIp ?? "…"}</code>
          {" · "}
          {secStatus.data?.fail2banHint}
        </p>
        <TextAreaField
          label={tr("Admin IP allowlist (comma/CIDR, empty=all — applies to all admin API)")}
          className="font-mono text-sm"
          rows={2}
          value={ipAllow}
          onChange={(e) => setIpAllow(e.target.value)}
          placeholder="10.0.0.0/8,192.168.1.10"
        />
        <TextAreaField
          label={tr("Portal IP allowlist (empty=open for remote softphones)")}
          className="font-mono text-sm"
          rows={2}
          value={portalIpAllow}
          onChange={(e) => setPortalIpAllow(e.target.value)}
        />
        <TextAreaField
          label={tr("SIP IP allowlist (empty=open; when set, only these + LOCAL_NETS + trunks may REGISTER)")}
          className="font-mono text-sm"
          rows={2}
          value={sipIpAllow}
          onChange={(e) => setSipIpAllow(e.target.value)}
          placeholder="203.0.113.0/24"
        />
        <TextAreaField
          label={tr("SIP IP denylist")}
          className="font-mono text-sm"
          rows={2}
          value={sipIpDeny}
          onChange={(e) => setSipIpDeny(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={tr("Login max retries")}
            type="number"
            min={3}
            max={50}
            value={loginMaxRetry}
            onChange={(e) => setLoginMaxRetry(Number(e.target.value))}
          />
          <TextField
            label={tr("Login ban (minutes)")}
            type="number"
            min={1}
            max={1440}
            value={loginBanMin}
            onChange={(e) => setLoginBanMin(Number(e.target.value))}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" type="button" onClick={() => save.mutate()}>
            {tr("Save security settings")}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              window.open("/api/v1/admin/security/firewall-export?format=nftables", "_blank");
            }}
          >
            {tr("Download nftables")}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              window.open("/api/v1/admin/security/firewall-export?format=ufw", "_blank");
            }}
          >
            {tr("Download ufw script")}
          </button>
        </div>

        <h3 className="pt-2 text-sm font-medium">{tr("Active bans")}</h3>
        <div className="toolbar">
          <TextField
            label={tr("IP to ban")}
            className="max-w-[12rem] font-mono text-sm"
            value={banIp}
            onChange={(e) => setBanIp(e.target.value)}
          />
          <TextField
            label={tr("Reason")}
            className="max-w-[14rem] text-sm"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
          />
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              void api
                .post("/api/v1/admin/security/bans", {
                  ip: banIp.trim(),
                  reason: banReason || undefined,
                  expiresMinutes: loginBanMin,
                })
                .then(() => {
                  setBanIp("");
                  setBanReason("");
                  toast.success(tr("Banned"));
                  void qc.invalidateQueries({ queryKey: ["security-bans"] });
                })
                .catch((e) => toast.error(String(e)));
            }}
          >
            {tr("Ban IP")}
          </button>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[var(--text-muted)]">
              <th className="py-1">{tr("IP")}</th>
              <th>{tr("Source")}</th>
              <th>{tr("Expires")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(bans.data?.bans ?? []).map((b) => (
              <tr key={b.id} className="border-t border-[var(--border)]">
                <td className="py-1 font-mono text-xs">{b.ip}</td>
                <td>{b.source}</td>
                <td className="text-xs">
                  {b.expiresAt ? new Date(b.expiresAt).toLocaleString() : "permanent"}
                </td>
                <td>
                  <button
                    className="btn text-xs"
                    type="button"
                    onClick={() => {
                      void api
                        .delete(`/api/v1/admin/security/bans/${b.id}`)
                        .then(() => {
                          toast.success(tr("Unbanned"));
                          void qc.invalidateQueries({ queryKey: ["security-bans"] });
                        });
                    }}
                  >
                    {tr("Remove")}
                  </button>
                </td>
              </tr>
            ))}
            {(bans.data?.memoryBans ?? []).map((m) => (
              <tr key={`mem-${m.ip}`} className="border-t border-[var(--border)] opacity-80">
                <td className="py-1 font-mono text-xs">{m.ip}</td>
                <td>{m.source} {tr("(memory)")}</td>
                <td className="text-xs">{new Date(m.expiresAt).toLocaleString()}</td>
                <td />
              </tr>
            ))}
            {!bans.data?.bans?.length && !bans.data?.memoryBans?.length && (
              <tr>
                <td colSpan={4} className="py-2 text-[var(--text-muted)]">
                  {tr("No active bans")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title={tr("SMTP / daily reports")} icon={Mail} tone="blue" className="space-y-3">
        {!smtpHost || !smtpTo ? (
          <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {tr("SMTP incomplete — daily/monthly reports stay log-only until host and smtpTo are set.")}
          </p>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">{tr("Reports will be emailed when the nightly job runs.")}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={tr("smtpHost")} value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
          <TextField
            label={tr("smtpPort")}
            type="number"
            value={smtpPort}
            onChange={(e) => setSmtpPort(Number(e.target.value))}
          />
          <TextField label={tr("smtpUser")} value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
          <TextField
            label={tr("smtpPassword")}
            type="password"
            value={smtpPassword}
            onChange={(e) => setSmtpPassword(e.target.value)}
          />
          <TextField label={tr("smtpTo")} value={smtpTo} onChange={(e) => setSmtpTo(e.target.value)} />
          <TextField label={tr("emailFrom")} value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="button" onClick={() => save.mutate()}>
          {t("common.save")}
        </button>
      </SectionCard>

      <SectionCard
        title={t("settings.totpTitle")}
        icon={ShieldCheck}
        tone="coral"
        className="space-y-4"
        actions={
          <span className={`badge ${totpStatus.data?.enabled ? "badge-ok" : ""}`}>
            {totpStatus.data?.enabled ? t("settings.totpOn") : t("settings.totpOff")}
          </span>
        }
      >
        <p className="text-sm text-[var(--text-muted)]">{t("settings.totpBlurb")}</p>

        {!qr && (
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" type="button" onClick={() => void setupTotp()}>
              {totpStatus.data?.enabled ? t("settings.totpRotate") : t("settings.totpSetup")}
            </button>
          </div>
        )}

        {qr && (
          <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
            <div className="flex justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-3">
              <img src={qr} alt="TOTP QR" className="h-44 w-44" />
            </div>
            <div className="space-y-3">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--text-muted)]">
                <li>{t("settings.totpStepScan")}</li>
                <li>{t("settings.totpStepApple")}</li>
                <li>{t("settings.totpStepCode")}</li>
              </ol>
              {otpauth ? (
                <a
                  className="btn btn-primary inline-flex items-center gap-2 no-underline"
                  href={otpauth}
                  onClick={() => toast.message(t("settings.totpAppleOpened"))}
                >
                  {t("settings.totpAddApple")}
                </a>
              ) : null}
              {totpSecret ? (
                <div>
                  <div className="mb-1 text-xs text-[var(--text-muted)]">{t("settings.totpManual")}</div>
                  <code className="block break-all rounded border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 font-mono text-sm tracking-wider">
                    {totpSecret}
                  </code>
                  <button
                    className="btn mt-2"
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(totpSecret).then(
                        () => toast.success(t("settings.totpCopied")),
                        () => toast.error(tr("Copy failed")),
                      );
                    }}
                  >
                    {t("settings.totpCopy")}
                  </button>
                </div>
              ) : null}
              <div className="flex flex-wrap items-end gap-2 pt-1">
                <TextField
                  label={t("settings.totpCode")}
                  className="max-w-[10rem] font-mono tracking-widest"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, ""))}
                  placeholder="000000"
                />
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={totpCode.trim().length < 6}
                  onClick={() => void enableTotp().catch((e) => toast.error(String(e)))}
                >
                  {t("settings.totpEnable")}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setQr(null);
                    setTotpSecret(null);
                    setOtpauth(null);
                    setTotpCode("");
                  }}
                >
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </button>
              </div>
            </div>
          </div>
        )}

        {totpStatus.data?.enabled && !qr ? (
          <div className="flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-4">
            <TextField
              label={t("settings.totpCode")}
              className="max-w-[10rem] font-mono tracking-widest"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, ""))}
              placeholder="000000"
            />
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => void disableTotp().catch((e) => toast.error(String(e)))}
            >
              {t("settings.totpDisable")}
            </button>
          </div>
        ) : null}
      </SectionCard>

      <div className="flex flex-wrap gap-3">
        <button className="btn" type="button" onClick={() => reload.mutate()}>
          <RefreshCw size={16} />
          {t("settings.reload")}
        </button>
        <button className="btn" type="button" onClick={() => void downloadBackup()}>
          {t("settings.backup")}
        </button>
        <label className="btn cursor-pointer">
          {tr("Restore backup")}
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void restoreBackup(f).catch((err) => toast.error((err as Error).message));
            }}
          />
        </label>
      </div>

      <SectionCard title={tr("Audit log")} icon={ScrollText} tone="cyan" flush>
        <table className="table">
          <thead>
            <tr>
              <th>{tr("When")}</th>
              <th>{tr("Action")}</th>
              <th>{tr("Object")}</th>
            </tr>
          </thead>
          <tbody>
            {(audit.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={3} className="text-[var(--text-muted)]">
                  {tr("No audit events yet.")}
                </td>
              </tr>
            ) : (
              audit.data?.slice(0, 40).map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.at).toLocaleString()}</td>
                  <td>{a.action}</td>
                  <td className="font-mono text-xs">{a.objectId ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
