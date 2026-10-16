import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";

const ALL_PERMS = ["cdr", "originate", "recordings"] as const;

export function IntegrationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [url, setUrl] = useState("https://example.com/webhook");
  const [keyName, setKeyName] = useState("CRM");
  const [perms, setPerms] = useState<string[]>(["cdr", "originate"]);

  const webhooks = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => api.get<Array<{ id: string; url: string; active: boolean }>>("/api/v1/admin/webhooks"),
  });
  const keys = useQuery({
    queryKey: ["api-keys"],
    queryFn: () =>
      api.get<Array<{ id: string; name: string; keyPrefix: string; permissions: string[] }>>(
        "/api/v1/admin/api-keys",
      ),
  });

  const addHook = useMutation({
    mutationFn: () =>
      api.post("/api/v1/admin/webhooks", {
        url,
        events: ["call.ended", "call.missed"],
        active: true,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const addKey = useMutation({
    mutationFn: () =>
      api.post<{ key: string }>("/api/v1/admin/api-keys", { name: keyName, permissions: perms }),
    onSuccess: (r) => {
      toast.success(`API key: ${r.key}`);
      void qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  function togglePerm(p: string) {
    setPerms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  async function saveKeyPerms(id: string, permissions: string[]) {
    await api.patch(`/api/v1/admin/api-keys/${id}`, { permissions });
    toast.success("Permissions updated");
    void qc.invalidateQueries({ queryKey: ["api-keys"] });
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{t("nav.integrations")}</h1>
      <section className="card p-4">
        <h2 className="mb-3 font-medium">Webhooks</h2>
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addHook.mutate();
          }}
        >
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn btn-primary" type="submit">
            {t("common.create")}
          </button>
        </form>
        <ul className="space-y-2">
          {webhooks.data?.map((w) => (
            <li
              key={w.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <span className="truncate">{w.url}</span>
              <button
                className="btn shrink-0"
                type="button"
                onClick={() =>
                  void api
                    .post<{ ok: boolean; status?: number; error?: string }>(
                      `/api/v1/admin/webhooks/${w.id}/test`,
                    )
                    .then((r) =>
                      toast[r.ok ? "success" : "error"](
                        r.ok ? `Test OK (${r.status})` : r.error ?? "Test failed",
                      ),
                    )
                }
              >
                Test
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="card space-y-3 p-4">
        <h2 className="font-medium">API keys</h2>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addKey.mutate();
          }}
        >
          <input className="input max-w-xs" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {ALL_PERMS.map((p) => (
              <label key={p} className="flex items-center gap-1">
                <input type="checkbox" checked={perms.includes(p)} onChange={() => togglePerm(p)} />
                {p}
              </label>
            ))}
          </div>
          <button className="btn btn-primary" type="submit">
            {t("common.create")}
          </button>
        </form>
        <ul className="space-y-3">
          {keys.data?.map((k) => {
            const kp = (k.permissions ?? []) as string[];
            return (
              <li key={k.id} className="rounded border border-[var(--border)] p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono">
                    {k.name} · {k.keyPrefix}…
                  </span>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() =>
                      void api.delete(`/api/v1/admin/api-keys/${k.id}`).then(() =>
                        qc.invalidateQueries({ queryKey: ["api-keys"] }),
                      )
                    }
                  >
                    Revoke
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALL_PERMS.map((p) => (
                    <label key={p} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={kp.includes(p)}
                        onChange={() => {
                          const next = kp.includes(p) ? kp.filter((x) => x !== p) : [...kp, p];
                          void saveKeyPerms(k.id, next);
                        }}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
