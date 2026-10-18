import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GitBranch, Hash, List, Tag } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { PageHeader, SectionCard, TextField } from "../../components/ui";

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

  return (
    <div className="space-y-6">
      <PageHeader
        icon={GitBranch}
        title={t("flows.title")}
        tone="cyan"
        description="Visual IVR flows — assign a dialable extension for softphone testing"
      />
      <SectionCard title={t("common.create")} icon={GitBranch} tone="cyan">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <TextField
            label="Name"
            icon={Tag}
            className="max-w-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            required
          />
          <TextField
            label="Extension"
            icon={Hash}
            className="w-36"
            value={ext}
            onChange={(e) => setExt(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="Ext (900)"
            title="Optional dialable extension for softphone testing"
          />
          <button className="btn btn-primary mb-[0.85rem]" type="submit">
            {t("common.create")}
          </button>
        </form>
      </SectionCard>
      <SectionCard title="All flows" icon={List} tone="blue">
        <div className="grid gap-3">
          {list.data?.map((f) => (
            <Link key={f.id} to={`/flows/${f.id}`} className="block rounded-lg border border-[var(--border)] p-4 transition hover:border-[var(--accent)]">
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
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
