import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";

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
      toast.success("Created");
    },
  });

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/admin/ring-groups/${editId}`, { name, strategy, memberIds }),
    onSuccess: () => {
      reset();
      void qc.invalidateQueries({ queryKey: ["ring-groups"] });
      toast.success("Saved");
    },
  });

  function reset() {
    setEditId(null);
    setName("");
    setNumber("");
    setStrategy("ringall");
    setMemberIds([]);
  }

  function startEdit(g: Group) {
    setEditId(g.id);
    setName(g.name);
    setNumber(g.number);
    setStrategy(g.strategy);
    setMemberIds(g.memberIds ?? []);
  }

  function toggle(id: string) {
    setMemberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("nav.ringGroups")}</h1>
      <form
        className="card mb-6 space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (editId) save.mutate();
          else create.mutate();
        }}
      >
        <div className="flex flex-wrap gap-3">
          <input
            className="input max-w-[140px]"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder={t("extensions.number")}
            disabled={!!editId}
            required
          />
          <input
            className="input max-w-xs"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("extensions.name")}
            required
          />
          <select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            <option value="ringall">ringall</option>
            <option value="linear">linear</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {exts.data?.map((e) => (
            <label key={e.id} className="flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-sm">
              <input type="checkbox" checked={memberIds.includes(e.id)} onChange={() => toggle(e.id)} />
              {e.number}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" type="submit">
            {editId ? t("common.save") : t("common.create")}
          </button>
          {editId && (
            <button className="btn" type="button" onClick={reset}>
              Cancel
            </button>
          )}
        </div>
      </form>
      <div className="card overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{t("extensions.number")}</th>
              <th>{t("extensions.name")}</th>
              <th>Strategy</th>
              <th>Members</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((g) => (
              <tr key={g.id}>
                <td className="font-mono">{g.number}</td>
                <td>{g.name}</td>
                <td>{g.strategy}</td>
                <td>{g.memberIds?.length ?? 0}</td>
                <td className="flex gap-1">
                  <button className="btn" type="button" onClick={() => startEdit(g)}>
                    Edit
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() =>
                      void api.delete(`/api/v1/admin/ring-groups/${g.id}`).then(() =>
                        qc.invalidateQueries({ queryKey: ["ring-groups"] }),
                      )
                    }
                  >
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
