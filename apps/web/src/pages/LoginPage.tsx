import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { KeyRound, Languages, Mail, Moon, Phone, Shield, Smartphone, Sun } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../store";
import { toggleAppLocale } from "../i18n";
import { AmbientBackground } from "../components/AmbientBackground";
import { AppBrand, ProductSiteLink } from "../components/AppBrand";
import { Button, Segmented, Surface, TextField } from "../components/ui";

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setActor = useStore((s) => s.setActor);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const [mode, setMode] = useState<"admin" | "portal">("admin");
  const [email, setEmail] = useState("admin@example.com");
  const [extension, setExtension] = useState("101");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
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
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <AmbientBackground />
      <div className="login-tools">
        <Button
          type="button"
          aria-label={t("common.language")}
          onClick={() => toggleAppLocale()}
        >
          <Languages size={16} aria-hidden />
          {(i18n.language || "en").slice(0, 2).toUpperCase()}
        </Button>
        <Button type="button" aria-label={t("portal.darkMode")} onClick={toggleTheme}>
          <span className="icon-swap" aria-hidden>
            <Moon size={16} className={theme === "dark" ? "is-on" : undefined} />
            <Sun size={16} className={theme === "light" ? "is-on" : undefined} />
          </span>
        </Button>
      </div>
      <Surface className="login-card relative z-10 w-full max-w-md">
      <form onSubmit={submit}>
        <AppBrand lockup asHeading className="mb-6" />
        <Segmented
          className="mb-5"
          aria-label={t("auth.adminLogin")}
          value={mode}
          onValueChange={(next) => {
            setMode(next);
            setPassword("");
            setNeedTotp(false);
          }}
          options={[
            {
              value: "admin",
              label: (
                <>
                  <Shield size={16} />
                  {t("auth.adminLogin")}
                </>
              ),
            },
            {
              value: "portal",
              label: (
                <>
                  <Phone size={16} />
                  {t("auth.portalLogin")}
                </>
              ),
            },
          ]}
        />
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
        <Button variant="solid" className="mt-2 w-full justify-center" pending={loading}>
          {loading ? t("common.loading") : t("auth.signIn")}
        </Button>
      </form>
      </Surface>
      <ProductSiteLink />
    </div>
  );
}
