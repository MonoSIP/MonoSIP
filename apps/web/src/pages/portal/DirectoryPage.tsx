import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BookUser, User } from "lucide-react";
import { api } from "../../lib/api";
import { Button, PageHeader, SectionCard } from "../../components/ui";

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
      {list.isFetched && (list.data ?? []).length === 0 ? (
        <div className="vm-empty" role="status">
          <span className="vm-empty-mark" aria-hidden="true">
            <BookUser size={22} strokeWidth={2.25} />
          </span>
          <span className="vm-empty-book" aria-hidden="true">
            <span><User size={14} /></span>
            <span><User size={14} /></span>
            <span><User size={14} /></span>
          </span>
          <p>{t("portal.directoryEmpty")}</p>
        </div>
      ) : (list.data ?? []).length === 0 ? null : (
        <SectionCard title="Extensions" icon={BookUser} tone="cyan">
          <div className="grid gap-2">
            {list.data?.map((p) => (
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
                  <Button
                    variant="solid"
                    type="button"
                    disabled={p.dnd}
                    onClick={() => navigate(`/?dial=${encodeURIComponent(p.number)}`)}
                  >
                    {t("portal.dial")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
