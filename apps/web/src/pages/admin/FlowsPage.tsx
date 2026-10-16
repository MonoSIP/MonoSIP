import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";

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
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("flows.title")}</h1>
      <form
        className="card mb-6 flex flex-wrap gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input
          className="input max-w-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          required
        />
        <input
          className="input w-28 font-mono"
          value={ext}
          onChange={(e) => setExt(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="Ext (900)"
          title="Optional dialable extension for softphone testing"
        />
        <button className="btn btn-primary" type="submit">
          {t("common.create")}
        </button>
      </form>
      <div className="grid gap-3">
        {list.data?.map((f) => (
          <Link key={f.id} to={`/flows/${f.id}`} className="card block p-4 hover:border-[var(--accent)]">
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
    </div>
  );
}
