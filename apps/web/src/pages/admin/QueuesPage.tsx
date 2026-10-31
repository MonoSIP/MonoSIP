import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Headphones, ListOrdered, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { DestPicker } from "../../components/DestPicker";
import { Button, Checkbox, IconBtn, Modal, PageHeader, SectionCard, SelectField, TextField, usePendingAction } from "../../components/ui";
import { tr } from "../../i18n";
import { SPEECH_VOICES, voiceOptions } from "./flow/nodeMeta";

type Ext = { id: string; number: string; name: string };
type Member = { extensionId: string; penalty: number; paused?: boolean };
type Queue = {
  id: string;
  name: string;
  number: string;
  strategy: string;
  maxWait?: number;
  memberTimeout?: number;
  wrapup?: number;
  maxCallers?: number;
  mohId?: string | null;
  callbackEnabled?: boolean;
  announceHoldtime?: boolean;
  announcePosition?: boolean;
  language?: "tr" | "en" | null;
  voice?: string | null;
  timeoutDestType?: string | null;
  timeoutDestId?: string | null;
  fullDestType?: string | null;
  fullDestId?: string | null;
  joinemptyDestType?: string | null;
  joinemptyDestId?: string | null;
  members: Member[];
};

const STRATEGIES = ["ringall", "leastrecent", "fewestcalls", "random", "rrmemory", "linear"] as const;

export function QueuesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const actions = usePendingAction();
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [strategy, setStrategy] = useState("rrmemory");
  const [maxWait, setMaxWait] = useState(300);
  const [maxCallers, setMaxCallers] = useState(20);
  const [memberTimeout, setMemberTimeout] = useState(15);
  const [wrapup, setWrapup] = useState(5);
  const [callback, setCallback] = useState(false);
  const [announceHold, setAnnounceHold] = useState(true);
  const [announcePos, setAnnouncePos] = useState(true);
  const [language, setLanguage] = useState<"" | "tr" | "en">("");
  const [voice, setVoice] = useState("");
  const [timeoutDestType, setTimeoutDestType] = useState("hangup");
  const [timeoutDestId, setTimeoutDestId] = useState<string | null>(null);
  const [fullDestType, setFullDestType] = useState("hangup");
  const [fullDestId, setFullDestId] = useState<string | null>(null);
  const [joinDestType, setJoinDestType] = useState("hangup");
  const [joinDestId, setJoinDestId] = useState<string | null>(null);
  const [mohId, setMohId] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const list = useQuery({
    queryKey: ["queues"],
    queryFn: () => api.get<Queue[]>("/api/v1/admin/queues"),
  });
  const exts = useQuery({
    queryKey: ["extensions"],
    queryFn: () => api.get<Ext[]>("/api/v1/admin/extensions"),
  });
  const moh = useQuery({
    queryKey: ["moh"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/api/v1/admin/moh"),
  });

  const payload = () => ({
    name,
    number,
    strategy,
    maxWait,
    maxCallers,
    memberTimeout,
    wrapup,
    mohId: mohId || null,
    callbackEnabled: callback,
    announceHoldtime: announceHold,
    announcePosition: announcePos,
    language: language || null,
    voice: voice || null,
    timeoutDestType: timeoutDestType || null,
    timeoutDestId: timeoutDestId,
    fullDestType: fullDestType || null,
    fullDestId: fullDestId,
    joinemptyDestType: joinDestType || null,
    joinemptyDestId: joinDestId,
    members: members.map((m) => ({
      extensionId: m.extensionId,
      penalty: m.penalty,
      paused: !!m.paused,
    })),
  });

  const create = useMutation({
    mutationFn: () => api.post("/api/v1/admin/queues", payload()),
    onSuccess: () => {
      resetForm();
      void qc.invalidateQueries({ queryKey: ["queues"] });
      toast.success(tr("Queue created"));
    },
  });

  const saveEdit = useMutation({
    mutationFn: () => api.patch(`/api/v1/admin/queues/${editId}`, payload()),
    onSuccess: () => {
      resetForm();
      void qc.invalidateQueries({ queryKey: ["queues"] });
      toast.success(tr("Queue updated"));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/queues/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["queues"] });
      toast.success(tr("Queue deleted"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function resetForm() {
    setEditId(null);
    setName("");
    setNumber("");
    setStrategy("rrmemory");
    setMaxWait(300);
    setMaxCallers(20);
    setMemberTimeout(15);
    setWrapup(5);
    setCallback(false);
    setAnnounceHold(true);
    setAnnouncePos(true);
    setLanguage("");
    setVoice("");
    setTimeoutDestType("hangup");
    setTimeoutDestId(null);
    setFullDestType("hangup");
    setFullDestId(null);
    setJoinDestType("hangup");
    setJoinDestId(null);
    setMohId("");
    setMembers([]);
    setFormOpen(false);
  }

  function openCreate() {
    resetForm();
    setFormOpen(true);
  }

  function toggleMember(id: string) {
    setMembers((cur) =>
      cur.some((m) => m.extensionId === id)
        ? cur.filter((m) => m.extensionId !== id)
        : [...cur, { extensionId: id, penalty: 0 }],
    );
  }

  function moveMember(id: string, dir: -1 | 1) {
    setMembers((cur) => {
      const i = cur.findIndex((m) => m.extensionId === id);
      if (i < 0) return cur;
      const j = i + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function setPenalty(id: string, penalty: number) {
    setMembers((cur) =>
      cur.map((m) => (m.extensionId === id ? { ...m, penalty: Math.max(0, penalty) } : m)),
    );
  }

  function startEdit(q: Queue) {
    setEditId(q.id);
    setName(q.name);
    setNumber(q.number);
    setStrategy(q.strategy);
    setMaxWait(q.maxWait ?? 300);
    setMaxCallers(q.maxCallers ?? 20);
    setMemberTimeout(q.memberTimeout ?? 15);
    setWrapup(q.wrapup ?? 5);
    setCallback(!!q.callbackEnabled);
    setAnnounceHold(q.announceHoldtime ?? true);
    setAnnouncePos(q.announcePosition ?? true);
    setLanguage(q.language ?? "");
    setVoice(q.voice ?? "");
    setTimeoutDestType(q.timeoutDestType ?? "hangup");
    setTimeoutDestId(q.timeoutDestId ?? null);
    setFullDestType(q.fullDestType ?? "hangup");
    setFullDestId(q.fullDestId ?? null);
    setJoinDestType(q.joinemptyDestType ?? "hangup");
    setJoinDestId(q.joinemptyDestId ?? null);
    setMohId(q.mohId ?? "");
    setMembers(
      (q.members ?? []).map((m) => ({
        extensionId: m.extensionId,
        penalty: m.penalty ?? 0,
        paused: m.paused,
      })),
    );
    setFormOpen(true);
  }

  async function pauseMember(queueId: string, extensionId: string, paused: boolean) {
    await api.post(`/api/v1/admin/queues/${queueId}/members/${extensionId}/pause`, { paused });
    void qc.invalidateQueries({ queryKey: ["queues"] });
  }

  return (
    <div>
      <PageHeader
        icon={Headphones}
        title={t("queues.title")}
        tone="blue"
        description={tr("Queues, agents, overflow")}
      />
      <SectionCard
        title={tr("Queue list")}
        icon={ListOrdered}
        tone="blue"
        flush
        className="mb-6"
        actions={
          <Button type="button" variant="solid" onClick={openCreate}>
            {t("common.create")}
          </Button>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th>{t("extensions.number")}</th>
              <th>{t("extensions.name")}</th>
              <th>{t("queues.strategy")}</th>
              <th className="col-grow">{t("queues.members")}</th>
              <th>{tr("Callback")}</th>
              <th className="col-actions">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.map((q) => (
              <tr key={q.id}>
                <td className="font-mono">{q.number}</td>
                <td>{q.name}</td>
                <td>{q.strategy}</td>
                <td className="col-grow">
                  <div className="flex flex-wrap gap-1">
                    {(q.members ?? []).map((m) => {
                      const ext = exts.data?.find((e) => e.id === m.extensionId);
                      return (
                        <Button
                          key={m.extensionId}
                          type="button"
                          className="text-xs"
                          pending={actions.isPending(`pause:${q.id}:${m.extensionId}`)}
                          onClick={() =>
                            void actions.run(`pause:${q.id}:${m.extensionId}`, () =>
                              pauseMember(q.id, m.extensionId, !m.paused).catch((e) => toast.error(String(e))),
                            )
                          }
                          title={`penalty ${m.penalty ?? 0}`}
                        >
                          {ext?.number ?? "?"}
                          {(m.penalty ?? 0) > 0 ? ` p${m.penalty}` : ""}
                          {m.paused ? " ⏸" : ""}
                        </Button>
                      );
                    })}
                  </div>
                </td>
                <td>{q.callbackEnabled ? "on" : "off"}</td>
                <td className="col-actions">
                  <span className="btn-icon-row">
                    <IconBtn icon={Pencil} label={tr("Edit")} onClick={() => startEdit(q)} />
                    <IconBtn
                      icon={Trash2}
                      label={t("common.delete")}
                      danger
                      pending={remove.isPending && remove.variables === q.id}
                      onClick={() => {
                        if (remove.isPending && remove.variables === q.id) return;
                        remove.mutate(q.id);
                      }}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
      <Modal
        open={formOpen}
        onOpenChange={(next) => {
          if (!next) resetForm();
        }}
        title={editId ? t("common.edit", { defaultValue: "Edit" }) : t("common.create")}
        maxWidth="52rem"
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (editId ? saveEdit.isPending : create.isPending) return;
            if (editId) saveEdit.mutate();
            else create.mutate();
          }}
        >
        <div className="toolbar toolbar-wrap">
          <TextField
            label={t("extensions.number")}
            className="w-[7.5rem]"
            placeholder={t("extensions.number")}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            disabled={!!editId}
            required
          />
          <TextField
            label={t("extensions.name")}
            className="min-w-[12rem]"
            placeholder={t("extensions.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <SelectField
            label={t("queues.strategy")}
            className="w-[10rem]"
            value={strategy}
            onValueChange={setStrategy}
            options={STRATEGIES.map((s) => ({ value: s, label: s }))}
          />
          <TextField
            label={tr("Max wait (s)")}
            className="w-[7rem]"
            type="number"
            value={maxWait}
            onChange={(e) => setMaxWait(Number(e.target.value))}
          />
          <TextField
            label={tr("Max callers")}
            className="w-[7rem]"
            type="number"
            min={0}
            value={maxCallers}
            onChange={(e) => setMaxCallers(Number(e.target.value))}
          />
          <TextField
            label={tr("Agent ring (s)")}
            className="w-[7rem]"
            type="number"
            value={memberTimeout}
            onChange={(e) => setMemberTimeout(Number(e.target.value))}
          />
          <TextField
            label={tr("Wrap-up (s)")}
            className="w-[7rem]"
            type="number"
            value={wrapup}
            onChange={(e) => setWrapup(Number(e.target.value))}
          />
          <SelectField
            label={tr("Announcement language")}
            className="w-[10rem]"
            value={language}
            onValueChange={(next) => {
              const lang = next as "" | "tr" | "en";
              setLanguage(lang);
              if (lang && voice && !voiceOptions(lang).some((v) => v.value === voice)) setVoice("");
            }}
            options={[
              { value: "", label: tr("System default") },
              { value: "tr", label: "Türkçe" },
              { value: "en", label: "English" },
            ]}
          />
          <SelectField
            label={tr("Voice model")}
            className="w-[10rem]"
            value={voice}
            onValueChange={setVoice}
            options={[
              { value: "", label: tr("Default") },
              ...(language
                ? voiceOptions(language)
                : SPEECH_VOICES.map((v) => ({ value: v.value, label: tr(v.label) }))),
            ]}
          />
          <SelectField
            label={tr("MOH class")}
            className="w-[10rem]"
            value={mohId}
            onValueChange={setMohId}
            options={[
              { value: "", label: "default" },
              ...(moh.data ?? []).map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <Checkbox checked={callback} onCheckedChange={setCallback} label={tr("Queue callback")} />
          <Checkbox checked={announceHold} onCheckedChange={setAnnounceHold} label={tr("Announce hold time (TTS, MOH pauses)")} />
          <Checkbox checked={announcePos} onCheckedChange={setAnnouncePos} label={tr("Announce position (TTS ~30s, MOH pauses)")} />
        </div>
        <div className="space-y-2">
          <div className="text-sm text-[var(--text-muted)]">{tr("Timeout overflow")}</div>
          <DestPicker
            destType={timeoutDestType}
            destId={timeoutDestId}
            onChange={(t, id) => {
              setTimeoutDestType(t);
              setTimeoutDestId(id);
            }}
          />
          <div className="text-sm text-[var(--text-muted)]">{tr("Full overflow")}</div>
          <DestPicker
            destType={fullDestType}
            destId={fullDestId}
            onChange={(t, id) => {
              setFullDestType(t);
              setFullDestId(id);
            }}
          />
          <div className="text-sm text-[var(--text-muted)]">{tr("Join-empty overflow")}</div>
          <DestPicker
            destType={joinDestType}
            destId={joinDestId}
            onChange={(t, id) => {
              setJoinDestType(t);
              setJoinDestId(id);
            }}
          />
        </div>
        <div>
          <div className="mb-1 text-sm text-[var(--text-muted)]">{t("queues.members")}</div>
          <div className="mb-2 flex flex-wrap gap-2">
            {exts.data?.map((e) => (
              <Checkbox
                key={e.id}
                className="rounded border border-[var(--border)] px-2"
                checked={members.some((m) => m.extensionId === e.id)}
                onCheckedChange={() => toggleMember(e.id)}
                label={e.number}
              />
            ))}
          </div>
          {members.length > 0 && (
            <ul className="space-y-2">
              {members.map((m, idx) => {
                const ext = exts.data?.find((e) => e.id === m.extensionId);
                return (
                  <li
                    key={m.extensionId}
                    className="flex flex-wrap items-center gap-2 rounded border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <span className="w-6 text-[var(--text-muted)]">{idx + 1}.</span>
                    <span className="font-mono min-w-[4rem]">{ext?.number ?? "?"}</span>
                    <label className="flex items-center gap-1">
                      {tr("Penalty")}
                      <input
                        className="input w-16"
                        type="number"
                        min={0}
                        value={m.penalty}
                        onChange={(e) => setPenalty(m.extensionId, Number(e.target.value))}
                      />
                    </label>
                    <Button type="button" onClick={() => moveMember(m.extensionId, -1)} disabled={idx === 0}>
                      ↑
                    </Button>
                    <Button
                      type="button"
                      onClick={() => moveMember(m.extensionId, 1)}
                      disabled={idx === members.length - 1}
                    >
                      ↓
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="solid" type="submit" pending={editId ? saveEdit.isPending : create.isPending}>
            <Plus size={16} />
            {editId ? t("common.save") : t("common.create")}
          </Button>
          {editId && (
            <Button type="button" onClick={resetForm}>
              {tr("Cancel")}
            </Button>
          )}
        </div>
        </form>
      </Modal>
    </div>
  );
}
