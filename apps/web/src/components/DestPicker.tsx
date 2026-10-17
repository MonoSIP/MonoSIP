import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const DEST_TYPES = [
  { value: "extension", label: "Extension" },
  { value: "queue", label: "Queue" },
  { value: "ring_group", label: "Ring group" },
  { value: "flow", label: "IVR flow" },
  { value: "schedule", label: "Schedule" },
  { value: "voicemail", label: "Voicemail" },
  { value: "external", label: "External number" },
  { value: "hangup", label: "Hangup" },
] as const;

type Props = {
  destType: string;
  destId: string | null;
  onChange: (destType: string, destId: string | null) => void;
  className?: string;
};

export function DestPicker({ destType, destId, onChange, className }: Props) {
  const exts = useQuery({
    queryKey: ["extensions"],
    queryFn: () =>
      api.get<Array<{ id: string; number: string; name: string }>>("/api/v1/admin/extensions"),
    enabled: destType === "extension" || destType === "voicemail",
  });
  const queues = useQuery({
    queryKey: ["queues"],
    queryFn: () => api.get<Array<{ id: string; number: string; name: string }>>("/api/v1/admin/queues"),
    enabled: destType === "queue",
  });
  const rings = useQuery({
    queryKey: ["ring-groups"],
    queryFn: () =>
      api.get<Array<{ id: string; number: string; name: string }>>("/api/v1/admin/ring-groups"),
    enabled: destType === "ring_group",
  });
  const flows = useQuery({
    queryKey: ["flows"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/api/v1/admin/flows"),
    enabled: destType === "flow",
  });
  const schedules = useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/api/v1/admin/schedules"),
    enabled: destType === "schedule",
  });

  const options: Array<{ value: string; label: string }> = (() => {
    if (destType === "extension" || destType === "voicemail") {
      // Dialplan / ARI dial PJSIP/<number> — always store extension number
      return (exts.data ?? []).map((e) => ({
        value: e.number,
        label: `${e.number} — ${e.name}`,
      }));
    }
    if (destType === "queue") {
      // Queue dialplan uses queue number as extension
      return (queues.data ?? []).map((q) => ({ value: q.number, label: `${q.number} — ${q.name}` }));
    }
    if (destType === "ring_group") {
      return (rings.data ?? []).map((r) => ({ value: r.number, label: `${r.number} — ${r.name}` }));
    }
    if (destType === "flow") {
      return (flows.data ?? []).map((f) => ({ value: f.id, label: f.name }));
    }
    if (destType === "schedule") {
      return (schedules.data ?? []).map((s) => ({ value: s.id, label: s.name }));
    }
    return [];
  })();

  const needsId = destType !== "hangup";
  const useSelect = options.length > 0 && destType !== "external";

  return (
    <div className={`grid w-full gap-2 sm:grid-cols-2 ${className ?? ""}`}>
      <label className="block text-xs text-[var(--text-muted)]">
        <span className="font-medium text-[var(--text)]">Type</span>
        <select
          className="input mt-1 w-full"
          value={destType}
          onChange={(e) => onChange(e.target.value, e.target.value === "hangup" ? null : destId)}
        >
          {DEST_TYPES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      {needsId && useSelect && (
        <label className="block text-xs text-[var(--text-muted)]">
          <span className="font-medium text-[var(--text)]">Target</span>
          <select
            className="input mt-1 w-full"
            value={destId ?? ""}
            onChange={(e) => onChange(destType, e.target.value || null)}
          >
            <option value="">— select —</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {needsId && !useSelect && (
        <label className="block text-xs text-[var(--text-muted)]">
          <span className="font-medium text-[var(--text)]">
            {destType === "external" ? "Number" : "Target"}
          </span>
          <input
            className="input mt-1 w-full font-mono"
            value={destId ?? ""}
            onChange={(e) => onChange(destType, e.target.value || null)}
            placeholder={destType === "external" ? "+90555…" : "id"}
          />
        </label>
      )}
    </div>
  );
}
