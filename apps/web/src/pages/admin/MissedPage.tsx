import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { List, PhoneMissed } from "lucide-react";
import { api } from "../../lib/api";
import { Button, PageHeader, SectionCard } from "../../components/ui";
import { tr } from "../../i18n";

export function MissedPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "returned" | "all">("pending");
  const list = useQuery({
    queryKey: ["missed"],
    queryFn: () =>
      api.get<Array<{ id: string; number: string; target: string; at: string; status: string }>>(
        "/api/v1/admin/missed-calls",
      ),
  });

  const mark = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "returned" | "ignored" | "pending" }) =>
      api.patch(`/api/v1/admin/missed-calls/${id}`, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["missed"] }),
  });

  const rows = (list.data ?? []).filter((m) => {
    if (tab === "all") return true;
    if (tab === "pending") return m.status === "pending";
    return m.status === "returned";
  });

  const tabButtons = (
    <>
      {(
        [
          ["pending", t("missed.pending")],
          ["returned", t("missed.returned")],
          ["all", t("missed.all")],
        ] as const
      ).map(([k, label]) => (
        <Button
          key={k}
          type="button"
          variant={tab === k ? "solid" : "soft"}
          onClick={() => setTab(k)}
        >
          {label}
        </Button>
      ))}
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={PhoneMissed}
        title={t("nav.missed")}
        tone="coral"
        description={tr("Missed calls and follow-up")}
        actions={tabButtons}
      />
      <SectionCard title={tr("Missed calls")} icon={List} tone="coral" flush>
        <table className="table">
            <thead>
              <tr>
                <th>{t("cdr.caller")}</th>
                <th>{tr("Target")}</th>
                <th>{tr("Time")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5}>—</td>
                </tr>
              ) : (
                rows.map((m) => (
                  <tr key={m.id}>
                    <td className="font-mono">{m.number}</td>
                    <td>{m.target}</td>
                    <td>{new Date(m.at).toLocaleString()}</td>
                    <td>
                      <span className="badge">{m.status}</span>
                    </td>
                    <td className="flex gap-1">
                      {m.status !== "returned" && (
                        <Button
                          type="button"
                          onClick={() => mark.mutate({ id: m.id, status: "returned" })}
                        >
                          {t("missed.markReturned")}
                        </Button>
                      )}
                      {m.status === "pending" && (
                        <Button
                          type="button"
                          onClick={() => mark.mutate({ id: m.id, status: "ignored" })}
                        >
                          {t("missed.ignore")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
      </SectionCard>
    </div>
  );
}
