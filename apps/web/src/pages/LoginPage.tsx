import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { KeyRound, Mail, Phone, Shield, Smartphone } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../store";
import { AppBrand } from "../components/AppBrand";
import { TextField } from "../components/ui";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setActor = useStore((s) => s.setActor);
  const [mode, setMode] = useState<"admin" | "portal">("admin");
  const [email, setEmail] = useState("admin@example.com");
  const [extension, setExtension] = useState("101");
  const [password, setPassword] = useState("");
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
    <div className="login-shell">
      <form onSubmit={submit} className="card relative z-10 w-full max-w-md p-8">
        <AppBrand className="mb-6" subtitle={t("app.tagline")} asHeading />
        <div className="segmented mb-5">
          <button
            type="button"
            className={`btn ${mode === "admin" ? "btn-primary" : ""}`}
            onClick={() => {
              setMode("admin");
              setPassword("");
              setNeedTotp(false);
            }}
          >
            <Shield size={16} />
            {t("auth.adminLogin")}
          </button>
          <button
            type="button"
            className={`btn ${mode === "portal" ? "btn-primary" : ""}`}
            onClick={() => {
              setMode("portal");
              setPassword("");
              setNeedTotp(false);
            }}
          >
            <Phone size={16} />
            {t("auth.portalLogin")}
          </button>
        </div>
        {mode === "admin" ? (
          <TextField
            label={t("auth.email")}
            icon={Mail}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        ) : (
          <TextField
            label={t("auth.extension")}
            icon={Smartphone}
            inputMode="numeric"
            autoComplete="username"
            value={extension}
            onChange={(e) => setExtension(e.target.value)}
          />
        )}
        <TextField
          label={t("auth.password")}
          icon={KeyRound}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {(needTotp || mode === "admin") && (
          <TextField
            label={t("auth.totp", { defaultValue: "Authenticator code (if enabled)" })}
            icon={Shield}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            placeholder="000000"
          />
        )}
        <button className="btn btn-primary mt-2 w-full justify-center" disabled={loading}>
          {loading ? t("common.loading") : t("auth.signIn")}
        </button>
      </form>
    </div>
  );
}
