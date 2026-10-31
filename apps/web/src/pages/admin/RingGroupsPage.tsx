import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Hash, List, Pencil, Tag, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { Button, Checkbox, IconBtn, Modal, PageHeader, SectionCard, SelectField, TextField, usePendingAction } from "../../components/ui";
import { tr } from "../../i18n";

type Ext = { id: string; number: string; name: string };
type Group = {
  id: string;
  name: string;
  number: string;
  strategy: string;
  ringSeconds?: number;
  memberIds: string[];
};

export function RingGroupsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const actions = usePendingAction();
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [strategy, setStrategy] = useState("ringall");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const list = useQuery({
    queryKey: ["ring-groups"],
    queryFn: () => api.get<Group[]>("/api/v1/admin/ring-groups"),
  });
  const exts = useQuery({
    queryKey: ["extensions"],
    queryFn: () => api.get<Ext[]>("/api/v1/admin/extensions"),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/api/v1/admin/ring-groups", { name, number, strategy, memberIds }),
    onSuccess: () => {
      reset();
      void qc.invalidateQueries({ queryKey: ["ring-groups"] });
      toast.success(tr("Created"));
    },
  });

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/admin/ring-groups/${editId}`, { name, strategy, memberIds }),
    onSuccess: () => {
      reset();
      void qc.invalidateQueries({ queryKey: ["ring-groups"] });
      toast.success(tr("Saved"));
    },
  });

  function reset() {
    setEditId(null);
    setName("");
    setNumber("");
    setStrategy("ringall");
    setMemberIds([]);
    setFormOpen(false);
  }

  function openCreate() {
    reset();
    setFormOpen(true);
  }

  function startEdit(g: Group) {
    setEditId(g.id);
    setName(g.name);
    setNumber(g.number);
    setStrategy(g.strategy);
    setMemberIds(g.memberIds ?? []);
    setFormOpen(true);
  }

  function toggle(id: string) {
    setMemberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UsersRound}
        title={t("nav.ringGroups")}
        tone="cyan"
        description={tr("Ring together or in order")}
      />
      <SectionCard
        title={tr("Ring groups")}
        icon={List}
        tone="blue"
        flush
        actions={
          <Button type="button" variant="solid" onClick={openCreate}>
            {t("common.create")}
          </Button>
        }
      >
        <table className="table">
            <thead>
              <tr>
                <th>{t("extensions.number")}</th>
                <th className="col-grow">{t("extensions.name")}</th>
                <th>{tr("Strategy")}</th>
                <th>{tr("Members")}</th>
                <th className="col-actions">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.map((g) => (
                <tr key={g.id}>
                  <td className="font-mono">{g.number}</td>
                  <td className="col-grow">{g.name}</td>
                  <td>{g.strategy}</td>
                  <td>{g.memberIds?.length ?? 0}</td>
                  <td className="col-actions">
                    <div className="btn-icon-row">
                      <IconBtn icon={Pencil} label={tr("Edit")} onClick={() => startEdit(g)} />
                      <IconBtn
                        icon={Trash2}
                        label={t("common.delete")}
                        danger
                        pending={actions.isPending(`delete:${g.id}`)}
                        onClick={() =>
                          void actions.run(`delete:${g.id}`, async () => {
                            try {
                              await api.delete(`/api/v1/admin/ring-groups/${g.id}`);
                              void qc.invalidateQueries({ queryKey: ["ring-groups"] });
                            } catch (e) {
                              toast.error(String(e));
                            }
                          })
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      </SectionCard>
      <Modal
        open={formOpen}
        onOpenChange={(next) => {
          if (!next) reset();
        }}
        title={editId ? t("common.edit", { defaultValue: "Edit" }) : t("common.create")}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (editId ? save.isPending : create.isPending) return;
            if (editId) save.mutate();
            else create.mutate();
          }}
        >
          <div className="toolbar">
            <TextField
              label={t("extensions.number")}
              icon={Hash}
              className="max-w-[140px]"
              placeholder={t("extensions.number")}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              disabled={!!editId}
              required
            />
            <TextField
              label={t("extensions.name")}
              icon={Tag}
              className="max-w-xs"
              placeholder={t("extensions.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <SelectField
              label={tr("Strategy")}
              value={strategy}
              onValueChange={setStrategy}
              options={[
                { value: "ringall", label: "ringall" },
                { value: "linear", label: "linear" },
              ]}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {exts.data?.map((e) => (
              <Checkbox
                key={e.id}
                className="rounded border border-[var(--border)] px-2"
                checked={memberIds.includes(e.id)}
                onCheckedChange={() => toggle(e.id)}
                label={e.number}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="solid" type="submit" pending={editId ? save.isPending : create.isPending}>
              {editId ? t("common.save") : t("common.create")}
            </Button>
            {editId && (
              <Button type="button" onClick={reset}>
                {tr("Cancel")}
              </Button>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
