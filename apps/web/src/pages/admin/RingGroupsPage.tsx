import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BellRing, Hash, List, Pencil, Tag, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { Checkbox, IconBtn, PageHeader, SectionCard, SelectField, TextField } from "../../components/ui";
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
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [strategy, setStrategy] = useState("ringall");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);

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
  }

  const formRef = useRef<HTMLDivElement>(null);

  function startEdit(g: Group) {
    setEditId(g.id);
    setName(g.name);
    setNumber(g.number);
    setStrategy(g.strategy);
    setMemberIds(g.memberIds ?? []);
    formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
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
        description={tr("Ring multiple extensions together with ringall or linear strategy")}
      />
      <SectionCard title={tr("Ring groups")} icon={List} tone="blue" flush>
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
                        onClick={() =>
                          void api.delete(`/api/v1/admin/ring-groups/${g.id}`).then(() =>
                            qc.invalidateQueries({ queryKey: ["ring-groups"] }),
                          )
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      </SectionCard>
      <div ref={formRef}>
      <SectionCard
        title={editId ? t("common.save") : t("common.create")}
        icon={BellRing}
        tone="cyan"
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
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
            <button className="btn btn-primary" type="submit">
              {editId ? t("common.save") : t("common.create")}
            </button>
            {editId && (
              <button className="btn" type="button" onClick={reset}>
                {tr("Cancel")}
              </button>
            )}
          </div>
        </form>
      </SectionCard>
      </div>
    </div>
  );
}
