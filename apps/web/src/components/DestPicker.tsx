import { useQuery } from "@tanstack/react-query";
import { MapPin, Route } from "lucide-react";
import { api } from "../lib/api";
import { SelectField, TextField } from "./ui";
import { tr } from "../i18n";

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
      return (exts.data ?? []).map((e) => ({
        value: e.number,
        label: `${e.number} — ${e.name}`,
      }));
    }
    if (destType === "queue") {
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
      <SelectField
        label={tr("Type")}
        icon={Route}
        value={destType}
        onValueChange={(next) => onChange(next, next === "hangup" ? null : destId)}
        options={DEST_TYPES.map((d) => ({ value: d.value, label: tr(d.label) }))}
      />
      {needsId && useSelect && (
        <SelectField
          label={tr("Target")}
          icon={MapPin}
          value={destId ?? ""}
          onValueChange={(next) => onChange(destType, next || null)}
          options={[{ value: "", label: tr("— select —") }, ...options]}
        />
      )}
      {needsId && !useSelect && (
        <TextField
          label={destType === "external" ? "Number" : "Target"}
          icon={MapPin}
          className="font-mono"
          value={destId ?? ""}
          onChange={(e) => onChange(destType, e.target.value || null)}
          placeholder={destType === "external" ? "+90555…" : "id"}
        />
      )}
    </div>
  );
}
