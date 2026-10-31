import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Ban, Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { Button, IconBtn, Modal, PageHeader, SectionCard, SelectField, TextField, usePendingAction } from "../../components/ui";

type BlacklistRow = {
  id: string;
  pattern: string;
  direction: string;
  note: string | null;
};

export function BlacklistPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const actions = usePendingAction();
  const [pattern, setPattern] = useState("");
  const [direction, setDirection] = useState<"inbound" | "outbound" | "both">("both");
  const [note, setNote] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const list = useQuery({
    queryKey: ["blacklist"],
    queryFn: () => api.get<BlacklistRow[]>("/api/v1/admin/blacklist"),
  });

  const add = useMutation({
    mutationFn: () =>
      api.post("/api/v1/admin/blacklist", {
        pattern: pattern.trim(),
        direction,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      setPattern("");
      setNote("");
      setDirection("both");
      setFormOpen(false);
      toast.success(t("common.save"));
      void qc.invalidateQueries({ queryKey: ["blacklist"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Ban}
        title={t("blacklist.title")}
        tone="coral"
        description={t("blacklist.blurb")}
      />

      <SectionCard
        title={t("blacklist.list")}
        icon={Ban}
        tone="blue"
        flush
        actions={
          <Button type="button" variant="solid" onClick={() => setFormOpen(true)}>
            {t("blacklist.add")}
          </Button>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th>{t("blacklist.pattern")}</th>
              <th>{t("blacklist.direction")}</th>
              <th className="col-grow">{t("blacklist.note")}</th>
              <th className="col-actions">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="text-[var(--text-muted)]">
                  {t("blacklist.empty")}
                </td>
              </tr>
            ) : (
              list.data?.map((b) => (
                <tr key={b.id}>
                  <td className="font-mono">{b.pattern}</td>
                  <td>{b.direction}</td>
                  <td className="col-grow">{b.note ?? "—"}</td>
                  <td className="col-actions">
                    <IconBtn
                      icon={Trash2}
                      label={t("common.delete")}
                      danger
                      pending={actions.isPending(b.id)}
                      onClick={() =>
                        void actions.run(b.id, async () => {
                          try {
                            await api.delete(`/api/v1/admin/blacklist/${b.id}`);
                            toast.success(t("common.delete"));
                            void qc.invalidateQueries({ queryKey: ["blacklist"] });
                          } catch (e) {
                            toast.error(String(e));
                          }
                        })
                      }
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </SectionCard>

      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={t("blacklist.add")}
      >
        <p className="mb-3 text-sm text-[var(--text-muted)]">{t("blacklist.patternHint")}</p>
        <form
          className="toolbar toolbar-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (add.isPending) return;
            if (!pattern.trim()) return;
            add.mutate();
          }}
        >
          <TextField
            label={t("blacklist.pattern")}
            className="font-mono flex-1"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="*123*  ·  90532*  ·  05321112233"
            required
          />
          <SelectField
            label={t("blacklist.direction")}
            value={direction}
            onValueChange={(next) => setDirection(next as typeof direction)}
            options={[
              { value: "both", label: t("blacklist.dirBoth") },
              { value: "inbound", label: t("blacklist.dirInbound") },
              { value: "outbound", label: t("blacklist.dirOutbound") },
            ]}
          />
          <TextField
            label={t("blacklist.note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("blacklist.notePlaceholder")}
          />
          <Button variant="solid" type="submit" pending={add.isPending}>
            <Plus size={16} />
            {t("common.add")}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
