import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { DestPicker } from "../../components/DestPicker";

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
  const [timeoutDestType, setTimeoutDestType] = useState("hangup");
  const [timeoutDestId, setTimeoutDestId] = useState<string | null>(null);
  const [fullDestType, setFullDestType] = useState("hangup");
  const [fullDestId, setFullDestId] = useState<string | null>(null);
  const [joinDestType, setJoinDestType] = useState("hangup");
  const [joinDestId, setJoinDestId] = useState<string | null>(null);
  const [mohId, setMohId] = useState<string>("");
  const [members, setMembers] = useState<Member[]>([]);
  const [editId, setEditId] = useState<string | null>(null);

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
      toast.success("Queue created");
    },
  });

  const saveEdit = useMutation({
    mutationFn: () => api.patch(`/api/v1/admin/queues/${editId}`, payload()),
    onSuccess: () => {
      resetForm();
      void qc.invalidateQueries({ queryKey: ["queues"] });
      toast.success("Queue updated");
    },
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
    setTimeoutDestType("hangup");
    setTimeoutDestId(null);
    setFullDestType("hangup");
    setFullDestId(null);
    setJoinDestType("hangup");
    setJoinDestId(null);
    setMohId("");
    setMembers([]);
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
  }

  async function pauseMember(queueId: string, extensionId: string, paused: boolean) {
    await api.post(`/api/v1/admin/queues/${queueId}/members/${extensionId}/pause`, { paused });
    void qc.invalidateQueries({ queryKey: ["queues"] });
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{t("queues.title")}</h1>
      <form
        className="card mb-6 space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (editId) saveEdit.mutate();
          else create.mutate();
        }}
      >
        <div className="flex flex-wrap gap-3">
          <input
            className="input max-w-[140px]"
            placeholder={t("extensions.number")}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            disabled={!!editId}
            required
          />
          <input
            className="input max-w-xs"
            placeholder={t("extensions.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <select className="input max-w-[10rem]" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="text-sm text-[var(--text-muted)]">
            Max wait (s)
            <input
              className="input mt-1 w-24"
              type="number"
              value={maxWait}
              onChange={(e) => setMaxWait(Number(e.target.value))}
            />
          </label>
          <label className="text-sm text-[var(--text-muted)]">
            Max callers
            <input
              className="input mt-1 w-24"
              type="number"
              min={0}
              value={maxCallers}
              onChange={(e) => setMaxCallers(Number(e.target.value))}
            />
          </label>
          <label className="text-sm text-[var(--text-muted)]">
            Agent ring (s)
            <input
              className="input mt-1 w-24"
              type="number"
              value={memberTimeout}
              onChange={(e) => setMemberTimeout(Number(e.target.value))}
            />
          </label>
          <label className="text-sm text-[var(--text-muted)]">
            Wrap-up (s)
            <input
              className="input mt-1 w-24"
              type="number"
              value={wrapup}
              onChange={(e) => setWrapup(Number(e.target.value))}
            />
          </label>
          <label className="text-sm text-[var(--text-muted)]">
            MOH class
            <select className="input mt-1" value={mohId} onChange={(e) => setMohId(e.target.value)}>
              <option value="">default</option>
              {(moh.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={callback} onChange={(e) => setCallback(e.target.checked)} />
            Queue callback
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={announceHold} onChange={(e) => setAnnounceHold(e.target.checked)} />
            Announce hold time (TTS, MOH pauses)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={announcePos} onChange={(e) => setAnnouncePos(e.target.checked)} />
            Announce position (TTS ~30s, MOH pauses)
          </label>
        </div>
        <div className="space-y-2">
          <div className="text-sm text-[var(--text-muted)]">Timeout overflow</div>
          <DestPicker
            destType={timeoutDestType}
            destId={timeoutDestId}
            onChange={(t, id) => {
              setTimeoutDestType(t);
              setTimeoutDestId(id);
            }}
          />
          <div className="text-sm text-[var(--text-muted)]">Full overflow</div>
          <DestPicker
            destType={fullDestType}
            destId={fullDestId}
            onChange={(t, id) => {
              setFullDestType(t);
              setFullDestId(id);
            }}
          />
          <div className="text-sm text-[var(--text-muted)]">Join-empty overflow</div>
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
              <label key={e.id} className="flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={members.some((m) => m.extensionId === e.id)}
                  onChange={() => toggleMember(e.id)}
                />
                {e.number}
              </label>
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
                      Penalty
                      <input
                        className="input w-16"
                        type="number"
                        min={0}
                        value={m.penalty}
                        onChange={(e) => setPenalty(m.extensionId, Number(e.target.value))}
                      />
                    </label>
                    <button className="btn" type="button" onClick={() => moveMember(m.extensionId, -1)} disabled={idx === 0}>
                      ↑
                    </button>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => moveMember(m.extensionId, 1)}
                      disabled={idx === members.length - 1}
                    >
                      ↓
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" type="submit">
            {editId ? t("common.save") : t("common.create")}
          </button>
          {editId && (
            <button className="btn" type="button" onClick={resetForm}>
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
              <th>{t("queues.strategy")}</th>
              <th>{t("queues.members")}</th>
              <th>Callback</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((q) => (
              <tr key={q.id}>
                <td className="font-mono">{q.number}</td>
                <td>{q.name}</td>
                <td>{q.strategy}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {(q.members ?? []).map((m) => {
                      const ext = exts.data?.find((e) => e.id === m.extensionId);
                      return (
                        <button
                          key={m.extensionId}
                          type="button"
                          className="btn text-xs"
                          onClick={() => void pauseMember(q.id, m.extensionId, !m.paused)}
                          title={`penalty ${m.penalty ?? 0}`}
                        >
                          {ext?.number ?? "?"}
                          {(m.penalty ?? 0) > 0 ? ` p${m.penalty}` : ""}
                          {m.paused ? " ⏸" : ""}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td>{q.callbackEnabled ? "on" : "off"}</td>
                <td>
                  <button className="btn" type="button" onClick={() => startEdit(q)}>
                    Edit
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
