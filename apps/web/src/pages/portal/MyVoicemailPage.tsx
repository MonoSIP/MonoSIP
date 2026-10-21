import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2, Voicemail } from "lucide-react";
import { api } from "../../lib/api";
import { PageHeader, SectionCard } from "../../components/ui";

type VoicemailRow = {
  id: string;
  caller: string | null;
  at: string;
  read: boolean;
};

export function MyVoicemailPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["voicemails"],
    queryFn: () => api.get<VoicemailRow[]>("/api/v1/me/voicemails"),
  });

  const open = (list.data ?? []).find((v) => v.id === openId) ?? null;

  async function openMessage(id: string) {
    setConfirmId(null);
    try {
      await api.patch(`/api/v1/me/voicemails/${id}`, { read: true });
      setOpenId(id);
      void qc.invalidateQueries({ queryKey: ["voicemails"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await api.delete(`/api/v1/me/voicemails/${id}`);
      if (openId === id) setOpenId(null);
      setConfirmId(null);
      toast.success(t("portal.deleted"));
      void qc.invalidateQueries({ queryKey: ["voicemails"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader icon={Voicemail} title={t("nav.voicemail")} tone="cyan" />
      {open && (
        <SectionCard title={t("portal.callerId")} icon={Voicemail} tone="cyan">
          <p className="font-mono text-2xl">{open.caller || "—"}</p>
          <p className="text-sm text-[var(--text-muted)]">{new Date(open.at).toLocaleString()}</p>
          <audio className="mt-3 w-full" controls autoPlay src={`/api/v1/me/voicemails/${open.id}/stream`} />
          <div className="mt-3">
            {confirmId === open.id ? (
              <button className="btn btn-danger" type="button" onClick={() => void remove(open.id)}>
                <Trash2 size={16} />
                {t("portal.confirmDelete")}
              </button>
            ) : (
              <button className="btn" type="button" onClick={() => setConfirmId(open.id)}>
                <Trash2 size={16} />
                {t("portal.delete")}
              </button>
            )}
          </div>
        </SectionCard>
      )}
      <SectionCard title={t("nav.voicemail")} icon={Voicemail} tone="cyan">
        {(list.data ?? []).length === 0 ? (
          <p className="text-[var(--text-muted)]">{t("portal.voicemailEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {list.data?.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm ${
                    openId === v.id
                      ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]"
                      : "border-[var(--border)]"
                  }`}
                  aria-pressed={openId === v.id}
                  onClick={() => void openMessage(v.id)}
                >
                  <span className="font-mono">{v.caller || "—"}</span>
                  <span className="text-[var(--text-muted)]">
                    {new Date(v.at).toLocaleString()}
                    {!v.read ? ` · ${t("portal.unread")}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
