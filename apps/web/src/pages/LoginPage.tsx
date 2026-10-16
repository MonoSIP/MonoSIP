import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useStore } from "../store";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setActor = useStore((s) => s.setActor);
  const [mode, setMode] = useState<"admin" | "portal">("admin");
  const [email, setEmail] = useState("admin@example.com");
  const [extension, setExtension] = useState("101");
  const [password, setPassword] = useState("Admin123!");
  const [totpCode, setTotpCode] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "admin") {
        try {
          await api.post("/api/v1/admin/auth/login", {
            email,
            password,
            totpCode: totpCode || undefined,
          });
        } catch (err) {
          const e = err as Error & { needTotp?: boolean };
          if (e.needTotp || (e.message || "").toLowerCase().includes("totp")) {
            setNeedTotp(true);
            toast.error(t("auth.totpRequired", { defaultValue: "Enter authenticator code" }));
            return;
          }
          throw err;
        }
      } else {
        await api.post("/api/v1/auth/login", { extension, password });
      }
      const me = await api.get<{ actor: Parameters<typeof setActor>[0] }>("/api/v1/auth/me");
      setActor(me.actor);
      navigate("/");
    } catch (err) {
      toast.error((err as Error).message || t("auth.invalid"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-full place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-md p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">{t("app.name")}</h1>
          <p className="text-[var(--text-muted)]">{t("app.tagline")}</p>
        </div>
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            className={`btn flex-1 ${mode === "admin" ? "btn-primary" : ""}`}
            onClick={() => {
              setMode("admin");
              setPassword("Admin123!");
              setNeedTotp(false);
            }}
          >
            {t("auth.adminLogin")}
          </button>
          <button
            type="button"
            className={`btn flex-1 ${mode === "portal" ? "btn-primary" : ""}`}
            onClick={() => {
              setMode("portal");
              setPassword("portal101");
              setNeedTotp(false);
            }}
          >
            {t("auth.portalLogin")}
          </button>
        </div>
        {mode === "admin" ? (
          <label className="mb-3 block">
            <span className="mb-1 block text-sm text-[var(--text-muted)]">{t("auth.email")}</span>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        ) : (
          <label className="mb-3 block">
            <span className="mb-1 block text-sm text-[var(--text-muted)]">{t("auth.extension")}</span>
            <input
              className="input"
              value={extension}
              onChange={(e) => setExtension(e.target.value)}
            />
          </label>
        )}
        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-[var(--text-muted)]">{t("auth.password")}</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {(needTotp || mode === "admin") && (
          <label className="mb-6 block">
            <span className="mb-1 block text-sm text-[var(--text-muted)]">
              {t("auth.totp", { defaultValue: "Authenticator code (if enabled)" })}
            </span>
            <input
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="000000"
            />
          </label>
        )}
        <button className="btn btn-primary w-full justify-center" disabled={loading}>
          {loading ? t("common.loading") : t("auth.signIn")}
        </button>
      </form>
    </div>
  );
}
