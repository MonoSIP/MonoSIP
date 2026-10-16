import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";

type Settings = {
  companyName?: string;
  recordingRetentionMonths?: number;
  kvkkAnnouncementEnabled?: boolean;
  kvkkPromptId?: string | null;
  allowedCountries?: string[];
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
  const [countries, setCountries] = useState("TR");
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
  const [totpCode, setTotpCode] = useState("");
  const [qr, setQr] = useState<string | null>(null);

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
      api.get<Array<{ id: string; name: string }>>("/api/v1/admin/prompts"),
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

  useEffect(() => {
    if (settings.data) {
      setCompanyName(settings.data.companyName ?? "DSip");
      setRetention(settings.data.recordingRetentionMonths ?? 12);
      setKvkk(settings.data.kvkkAnnouncementEnabled ?? true);
      setKvkkPromptId(settings.data.kvkkPromptId ?? "");
      setCountries((settings.data.allowedCountries ?? ["TR"]).join(","));
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
        allowedCountries: countries.split(",").map((s) => s.trim()).filter(Boolean),
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
      }),
    onSuccess: () => {
      toast.success("Saved");
      void qc.invalidateQueries({ queryKey: ["settings"] });
      void qc.invalidateQueries({ queryKey: ["security-status"] });
    },
  });

  const reload = useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/api/v1/admin/system/reload"),
    onSuccess: (r) => toast.success(r.ok ? "Reloaded" : "Config written (Asterisk offline)"),
  });

  async function setupTotp() {
    const r = await api.post<{ qr: string; secret: string }>("/api/v1/admin/auth/totp/setup");
    setQr(r.qr);
    toast.message("Scan QR, then enter code to enable");
  }

  async function enableTotp() {
    await api.post("/api/v1/admin/auth/totp/enable", { code: totpCode });
    toast.success("2FA enabled");
    setQr(null);
    void qc.invalidateQueries({ queryKey: ["totp-status"] });
  }

  async function disableTotp() {
    if (!totpCode.trim()) {
      toast.error("Enter current TOTP code to disable");
      return;
    }
    await api.post("/api/v1/admin/auth/totp/disable", { code: totpCode });
    toast.success("2FA disabled");
    setTotpCode("");
    setQr(null);
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
    toast.success("Restore applied");
    void qc.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
      <div className="card space-y-4 p-5">
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--text-muted)]">{t("settings.company")}</span>
          <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--text-muted)]">{t("settings.retention")}</span>
          <input className="input" type="number" value={retention} onChange={(e) => setRetention(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} />
          KVKK announcement
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--text-muted)]">KVKK prompt</span>
          <select
            className="input"
            value={kvkkPromptId}
            onChange={(e) => setKvkkPromptId(e.target.value)}
          >
            <option value="">Beep (default)</option>
            {(prompts.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--text-muted)]">
            Allowed countries (ISO, comma — e.g. TR,DE or ALL)
          </span>
          <input className="input" value={countries} onChange={(e) => setCountries(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--text-muted)]">Daily limit (min)</span>
            <input className="input" type="number" value={daily} onChange={(e) => setDaily(Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--text-muted)]">Monthly limit (min)</span>
            <input className="input" type="number" value={monthly} onChange={(e) => setMonthly(Number(e.target.value))} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={blockAnon} onChange={(e) => setBlockAnon(e.target.checked)} />
          Block anonymous inbound
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--text-muted)]">Max outbound calls / hour / extension</span>
          <input className="input" type="number" value={maxPerHour} onChange={(e) => setMaxPerHour(Number(e.target.value))} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--text-muted)]">Recording archive path (local/NAS mount)</span>
          <input className="input" value={archivePath} onChange={(e) => setArchivePath(e.target.value)} placeholder="/data/archive" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--text-muted)]">Recording archive SFTP</span>
          <input
            className="input font-mono text-sm"
            value={archiveSftp}
            onChange={(e) => setArchiveSftp(e.target.value)}
            placeholder="sftp://user:pass@host:22/recordings"
          />
        </label>
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
                .then((r) => toast.success(`Archived ${r.archived} recording(s)`))
                .catch((e) => toast.error((e as Error).message));
            }}
          >
            Run archive now
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
                  r.ok ? toast.success("SFTP OK") : toast.error(r.error ?? "SFTP failed"),
                )
                .catch((e) => toast.error((e as Error).message));
            }}
          >
            Test SFTP
          </button>
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <h2 className="font-semibold">Security / IP</h2>
        <p className="text-xs text-[var(--text-muted)]">
          Your IP: <code className="font-mono">{secStatus.data?.clientIp ?? "…"}</code>
          {" · "}
          {secStatus.data?.fail2banHint}
        </p>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--text-muted)]">
            Admin IP allowlist (comma/CIDR, empty=all — applies to all admin API)
          </span>
          <textarea
            className="input font-mono text-sm"
            rows={2}
            value={ipAllow}
            onChange={(e) => setIpAllow(e.target.value)}
            placeholder="10.0.0.0/8,192.168.1.10"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--text-muted)]">
            Portal IP allowlist (empty=open for remote softphones)
          </span>
          <textarea
            className="input font-mono text-sm"
            rows={2}
            value={portalIpAllow}
            onChange={(e) => setPortalIpAllow(e.target.value)}
            placeholder=""
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--text-muted)]">
            SIP IP allowlist (empty=open; when set, only these + LOCAL_NETS + trunks may REGISTER)
          </span>
          <textarea
            className="input font-mono text-sm"
            rows={2}
            value={sipIpAllow}
            onChange={(e) => setSipIpAllow(e.target.value)}
            placeholder="203.0.113.0/24"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--text-muted)]">SIP IP denylist</span>
          <textarea
            className="input font-mono text-sm"
            rows={2}
            value={sipIpDeny}
            onChange={(e) => setSipIpDeny(e.target.value)}
            placeholder=""
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--text-muted)]">Login max retries</span>
            <input
              className="input"
              type="number"
              min={3}
              max={50}
              value={loginMaxRetry}
              onChange={(e) => setLoginMaxRetry(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--text-muted)]">Login ban (minutes)</span>
            <input
              className="input"
              type="number"
              min={1}
              max={1440}
              value={loginBanMin}
              onChange={(e) => setLoginBanMin(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" type="button" onClick={() => save.mutate()}>
            Save security settings
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              window.open("/api/v1/admin/security/firewall-export?format=nftables", "_blank");
            }}
          >
            Download nftables
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              window.open("/api/v1/admin/security/firewall-export?format=ufw", "_blank");
            }}
          >
            Download ufw script
          </button>
        </div>

        <h3 className="pt-2 text-sm font-medium">Active bans</h3>
        <div className="flex flex-wrap gap-2">
          <input
            className="input max-w-[12rem] font-mono text-sm"
            placeholder="IP to ban"
            value={banIp}
            onChange={(e) => setBanIp(e.target.value)}
          />
          <input
            className="input max-w-[14rem] text-sm"
            placeholder="Reason"
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
                  toast.success("Banned");
                  void qc.invalidateQueries({ queryKey: ["security-bans"] });
                })
                .catch((e) => toast.error(String(e)));
            }}
          >
            Ban IP
          </button>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[var(--text-muted)]">
              <th className="py-1">IP</th>
              <th>Source</th>
              <th>Expires</th>
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
                          toast.success("Unbanned");
                          void qc.invalidateQueries({ queryKey: ["security-bans"] });
                        });
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {(bans.data?.memoryBans ?? []).map((m) => (
              <tr key={`mem-${m.ip}`} className="border-t border-[var(--border)] opacity-80">
                <td className="py-1 font-mono text-xs">{m.ip}</td>
                <td>{m.source} (memory)</td>
                <td className="text-xs">{new Date(m.expiresAt).toLocaleString()}</td>
                <td />
              </tr>
            ))}
            {!bans.data?.bans?.length && !bans.data?.memoryBans?.length && (
              <tr>
                <td colSpan={4} className="py-2 text-[var(--text-muted)]">
                  No active bans
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="font-semibold">SMTP / daily reports</h2>
        {!smtpHost || !smtpTo ? (
          <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            SMTP incomplete — daily/monthly reports stay log-only until host and smtpTo are set.
          </p>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">Reports will be emailed when the nightly job runs.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input" placeholder="smtpHost" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
          <input className="input" type="number" placeholder="smtpPort" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} />
          <input className="input" placeholder="smtpUser" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
          <input className="input" type="password" placeholder="smtpPassword" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} />
          <input className="input" placeholder="smtpTo" value={smtpTo} onChange={(e) => setSmtpTo(e.target.value)} />
          <input className="input" placeholder="emailFrom" value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="button" onClick={() => save.mutate()}>
          {t("common.save")}
        </button>
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="font-semibold">Two-factor authentication</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Status: {totpStatus.data?.enabled ? "Enabled" : "Disabled"}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" type="button" onClick={() => void setupTotp()}>
            Setup / rotate
          </button>
          {(qr || totpStatus.data?.enabled) && (
            <input
              className="input max-w-[8rem]"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="Code"
            />
          )}
          {qr && (
            <>
              <img src={qr} alt="TOTP QR" className="h-40 w-40 rounded border border-[var(--border)]" />
              <button className="btn btn-primary" type="button" onClick={() => void enableTotp()}>
                Enable
              </button>
            </>
          )}
          {totpStatus.data?.enabled && (
            <button className="btn btn-danger" type="button" onClick={() => void disableTotp().catch((e) => toast.error(String(e)))}>
              Disable 2FA
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="btn" type="button" onClick={() => reload.mutate()}>
          {t("settings.reload")}
        </button>
        <button className="btn" type="button" onClick={() => void downloadBackup()}>
          {t("settings.backup")}
        </button>
        <label className="btn cursor-pointer">
          Restore backup
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

      <div className="card overflow-auto p-5">
        <h2 className="mb-3 font-semibold">Audit log</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[var(--text-muted)]">
              <th className="py-1">When</th>
              <th>Action</th>
              <th>Object</th>
            </tr>
          </thead>
          <tbody>
            {audit.data?.slice(0, 40).map((a) => (
              <tr key={a.id} className="border-t border-[var(--border)]">
                <td className="py-1">{new Date(a.at).toLocaleString()}</td>
                <td>{a.action}</td>
                <td className="font-mono text-xs">{a.objectId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
