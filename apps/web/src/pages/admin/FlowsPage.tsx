import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GitBranch, Hash, List, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { IconBtn, PageHeader, SectionCard, TextField } from "../../components/ui";
import { tr } from "../../i18n";

export function FlowsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [ext, setExt] = useState("");
  const list = useQuery({
    queryKey: ["flows"],
    queryFn: () =>
      api.get<
        Array<{
          id: string;
          name: string;
          extensionNumber?: string | null;
          publishedVersionId: string | null;
          updatedAt: string;
        }>
      >("/api/v1/admin/flows"),
  });
  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/api/v1/admin/flows", {
        name,
        extensionNumber: ext.trim() || undefined,
      }),
    onSuccess: () => {
      setName("");
      setExt("");
      void qc.invalidateQueries({ queryKey: ["flows"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/flows/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["flows"] });
      toast.success(tr("Flow deleted"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={GitBranch}
        title={t("flows.title")}
        tone="cyan"
        description={tr("Visual IVR flows — assign a dialable extension for softphone testing")}
      />
      <SectionCard title={t("common.create")} icon={GitBranch} tone="cyan">
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <TextField
            label={tr("Name")}
            icon={Tag}
            className="max-w-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr("Name")}
            required
          />
          <TextField
            label={tr("Extension")}
            icon={Hash}
            className="w-36"
            value={ext}
            onChange={(e) => setExt(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder={tr("Ext (900)")}
            title={tr("Optional dialable extension for softphone testing")}
          />
          <button className="btn btn-primary" type="submit">
            {t("common.create")}
          </button>
        </form>
      </SectionCard>
      <SectionCard title={tr("All flows")} icon={List} tone="blue">
        <div className="grid gap-3">
          {list.data?.map((f) => (
            <div key={f.id} className="flex items-start gap-2 rounded-lg border border-[var(--border)] p-4 transition hover:border-[var(--accent)]">
              <Link to={`/flows/${f.id}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-medium">{f.name}</div>
                  {f.extensionNumber && (
                    <span className="font-mono text-sm text-[var(--accent)]">dial {f.extensionNumber}</span>
                  )}
                </div>
                <div className="text-sm text-[var(--text-muted)]">
                  {f.publishedVersionId ? "Published" : "Draft"} · {new Date(f.updatedAt).toLocaleString()}
                </div>
              </Link>
              <IconBtn
                icon={Trash2}
                label={t("common.delete")}
                danger
                onClick={() => remove.mutate(f.id)}
              />
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
