import { DestPicker } from "../../../components/DestPicker";
import { ApiNodeSettings } from "./ApiNodeSettings";
import type { FlowNodeData } from "./FlowNodes";
import {
  DEFAULT_MENU_DIGITS,
  SPEECH_LANGS,
  exitsForNode,
  menuDigits,
  nodeTitle,
  voiceOptions,
} from "./nodeMeta";
import { ExitsHint, Field, SegmentedSelect, SettingsSection } from "./settingsUi";

type Prompt = { id: string; name: string };
type Moh = { id: string; name: string };
type Named = { id: string; name: string };
type Numbered = { id: string; number: string; name: string };

export type NodeSettingsContext = {
  prompts: Prompt[];
  mohClasses: Moh[];
  queues: Numbered[];
  extensions: Numbered[];
  schedules: Named[];
  flows: Named[];
  currentFlowId?: string;
};

export function NodeSettings({
  data,
  patch,
  ctx,
}: {
  data: FlowNodeData;
  patch: (p: Partial<FlowNodeData>) => void;
  ctx: NodeSettingsContext;
}) {
  const type = data.flowType;

  return (
    <div className="space-y-3">
      <SettingsSection title="On the map">
        <Field label="Label" hint="Short name shown on the node">
          <input
            className="input w-full"
            value={String(data.label ?? "")}
            onChange={(e) => patch({ label: e.target.value })}
            placeholder={nodeTitle(type)}
          />
        </Field>
        {type !== "api" && <ExitsHint exits={exitsForNode(type, data)} />}
      </SettingsSection>

      {type === "start" && (
        <SettingsSection title="How it works" hint="No extra options — this is the entry point.">
          <p className="text-xs text-[var(--text-muted)]">
            Variables ready when the call starts: <code>caller</code>, <code>did</code>,{" "}
            <code>time</code>.
          </p>
        </SettingsSection>
      )}

      {(type === "announce" || type === "tts") && (
        <SpeechSettings data={data} patch={patch} prompts={ctx.prompts} />
      )}

      {type === "menu" && <MenuSettings data={data} patch={patch} />}

      {type === "get_key" && <GetKeySettings data={data} patch={patch} />}

      {type === "api" && (
        <ApiNodeSettings
          data={data}
          patch={patch}
          prompts={ctx.prompts}
          mohClasses={ctx.mohClasses}
        />
      )}

      {type === "condition" && <ConditionSettings data={data} patch={patch} />}

      {type === "set_var" && (
        <SettingsSection
          step={1}
          title="Variable"
          hint="Use later as $name or {{name}} in TTS, menu, API URL/body, etc."
        >
          <Field label="Name">
            <input
              className="input w-full font-mono"
              value={String(data.name ?? "")}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="agent"
            />
          </Field>
          <Field label="Value">
            <input
              className="input w-full font-mono"
              value={String(data.value ?? "")}
              onChange={(e) => patch({ value: e.target.value })}
              placeholder="$caller or a literal"
            />
          </Field>
        </SettingsSection>
      )}

      {type === "language" && (
        <SettingsSection step={1} title="Language" hint="Applies to announce / menu / TTS after this node.">
          <Field label="Language">
            <SegmentedSelect
              aria-label="Language"
              value={String(data.language ?? "en")}
              options={SPEECH_LANGS.map((l) => ({ value: l.code, label: l.label }))}
              onChange={(v) => patch({ language: v })}
            />
          </Field>
        </SettingsSection>
      )}

      {type === "time_condition" && (
        <SettingsSection
          step={1}
          title="Schedule"
          hint="Pick a schedule from Schedules. The live status chooses the exit."
        >
          <Field label="Schedule">
            <select
              className="input w-full"
              value={String(data.scheduleId ?? "")}
              onChange={(e) => patch({ scheduleId: e.target.value })}
            >
              <option value="">— select schedule —</option>
              {ctx.schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </SettingsSection>
      )}

      {type === "directory" && (
        <>
          <SettingsSection
            step={1}
            title="Dial-by-name"
            hint="Caller types last name on the keypad (2=ABC … 9=WXYZ), then #."
          >
            <Field label="Prompt language">
              <SegmentedSelect
                aria-label="Language"
                value={String(data.language ?? "en")}
                options={SPEECH_LANGS.map((l) => ({ value: l.code, label: l.label }))}
                onChange={(v) => patch({ language: v })}
              />
            </Field>
          </SettingsSection>
          <SettingsSection step={2} title="Input">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First-digit timeout (ms)">
                <input
                  className="input w-full"
                  type="number"
                  min={3000}
                  max={60000}
                  value={Number(data.timeoutMs ?? 10000)}
                  onChange={(e) =>
                    patch({
                      timeoutMs: Math.max(3000, Math.min(60000, Number(e.target.value) || 10000)),
                    })
                  }
                />
              </Field>
              <Field label="Max digits">
                <input
                  className="input w-full"
                  type="number"
                  min={1}
                  max={12}
                  value={Number(data.maxDigits ?? 8)}
                  onChange={(e) =>
                    patch({ maxDigits: Math.max(1, Math.min(12, Number(e.target.value) || 8)) })
                  }
                />
              </Field>
            </div>
          </SettingsSection>
        </>
      )}

      {type === "subflow" && (
        <SettingsSection
          step={1}
          title="Subflow"
          hint="Runs the published version, then continues on return."
        >
          <Field label="Flow">
            <select
              className="input w-full"
              value={String(data.flowId ?? "")}
              onChange={(e) => patch({ flowId: e.target.value })}
            >
              <option value="">— select flow —</option>
              {ctx.flows
                .filter((f) => f.id !== ctx.currentFlowId)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </Field>
        </SettingsSection>
      )}

      {type === "transfer" && (
        <>
          <SettingsSection step={1} title="Destination" hint="Where the call goes.">
            <DestPicker
              destType={String(data.destType ?? "extension")}
              destId={(data.destId as string | null) ?? null}
              onChange={(destType, destId) => patch({ destType, destId })}
            />
          </SettingsSection>
          {String(data.destType ?? "extension") === "extension" && (
            <SettingsSection
              step={2}
              title="Ring"
              hint="If no answer / busy / unavailable, follow those exits on the map."
            >
              <Field label="Ring timeout (seconds)">
                <input
                  className="input w-full"
                  type="number"
                  min={5}
                  max={120}
                  value={Number(data.timeout ?? data.ringSeconds ?? 30)}
                  onChange={(e) =>
                    patch({ timeout: Math.max(5, Math.min(120, Number(e.target.value) || 30)) })
                  }
                />
              </Field>
            </SettingsSection>
          )}
          {String(data.destType ?? "") !== "extension" && (
            <p className="text-xs text-[var(--text-muted)]">
              Non-extension destinations leave the flow immediately (no dial-status exits).
            </p>
          )}
        </>
      )}

      {type === "queue" && (
        <SettingsSection
          step={1}
          title="Queue"
          hint="Overflow (timeout / full) is set on the Queues screen — edges after this node are unused."
        >
          <Field label="Queue">
            <select
              className="input w-full"
              value={String(data.queueNumber ?? data.queueId ?? "")}
              onChange={(e) => {
                const q = ctx.queues.find(
                  (x) => x.number === e.target.value || x.id === e.target.value,
                );
                patch({
                  queueId: q?.id,
                  queueNumber: q?.number ?? e.target.value,
                });
              }}
            >
              <option value="">— select queue —</option>
              {ctx.queues.map((q) => (
                <option key={q.id} value={q.number}>
                  {q.number} — {q.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority (0–99)" hint="Higher jumps ahead. vip=true in flow vars also applies.">
            <input
              className="input w-full"
              type="number"
              min={0}
              max={99}
              value={Number(data.priority ?? 0)}
              onChange={(e) =>
                patch({ priority: Math.max(0, Math.min(99, Number(e.target.value) || 0)) })
              }
            />
          </Field>
        </SettingsSection>
      )}

      {type === "voicemail" && (
        <SettingsSection step={1} title="Mailbox" hint="Ends the flow and opens that mailbox.">
          <Field label="Extension">
            <select
              className="input w-full"
              value={String(data.extension ?? data.extensionId ?? "")}
              onChange={(e) => patch({ extension: e.target.value, extensionId: e.target.value })}
            >
              <option value="">— select extension —</option>
              {ctx.extensions.map((e) => (
                <option key={e.id} value={e.number}>
                  {e.number} — {e.name}
                </option>
              ))}
            </select>
          </Field>
        </SettingsSection>
      )}

      {type === "hangup" && (
        <SettingsSection title="How it works" hint="Place at the end of a path.">
          <p className="text-xs text-[var(--text-muted)]">Ends the call immediately. No exits.</p>
        </SettingsSection>
      )}
    </div>
  );
}

function SpeechSettings({
  data,
  patch,
  prompts,
}: {
  data: FlowNodeData;
  patch: (p: Partial<FlowNodeData>) => void;
  prompts: Prompt[];
}) {
  return (
    <>
      <SettingsSection
        step={1}
        title="What to say"
        hint="Saved prompt plays first if chosen; otherwise the text is spoken."
      >
        <Field label="Text" hint="Use $caller or {{caller}} for variables">
          <textarea
            className="input w-full"
            rows={3}
            value={String(data.text ?? data.prompt ?? "")}
            onChange={(e) => patch({ text: e.target.value })}
            placeholder="Welcome. Your code is $pin."
          />
        </Field>
        <Field label="Or play saved prompt (WAV)">
          <select
            className="input w-full"
            value={String(data.promptId ?? "")}
            onChange={(e) => patch({ promptId: e.target.value || undefined })}
          >
            <option value="">— synthesize text above —</option>
            {prompts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </SettingsSection>
      <SettingsSection step={2} title="Voice">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Language">
            <SegmentedSelect
              aria-label="Language"
              value={String(data.language ?? "en")}
              options={SPEECH_LANGS.map((l) => ({ value: l.code, label: l.label }))}
              onChange={(v) => patch({ language: v })}
            />
          </Field>
          <Field label="Voice" hint="System default = Admin → Settings → IVR TTS">
            <SegmentedSelect
              aria-label="Voice"
              value={String(data.gender ?? data.voice ?? "default")}
              options={voiceOptions(String(data.language ?? "en"))}
              onChange={(v) => patch({ gender: v })}
            />
          </Field>
        </div>
      </SettingsSection>
    </>
  );
}

function MenuSettings({
  data,
  patch,
}: {
  data: FlowNodeData;
  patch: (p: Partial<FlowNodeData>) => void;
}) {
  const digits = menuDigits(data);
  const digitSet = new Set(digits);

  function toggleDigit(d: string) {
    const next = digitSet.has(d) ? digits.filter((x) => x !== d) : [...digits, d].sort(digitSort);
    patch({ digits: next.length ? next : ["1"] });
  }

  return (
    <>
      <SettingsSection step={1} title="Prompt" hint="Spoken before collecting digits.">
        <Field label="Menu text">
          <textarea
            className="input w-full"
            rows={3}
            value={String(data.prompt ?? data.text ?? "")}
            onChange={(e) => patch({ prompt: e.target.value })}
            placeholder="Press 1 for sales, 2 for support."
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Language">
            <SegmentedSelect
              aria-label="Language"
              value={String(data.language ?? "en")}
              options={SPEECH_LANGS.map((l) => ({ value: l.code, label: l.label }))}
              onChange={(v) => patch({ language: v })}
            />
          </Field>
          <Field label="Voice" hint="System default = Admin → Settings → IVR TTS">
            <SegmentedSelect
              aria-label="Voice"
              value={String(data.gender ?? data.voice ?? "default")}
              options={voiceOptions(String(data.language ?? "en"))}
              onChange={(v) => patch({ gender: v })}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        step={2}
        title="Keys on the map"
        hint="Only selected keys appear as exits. Always wire timeout (and optionally invalid)."
      >
        <div className="flex flex-wrap gap-1.5">
          {[...DEFAULT_MENU_DIGITS, "6", "7", "8", "9", "*", "#"].map((d) => (
            <button
              key={d}
              type="button"
              className={`min-w-[2.25rem] rounded-md border px-2 py-1.5 text-sm font-semibold ${
                digitSet.has(d)
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-soft)]"
              }`}
              onClick={() => toggleDigit(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection step={3} title="Collection">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Max digits">
            <input
              className="input w-full"
              type="number"
              min={1}
              max={12}
              value={Number(data.maxDigits ?? 1)}
              onChange={(e) =>
                patch({ maxDigits: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })
              }
            />
          </Field>
          <Field label="Retries">
            <input
              className="input w-full"
              type="number"
              min={0}
              max={5}
              value={Number(data.retries ?? 2)}
              onChange={(e) =>
                patch({ retries: Math.max(0, Math.min(5, Number(e.target.value) || 0)) })
              }
            />
          </Field>
          <Field label="Timeout (ms)">
            <input
              className="input w-full"
              type="number"
              min={1000}
              value={Number(data.timeoutMs ?? 12000)}
              onChange={(e) =>
                patch({ timeoutMs: Math.max(1000, Number(e.target.value) || 12000) })
              }
            />
          </Field>
        </div>
      </SettingsSection>
    </>
  );
}

function digitSort(a: string, b: string): number {
  const order = "1234567890*#";
  return order.indexOf(a) - order.indexOf(b);
}

function GetKeySettings({
  data,
  patch,
}: {
  data: FlowNodeData;
  patch: (p: Partial<FlowNodeData>) => void;
}) {
  const varName = String(data.name ?? data.variable ?? "pin");
  return (
    <>
      <SettingsSection
        step={1}
        title="Store as variable"
        hint={`Digits are saved here. Elsewhere write $${varName || "pin"} (or {{${varName || "pin"}}}) — TTS, API URL/body, conditions.`}
      >
        <Field label="Variable name" hint="Letters, numbers, underscore — e.g. pin, order_id">
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm text-[var(--accent)]">$</span>
            <input
              className="input w-full font-mono"
              value={varName}
              onChange={(e) => patch({ name: e.target.value.replace(/[^\w]/g, "") })}
              placeholder="pin"
            />
          </div>
        </Field>
      </SettingsSection>

      <SettingsSection step={2} title="Prompt" hint="Spoken before collecting keys. Leave empty for beep-only.">
        <Field label="Prompt text">
          <textarea
            className="input w-full"
            rows={2}
            value={String(data.prompt ?? data.text ?? "")}
            onChange={(e) => patch({ prompt: e.target.value })}
            placeholder="Enter your PIN, then press pound."
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Language">
            <SegmentedSelect
              aria-label="Language"
              value={String(data.language ?? "en")}
              options={SPEECH_LANGS.map((l) => ({ value: l.code, label: l.label }))}
              onChange={(v) => patch({ language: v })}
            />
          </Field>
          <Field label="Voice" hint="System default = Admin → Settings → IVR TTS">
            <SegmentedSelect
              aria-label="Voice"
              value={String(data.gender ?? data.voice ?? "default")}
              options={voiceOptions(String(data.language ?? "en"))}
              onChange={(v) => patch({ gender: v })}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        step={3}
        title="Collection"
        hint="Stops at max digits, #, or silence between digits. * clears and restarts."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Max digits">
            <input
              className="input w-full"
              type="number"
              min={1}
              max={24}
              value={Number(data.maxDigits ?? 4)}
              onChange={(e) =>
                patch({ maxDigits: Math.max(1, Math.min(24, Number(e.target.value) || 4)) })
              }
            />
          </Field>
          <Field label="Min digits">
            <input
              className="input w-full"
              type="number"
              min={0}
              max={24}
              value={Number(data.minDigits ?? 1)}
              onChange={(e) =>
                patch({ minDigits: Math.max(0, Math.min(24, Number(e.target.value) || 0)) })
              }
            />
          </Field>
          <Field label="Timeout (ms)">
            <input
              className="input w-full"
              type="number"
              min={1000}
              value={Number(data.timeoutMs ?? 12000)}
              onChange={(e) =>
                patch({ timeoutMs: Math.max(1000, Number(e.target.value) || 12000) })
              }
            />
          </Field>
        </div>
      </SettingsSection>
    </>
  );
}

function ConditionSettings({
  data,
  patch,
}: {
  data: FlowNodeData;
  patch: (p: Partial<FlowNodeData>) => void;
}) {
  const op = String(data.op ?? "=");
  return (
    <SettingsSection
      step={1}
      title="Compare"
      hint="Result chooses the true or false exit."
    >
      <Field
        label="Variable"
        hint={
          op === "area_code" || op === "country_code"
            ? "Leave empty to use caller / DID"
            : "e.g. caller, agent, http_status"
        }
      >
        <input
          className="input w-full font-mono"
          value={String(data.variable ?? "")}
          onChange={(e) => patch({ variable: e.target.value })}
          placeholder="caller"
        />
      </Field>
      <Field label="Operator">
        <select
          className="input w-full"
          value={op}
          onChange={(e) => patch({ op: e.target.value })}
        >
          <option value="=">equals (=)</option>
          <option value="!=">not equal (!=)</option>
          <option value=">">greater (&gt;)</option>
          <option value="<">less (&lt;)</option>
          <option value=">=">greater or equal</option>
          <option value="<=">less or equal</option>
          <option value="contains">contains</option>
          <option value="starts_with">starts with</option>
          <option value="ends_with">ends with</option>
          <option value="empty">is empty</option>
          <option value="regex">matches regex</option>
          <option value="area_code">area code</option>
          <option value="country_code">country code</option>
        </select>
      </Field>
      {op !== "empty" && (
        <Field label="Value">
          <input
            className="input w-full font-mono"
            value={String(data.value ?? "")}
            onChange={(e) => patch({ value: e.target.value })}
            placeholder={
              op === "area_code"
                ? "e.g. 212"
                : op === "country_code"
                  ? "e.g. 90 or TR"
                  : op === "regex"
                    ? "^55"
                    : ""
            }
          />
        </Field>
      )}
    </SettingsSection>
  );
}
