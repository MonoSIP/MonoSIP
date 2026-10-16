import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";

export function DirectoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const list = useQuery({
    queryKey: ["directory"],
    queryFn: () =>
      api.get<Array<{ id: string; number: string; name: string; state: string; dnd: boolean }>>(
        "/api/v1/me/directory",
      ),
    refetchInterval: 5000,
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("nav.directory")}</h1>
      <div className="grid gap-2">
        {list.data?.map((p) => (
          <div key={p.id} className="card flex items-center justify-between gap-3 p-4">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="font-mono text-sm text-[var(--text-muted)]">{p.number}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`badge ${p.dnd || p.state === "dnd" ? "badge-warn" : "badge-ok"}`}>
                {p.dnd ? "DND" : p.state}
              </span>
              <button
                className="btn btn-primary"
                type="button"
                disabled={p.dnd}
                onClick={() => navigate(`/?dial=${encodeURIComponent(p.number)}`)}
              >
                {t("portal.dial")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
