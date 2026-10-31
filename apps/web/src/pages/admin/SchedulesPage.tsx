import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarClock, CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { DestPicker } from "../../components/DestPicker";
import { Button, Checkbox, ConfirmDialog, IconBtn, Modal, PageHeader, SectionCard, SelectInput, TextField, usePendingAction } from "../../components/ui";
import { tr } from "../../i18n";

type Range = {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  status: "open" | "lunch";
};

type Schedule = {
  id: string;
  name: string;
  timezone: string;
  overrideMode: string;
  overrideUntil?: string | null;
  openDestType?: string | null;
  openDestId?: string | null;
  lunchDestType?: string | null;
  lunchDestId?: string | null;
  closedDestType?: string | null;
  closedDestId?: string | null;
  holidayDestType?: string | null;
  holidayDestId?: string | null;
  ranges: Range[];
};

type Holiday = {
  id: string;
  scheduleId: string | null;
  date: string;
  name: string;
  halfDay: boolean;
};

const DAYS = [
  { v: 1, en: "Mon", tr: "Pzt" },
  { v: 2, en: "Tue", tr: "Sal" },
  { v: 3, en: "Wed", tr: "Çar" },
  { v: 4, en: "Thu", tr: "Per" },
  { v: 5, en: "Fri", tr: "Cum" },
  { v: 6, en: "Sat", tr: "Cmt" },
  { v: 0, en: "Sun", tr: "Paz" },
];

const emptyRange = (): Range => ({
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "18:00",
  status: "open",
});

function DestFields({
  label,
  type,
  id,
  onType,
  onId,
}: {
  label: string;
  type: string;
  id: string;
  onType: (v: string) => void;
  onId: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-[var(--text-muted)]">{label}</div>
      <DestPicker
        destType={type}
        destId={id || null}
        onChange={(t, d) => {
          onType(t);
          onId(d ?? "");
        }}
      />
    </div>
  );
}

export function SchedulesPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const actions = usePendingAction();
  const lang = i18n.language?.startsWith("tr") ? "tr" : "en";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Europe/Istanbul");
  const [ranges, setRanges] = useState<Range[]>([]);
  const [openDestType, setOpenDestType] = useState("queue");
  const [openDestId, setOpenDestId] = useState("");
  const [lunchDestType, setLunchDestType] = useState("flow");
  const [lunchDestId, setLunchDestId] = useState("");
  const [closedDestType, setClosedDestType] = useState("voicemail");
  const [closedDestId, setClosedDestId] = useState("");
  const [holidayDestType, setHolidayDestType] = useState("hangup");
  const [holidayDestId, setHolidayDestId] = useState("");
  const [holDate, setHolDate] = useState("");
  const [holName, setHolName] = useState("");
  const [holHalf, setHolHalf] = useState(false);
  const [newName, setNewName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.get<Schedule[]>("/api/v1/admin/schedules"),
  });
  const holidaysQ = useQuery({
    queryKey: ["holidays"],
    queryFn: () => api.get<Holiday[]>("/api/v1/admin/holidays"),
  });

  const selected = list.data?.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setName(selected.name);
    setTimezone(selected.timezone || "Europe/Istanbul");
    setRanges(
      (selected.ranges ?? []).map((r) => ({
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        status: r.status === "lunch" ? "lunch" : "open",
      })),
    );
    setOpenDestType(selected.openDestType ?? "queue");
    setOpenDestId(selected.openDestId ?? "");
    setLunchDestType(selected.lunchDestType ?? "flow");
    setLunchDestId(selected.lunchDestId ?? "");
    setClosedDestType(selected.closedDestType ?? "voicemail");
    setClosedDestId(selected.closedDestId ?? "");
    setHolidayDestType(selected.holidayDestType ?? "hangup");
    setHolidayDestId(selected.holidayDestId ?? "");
  }, [selected?.id, list.dataUpdatedAt]);

  const [overrideUntilLocal, setOverrideUntilLocal] = useState("");
  const setOverride = useMutation({
    mutationFn: ({
      id,
      mode,
      until,
    }: {
      id: string;
      mode: string;
      until?: string | null;
    }) =>
      api.put(`/api/v1/admin/schedules/${id}/override`, {
        overrideMode: mode,
        overrideUntil: until === undefined ? undefined : until,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["schedules"] });
      toast.success(tr("Override updated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/admin/schedules/${selected!.id}`, {
        name,
        timezone,
        ranges,
        openDestType,
        openDestId: openDestId || null,
        lunchDestType,
        lunchDestId: lunchDestId || null,
        closedDestType,
        closedDestId: closedDestId || null,
        holidayDestType,
        holidayDestId: holidayDestId || null,
      }),
    onSuccess: () => {
      toast.success(t("common.saved", { defaultValue: "Saved" }));
      void qc.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<Schedule>("/api/v1/admin/schedules", {
        name: newName || "Business hours",
        timezone: "Europe/Istanbul",
        ranges: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "12:30", status: "open" },
          { dayOfWeek: 1, startTime: "12:30", endTime: "13:30", status: "lunch" },
          { dayOfWeek: 1, startTime: "13:30", endTime: "18:00", status: "open" },
        ],
        openDestType: "flow",
        closedDestType: "hangup",
      }),
    onSuccess: (row) => {
      toast.success(t("common.created", { defaultValue: "Created" }));
      setNewName("");
      setCreateOpen(false);
      setSelectedId(row.id);
      void qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/schedules/${id}`),
    onSuccess: () => {
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });

  const addHoliday = useMutation({
    mutationFn: () =>
      api.post("/api/v1/admin/holidays", {
        scheduleId: selected?.id ?? null,
        date: holDate,
        name: holName,
        halfDay: holHalf,
      }),
    onSuccess: () => {
      setHolDate("");
      setHolName("");
      setHolHalf(false);
      void qc.invalidateQueries({ queryKey: ["holidays"] });
    },
  });

  function updateRange(i: number, patch: Partial<Range>) {
    setRanges((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addWeekdaysPreset() {
    const preset: Range[] = [1, 2, 3, 4, 5].flatMap((day) => [
      { dayOfWeek: day, startTime: "09:00", endTime: "12:30", status: "open" as const },
      { dayOfWeek: day, startTime: "12:30", endTime: "13:30", status: "lunch" as const },
      { dayOfWeek: day, startTime: "13:30", endTime: "18:00", status: "open" as const },
    ]);
    setRanges(preset);
  }

  const scheduleHolidays =
    holidaysQ.data?.filter((h) => !h.scheduleId || h.scheduleId === selected?.id) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarClock}
        title={t("schedules.title")}
        tone="cyan"
        description={tr("Hours, overrides, holidays")}
      />

      <SectionCard
        title={tr("Schedules")}
        icon={CalendarDays}
        tone="blue"
        flush
        actions={
          <Button type="button" variant="solid" onClick={() => setCreateOpen(true)}>
            {t("common.create")}
          </Button>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th className="col-grow">{t("schedules.name", { defaultValue: "Name" })}</th>
              <th>{tr("Hours")}</th>
              <th className="col-actions">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={3} className="text-[var(--text-muted)]">
                  {t("schedules.empty", { defaultValue: "No schedules yet — create one below to define open hours." })}
                </td>
              </tr>
            ) : (
              list.data?.map((s) => (
                <tr key={s.id}>
                  <td className="col-grow">{s.name}</td>
                  <td>{s.ranges?.length ?? 0}</td>
                  <td className="col-actions">
                    <div className="btn-icon-row">
                      <IconBtn icon={Pencil} label={tr("Edit")} onClick={() => setSelectedId(s.id)} />
                      <IconBtn icon={Trash2} label={t("common.delete")} danger onClick={() => { setDeleteId(s.id); setDeleteOpen(true); }} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </SectionCard>

      <Modal open={createOpen} onOpenChange={setCreateOpen} title={tr("Create schedule")}>
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          {tr("Name a schedule to get a weekday open-hours template. Pick it below to edit ranges, holidays, and destinations.")}
        </p>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (create.isPending) return;
            create.mutate();
          }}
        >
          <TextField
            label={t("schedules.newName", { defaultValue: "Schedule name" })}
            placeholder={t("schedules.newName")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="min-w-[16rem]"
          />
          <Button variant="solid" type="submit" pending={create.isPending}>
            <Plus size={16} />
            {t("common.create")}
          </Button>
        </form>
      </Modal>

      {selected && (
        <Modal
          open
          onOpenChange={(next) => {
            if (!next) setSelectedId(null);
          }}
          title={tr("Schedule details")}
          maxWidth="52rem"
        >
        <div className="space-y-6">
          <ScheduleNowStatus scheduleId={selected.id} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <TextField
                label={t("schedules.name", { defaultValue: "Name" })}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                label={t("schedules.timezone", { defaultValue: "Timezone" })}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder={tr("Europe/Istanbul")}
              />
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap gap-2">
                {(["auto", "open", "closed"] as const).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    variant={selected.overrideMode === mode ? "solid" : "soft"}
                    pending={setOverride.isPending}
                    onClick={() => {
                      if (setOverride.isPending) return;
                      setOverride.mutate({
                        id: selected.id,
                        mode,
                        until:
                          mode === "auto"
                            ? null
                            : overrideUntilLocal
                              ? new Date(overrideUntilLocal).toISOString()
                              : null,
                      });
                    }}
                  >
                    {t(`schedules.${mode === "auto" ? "auto" : mode}`)}
                  </Button>
                ))}
              </div>
              <label className="block text-xs text-[var(--text-muted)]">
                {tr("Override until (optional)")}
                <input
                  className="input mt-1"
                  type="datetime-local"
                  value={overrideUntilLocal}
                  onChange={(e) => setOverrideUntilLocal(e.target.value)}
                />
              </label>
              {selected.overrideUntil && (
                <p className="text-xs text-[var(--text-muted)]">
                  {tr("Active until")} {new Date(selected.overrideUntil).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">{t("schedules.weekly", { defaultValue: "Weekly hours" })}</h2>
              <div className="flex gap-2">
                <Button type="button" onClick={addWeekdaysPreset}>
                  {t("schedules.presetWeekdays", { defaultValue: "Mon–Fri 09–18 + lunch" })}
                </Button>
                <Button
                  type="button"
                  onClick={() => setRanges((rs) => [...rs, emptyRange()])}
                >
                  {t("schedules.addRange", { defaultValue: "Add range" })}
                </Button>
              </div>
            </div>
            <p className="mb-3 text-sm text-[var(--text-muted)]">
              {t("schedules.weeklyHint", {
                defaultValue:
                  "Outside these ranges the schedule is closed. Day 0=Sun … 6=Sat. Status: open or lunch.",
              })}
            </p>
            <div className="space-y-2">
              {ranges.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">—</p>
              ) : (
                ranges.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] p-2">
                    <label className="text-xs text-[var(--text-muted)]">
                      {t("schedules.day", { defaultValue: "Day" })}
                      <SelectInput
                        className="mt-1"
                        aria-label={t("schedules.day", { defaultValue: "Day" })}
                        value={String(r.dayOfWeek)}
                        onValueChange={(next) => updateRange(i, { dayOfWeek: Number(next) })}
                        options={DAYS.map((d) => ({ value: String(d.v), label: d[lang] }))}
                      />
                    </label>
                    <label className="text-xs text-[var(--text-muted)]">
                      {t("schedules.from", { defaultValue: "From" })}
                      <input
                        className="input mt-1 font-mono"
                        type="time"
                        value={r.startTime}
                        onChange={(e) => updateRange(i, { startTime: e.target.value })}
                      />
                    </label>
                    <label className="text-xs text-[var(--text-muted)]">
                      {t("schedules.to", { defaultValue: "To" })}
                      <input
                        className="input mt-1 font-mono"
                        type="time"
                        value={r.endTime}
                        onChange={(e) => updateRange(i, { endTime: e.target.value })}
                      />
                    </label>
                    <label className="text-xs text-[var(--text-muted)]">
                      {t("schedules.status", { defaultValue: "Status" })}
                      <SelectInput
                        className="mt-1"
                        aria-label={t("schedules.status", { defaultValue: "Status" })}
                        value={r.status}
                        onValueChange={(next) => updateRange(i, { status: next as "open" | "lunch" })}
                        options={[
                          { value: "open", label: t("schedules.openHours", { defaultValue: "Open" }) },
                          { value: "lunch", label: t("schedules.lunch", { defaultValue: "Lunch" }) },
                        ]}
                      />
                    </label>
                    <Button
                      variant="solid" color="red"
                      type="button"
                      onClick={() => setRanges((rs) => rs.filter((_, idx) => idx !== i))}
                    >
                      {t("common.delete")}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="font-medium">{t("schedules.destinations", { defaultValue: "Destinations" })}</h2>
            <DestFields
              label={t("schedules.whenOpen", { defaultValue: "When open" })}
              type={openDestType}
              id={openDestId}
              onType={setOpenDestType}
              onId={setOpenDestId}
            />
            <DestFields
              label={t("schedules.whenLunch", { defaultValue: "When lunch" })}
              type={lunchDestType}
              id={lunchDestId}
              onType={setLunchDestType}
              onId={setLunchDestId}
            />
            <DestFields
              label={t("schedules.whenClosed", { defaultValue: "When closed" })}
              type={closedDestType}
              id={closedDestId}
              onType={setClosedDestType}
              onId={setClosedDestId}
            />
            <DestFields
              label={t("schedules.whenHoliday", { defaultValue: "On holiday" })}
              type={holidayDestType}
              id={holidayDestId}
              onType={setHolidayDestType}
              onId={setHolidayDestId}
            />
          </div>

          <div>
            <h2 className="mb-2 font-medium">{t("schedules.holidays", { defaultValue: "Holidays" })}</h2>
            <form
              className="toolbar"
              onSubmit={(e) => {
                e.preventDefault();
                if (addHoliday.isPending) return;
                if (!holDate || !holName) return;
                addHoliday.mutate();
              }}
            >
              <label className="text-xs text-[var(--text-muted)]">
                {tr("Date")}
                <input
                  className="input mt-1"
                  type="date"
                  value={holDate}
                  onChange={(e) => setHolDate(e.target.value)}
                  required
                />
              </label>
              <label className="text-xs text-[var(--text-muted)]">
                {tr("Name")}
                <input
                  className="input mt-1"
                  value={holName}
                  onChange={(e) => setHolName(e.target.value)}
                  placeholder={t("schedules.holidayPlaceholder")}
                  required
                />
              </label>
              <Checkbox
                checked={holHalf}
                onCheckedChange={setHolHalf}
                label={t("schedules.halfDay", { defaultValue: "Half day (open until noon)" })}
              />
              <Button variant="solid" type="submit" pending={addHoliday.isPending}>
                {t("common.create")}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void api
                    .post<{ inserted: number; year: number }>("/api/v1/admin/holidays/tr-pack", {
                      scheduleId: selected?.id ?? null,
                      year: new Date().getFullYear(),
                      locale: lang,
                    })
                    .then((r) => {
                      toast.success(t("schedules.trPackDone", { year: r.year, count: r.inserted }));
                      void qc.invalidateQueries({ queryKey: ["holidays"] });
                    })
                    .catch((e: Error) => toast.error(e.message));
                }}
              >
                {t("schedules.trPack")}
              </Button>
            </form>
            <ul className="space-y-1 text-sm">
              {scheduleHolidays.length === 0 ? (
                <li className="text-[var(--text-muted)]">—</li>
              ) : (
                scheduleHolidays.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between gap-2 rounded border border-[var(--border)] px-3 py-2"
                  >
                    <span>
                      <span className="font-mono">{h.date}</span> — {h.name}
                      {h.halfDay ? " (½)" : ""}
                    </span>
                    <Button
                      variant="solid" color="red"
                      type="button"
                      pending={actions.isPending(`holiday:${h.id}`)}
                      onClick={() =>
                        void actions.run(`holiday:${h.id}`, async () => {
                          try {
                            await api.delete(`/api/v1/admin/holidays/${h.id}`);
                            void qc.invalidateQueries({ queryKey: ["holidays"] });
                          } catch (e) {
                            toast.error(String(e));
                          }
                        })
                      }
                    >
                      {t("common.delete")}
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
            <Button
              variant="solid"
              type="button"
              pending={save.isPending}
              onClick={() => {
                if (!save.isPending) save.mutate();
              }}
            >
              {t("common.save")}
            </Button>
            <Button variant="solid" color="red" type="button" onClick={() => { setDeleteId(selected.id); setDeleteOpen(true); }}>
              {t("common.delete")}
            </Button>
          </div>
        </div>
        </Modal>
      )}
      <ConfirmDialog
        open={deleteOpen && !!deleteId}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteId(null);
        }}
        title={t("common.delete")}
        description={t("schedules.confirmDelete", { defaultValue: "Delete this schedule?" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel", { defaultValue: "Cancel" })}
        pending={remove.isPending}
        onConfirm={() => {
          if (remove.isPending) return;
          if (deleteId) remove.mutate(deleteId);
        }}
      />
    </div>
  );
}

function ScheduleNowStatus({ scheduleId }: { scheduleId: string }) {
  const status = useQuery({
    queryKey: ["schedule-status", scheduleId],
    queryFn: () =>
      api.get<{ status: string; at: string }>(`/api/v1/admin/schedules/${scheduleId}/status`),
    refetchInterval: 30_000,
  });
  return (
    <p className="text-sm text-[var(--text-muted)]">
      {tr("Now:")}{" "}
      <span className="badge font-medium text-[var(--text)]">{status.data?.status ?? "…"}</span>
    </p>
  );
}
