import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BookUser } from "lucide-react";
import { api } from "../../lib/api";
import { PageHeader, SectionCard } from "../../components/ui";

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
    <div className="space-y-4">
      <PageHeader icon={BookUser} title={t("nav.directory")} tone="cyan" />
      <SectionCard title="Extensions" icon={BookUser} tone="cyan">
        <div className="grid gap-2">
          {(list.data ?? []).length === 0 ? (
            <p className="text-[var(--text-muted)]">—</p>
          ) : (
            list.data?.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] p-3"
              >
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
            ))
          )}
        </div>
      </SectionCard>
    </div>
  );
}
