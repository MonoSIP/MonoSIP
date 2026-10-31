import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GitBranch, Hash, List, Pencil, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { Button, IconBtn, Modal, PageHeader, SectionCard, TextField } from "../../components/ui";
import { tr } from "../../i18n";

export function FlowsPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [ext, setExt] = useState("");
  const [formOpen, setFormOpen] = useState(false);
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
      setFormOpen(false);
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
        description={tr("Flows with a dialable extension")}
      />
      <SectionCard
        title={tr("All flows")}
        icon={List}
        tone="blue"
        flush
        actions={
          <Button type="button" variant="solid" onClick={() => setFormOpen(true)}>
            {t("common.create")}
          </Button>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th className="col-grow">{tr("Name")}</th>
              <th>{tr("Extension")}</th>
              <th>{tr("Status")}</th>
              <th>{tr("Updated")}</th>
              <th className="col-actions">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.map((f) => (
              <tr key={f.id}>
                <td className="col-grow">{f.name}</td>
                <td className="font-mono">{f.extensionNumber ?? "—"}</td>
                <td>{f.publishedVersionId ? "Published" : "Draft"}</td>
                <td>{new Date(f.updatedAt).toLocaleString()}</td>
                <td className="col-actions">
                  <div className="btn-icon-row">
                    <IconBtn icon={Pencil} label={tr("Edit")} onClick={() => nav(`/flows/${f.id}`)} />
                    <IconBtn
                      icon={Trash2}
                      label={t("common.delete")}
                      danger
                      pending={remove.isPending && remove.variables === f.id}
                      onClick={() => {
                        if (remove.isPending && remove.variables === f.id) return;
                        remove.mutate(f.id);
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
      <Modal open={formOpen} onOpenChange={setFormOpen} title={t("common.create")}>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (create.isPending) return;
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
          <Button variant="solid" type="submit" pending={create.isPending}>
            {t("common.create")}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
