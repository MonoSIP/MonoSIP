import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { DestPicker } from "../../components/DestPicker";

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

  const list = useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.get<Schedule[]>("/api/v1/admin/schedules"),
  });
  const holidaysQ = useQuery({
    queryKey: ["holidays"],
    queryFn: () => api.get<Holiday[]>("/api/v1/admin/holidays"),
  });

  const selected = list.data?.find((s) => s.id === selectedId) ?? list.data?.[0] ?? null;

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
      toast.success("Override updated");
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("schedules.title")}</h1>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <input
            className="input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("schedules.newName", { defaultValue: "New schedule name" })}
          />
          <button className="btn btn-primary" type="submit">
            {t("common.create")}
          </button>
        </form>
      </div>

      {!list.data?.length ? (
        <p className="text-[var(--text-muted)]">
          {t("schedules.empty", { defaultValue: "No schedules yet — create one to define open hours." })}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {list.data.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`btn ${selected?.id === s.id ? "btn-primary" : ""}`}
              onClick={() => setSelectedId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="card space-y-6 p-5">
          <ScheduleNowStatus scheduleId={selected.id} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm text-[var(--text-muted)]">
                {t("schedules.name", { defaultValue: "Name" })}
                <input className="input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block text-sm text-[var(--text-muted)]">
                {t("schedules.timezone", { defaultValue: "Timezone" })}
                <input
                  className="input mt-1 w-full"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Europe/Istanbul"
                />
              </label>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap gap-2">
                {(["auto", "open", "closed"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`btn ${selected.overrideMode === mode ? "btn-primary" : ""}`}
                    onClick={() =>
                      setOverride.mutate({
                        id: selected.id,
                        mode,
                        until:
                          mode === "auto"
                            ? null
                            : overrideUntilLocal
                              ? new Date(overrideUntilLocal).toISOString()
                              : null,
                      })
                    }
                  >
                    {t(`schedules.${mode === "auto" ? "auto" : mode}`)}
                  </button>
                ))}
              </div>
              <label className="block text-xs text-[var(--text-muted)]">
                Override until (optional)
                <input
                  className="input mt-1"
                  type="datetime-local"
                  value={overrideUntilLocal}
                  onChange={(e) => setOverrideUntilLocal(e.target.value)}
                />
              </label>
              {selected.overrideUntil && (
                <p className="text-xs text-[var(--text-muted)]">
                  Active until {new Date(selected.overrideUntil).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">{t("schedules.weekly", { defaultValue: "Weekly hours" })}</h2>
              <div className="flex gap-2">
                <button className="btn" type="button" onClick={addWeekdaysPreset}>
                  {t("schedules.presetWeekdays", { defaultValue: "Mon–Fri 09–18 + lunch" })}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => setRanges((rs) => [...rs, emptyRange()])}
                >
                  {t("schedules.addRange", { defaultValue: "Add range" })}
                </button>
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
                      <select
                        className="input mt-1"
                        value={r.dayOfWeek}
                        onChange={(e) => updateRange(i, { dayOfWeek: Number(e.target.value) })}
                      >
                        {DAYS.map((d) => (
                          <option key={d.v} value={d.v}>
                            {d[lang]}
                          </option>
                        ))}
                      </select>
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
                      <select
                        className="input mt-1"
                        value={r.status}
                        onChange={(e) =>
                          updateRange(i, { status: e.target.value as "open" | "lunch" })
                        }
                      >
                        <option value="open">{t("schedules.openHours", { defaultValue: "Open" })}</option>
                        <option value="lunch">{t("schedules.lunch", { defaultValue: "Lunch" })}</option>
                      </select>
                    </label>
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => setRanges((rs) => rs.filter((_, idx) => idx !== i))}
                    >
                      {t("common.delete")}
                    </button>
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
              className="mb-3 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!holDate || !holName) return;
                addHoliday.mutate();
              }}
            >
              <label className="text-xs text-[var(--text-muted)]">
                Date
                <input
                  className="input mt-1"
                  type="date"
                  value={holDate}
                  onChange={(e) => setHolDate(e.target.value)}
                  required
                />
              </label>
              <label className="text-xs text-[var(--text-muted)]">
                Name
                <input
                  className="input mt-1"
                  value={holName}
                  onChange={(e) => setHolName(e.target.value)}
                  placeholder="Bayram"
                  required
                />
              </label>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" checked={holHalf} onChange={(e) => setHolHalf(e.target.checked)} />
                {t("schedules.halfDay", { defaultValue: "Half day (open until noon)" })}
              </label>
              <button className="btn btn-primary" type="submit">
                {t("common.create")}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  void api
                    .post<{ inserted: number; year: number }>("/api/v1/admin/holidays/tr-pack", {
                      scheduleId: selected?.id ?? null,
                      year: new Date().getFullYear(),
                    })
                    .then((r) => {
                      toast.success(`TR ${r.year}: ${r.inserted} holiday(s) added`);
                      void qc.invalidateQueries({ queryKey: ["holidays"] });
                    })
                    .catch((e: Error) => toast.error(e.message));
                }}
              >
                TR resmi + bayramlar
              </button>
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
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() =>
                        void api.delete(`/api/v1/admin/holidays/${h.id}`).then(() =>
                          qc.invalidateQueries({ queryKey: ["holidays"] }),
                        )
                      }
                    >
                      {t("common.delete")}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
            <button className="btn btn-primary" type="button" onClick={() => save.mutate()} disabled={save.isPending}>
              {t("common.save")}
            </button>
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => {
                if (confirm(t("schedules.confirmDelete", { defaultValue: "Delete this schedule?" }))) {
                  remove.mutate(selected.id);
                }
              }}
            >
              {t("common.delete")}
            </button>
          </div>
        </div>
      )}
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
      Now:{" "}
      <span className="badge font-medium text-[var(--text)]">{status.data?.status ?? "…"}</span>
    </p>
  );
}
