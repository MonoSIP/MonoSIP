import { DestPicker } from "../../../components/DestPicker";
import { SelectInput } from "../../../components/ui";
import { ApiNodeSettings } from "./ApiNodeSettings";
import type { FlowNodeData } from "./FlowNodes";
import {
  DEFAULT_MENU_DIGITS,
  speechLangOptions,
  exitsForNode,
  menuDigits,
  nodeTitle,
  voiceOptions,
} from "./nodeMeta";
import { ExitsHint, Field, SegmentedSelect, SettingsSection } from "./settingsUi";
import { tr } from "../../../i18n";

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
      <SettingsSection title={tr("On the map")}>
        <Field label={tr("Label")} hint={tr("Short name shown on the node")}>
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
        <SettingsSection title={tr("How it works")} hint={tr("No extra options — this is the entry point.")}>
          <p className="text-xs text-[var(--text-muted)]">
            {tr("Variables ready when the call starts:")} <code>caller</code>, <code>did</code>,{" "}
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
          title={tr("Variable")}
          hint={tr("Use later as $name or {{name}} in TTS, menu, API URL/body, etc.")}
        >
          <Field label={tr("Name")}>
            <input
              className="input w-full font-mono"
              value={String(data.name ?? "")}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="agent"
            />
          </Field>
          <Field label={tr("Value")}>
            <input
              className="input w-full font-mono"
              value={String(data.value ?? "")}
              onChange={(e) => patch({ value: e.target.value })}
              placeholder={tr("$caller or a literal")}
            />
          </Field>
        </SettingsSection>
      )}

      {type === "wait" && (
        <SettingsSection
          step={1}
          title={tr("Pause")}
          hint={tr("The caller hears silence (or hold music) for this long, then the flow continues.")}
        >
          <Field label={tr("Seconds (1–600)")}>
            <input
              className="input w-full font-mono"
              type="number"
              min={1}
              max={600}
              value={String(data.seconds ?? 5)}
              onChange={(e) => patch({ seconds: Math.max(1, Math.min(600, Number(e.target.value) || 1)) })}
            />
          </Field>
          <Field label={tr("While waiting")}>
            <SelectInput
              value={String(data.moh ?? "")}
              onValueChange={(next) => patch({ moh: next })}
              options={[
                { value: "", label: tr("Silence") },
                { value: "default", label: tr("Hold music (default)") },
                ...ctx.mohClasses.map((m) => ({ value: m.name, label: `${tr("Hold music")}: ${m.name}` })),
              ]}
            />
          </Field>
        </SettingsSection>
      )}

      {type === "language" && (
        <SettingsSection step={1} title={tr("Language")} hint={tr("Applies to announce / menu / TTS after this node.")}>
          <Field label={tr("Language")}>
            <SegmentedSelect
              aria-label={tr("Language")}
              value={String(data.language ?? "en")}
              options={speechLangOptions()}
              onChange={(v) => patch({ language: v })}
            />
          </Field>
        </SettingsSection>
      )}

      {type === "time_condition" && (
        <SettingsSection
          step={1}
          title={tr("Schedule")}
          hint={tr("Pick a schedule from Schedules. The live status chooses the exit.")}
        >
          <Field label={tr("Schedule")}>
            <SelectInput
              value={String(data.scheduleId ?? "")}
              onValueChange={(next) => patch({ scheduleId: next })}
              options={[
                { value: "", label: tr("— select schedule —") },
                ...ctx.schedules.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </Field>
        </SettingsSection>
      )}

      {type === "directory" && (
        <>
          <SettingsSection
            step={1}
            title={tr("Dial-by-name")}
            hint={tr("Caller types last name on the keypad (2=ABC … 9=WXYZ), then #.")}
          >
            <Field label={tr("Prompt language")}>
              <SegmentedSelect
                aria-label={tr("Language")}
                value={String(data.language ?? "en")}
                options={speechLangOptions()}
                onChange={(v) => patch({ language: v })}
              />
            </Field>
          </SettingsSection>
          <SettingsSection step={2} title={tr("Input")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={tr("First-digit timeout (ms)")}>
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
              <Field label={tr("Max digits")}>
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
          title={tr("Subflow")}
          hint={tr("Runs the published version, then continues on return.")}
        >
          <Field label={tr("Flow")}>
            <SelectInput
              value={String(data.flowId ?? "")}
              onValueChange={(next) => patch({ flowId: next })}
              options={[
                { value: "", label: tr("— select flow —") },
                ...ctx.flows
                  .filter((f) => f.id !== ctx.currentFlowId)
                  .map((f) => ({ value: f.id, label: f.name })),
              ]}
            />
          </Field>
        </SettingsSection>
      )}

      {type === "transfer" && (
        <>
          <SettingsSection step={1} title={tr("Destination")} hint={tr("Where the call goes.")}>
            <DestPicker
              destType={String(data.destType ?? "extension")}
              destId={(data.destId as string | null) ?? null}
              onChange={(destType, destId) => patch({ destType, destId })}
            />
          </SettingsSection>
          {String(data.destType ?? "extension") === "extension" && (
            <SettingsSection
              step={2}
              title={tr("Ring")}
              hint={tr("If no answer / busy / unavailable, follow those exits on the map.")}
            >
              <Field label={tr("Ring timeout (seconds)")}>
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
              {tr("Non-extension destinations leave the flow immediately (no dial-status exits).")}
            </p>
          )}
        </>
      )}

      {type === "queue" && (
        <SettingsSection
          step={1}
          title={tr("Queue")}
          hint={tr("Overflow (timeout / full) is set on the Queues screen — edges after this node are unused.")}
        >
          <Field label={tr("Queue")}>
            <SelectInput
              value={String(data.queueNumber ?? data.queueId ?? "")}
              onValueChange={(next) => {
                const q = ctx.queues.find((x) => x.number === next || x.id === next);
                patch({
                  queueId: q?.id,
                  queueNumber: q?.number ?? next,
                });
              }}
              options={[
                { value: "", label: tr("— select queue —") },
                ...ctx.queues.map((q) => ({ value: q.number, label: `${q.number} — ${q.name}` })),
              ]}
            />
          </Field>
          <Field label={tr("Priority (0–99)")} hint={tr("Higher jumps ahead. vip=true in flow vars also applies.")}>
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
        <SettingsSection step={1} title={tr("Mailbox")} hint={tr("Ends the flow and opens that mailbox.")}>
          <Field label={tr("Extension")}>
            <SelectInput
              value={String(data.extension ?? data.extensionId ?? "")}
              onValueChange={(next) => patch({ extension: next, extensionId: next })}
              options={[
                { value: "", label: tr("— select extension —") },
                ...ctx.extensions.map((e) => ({ value: e.number, label: `${e.number} — ${e.name}` })),
              ]}
            />
          </Field>
        </SettingsSection>
      )}

      {type === "hangup" && (
        <SettingsSection title={tr("How it works")} hint={tr("Place at the end of a path.")}>
          <p className="text-xs text-[var(--text-muted)]">{tr("Ends the call immediately. No exits.")}</p>
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
        title={tr("What to say")}
        hint={tr("Saved prompt plays first if chosen; otherwise the text is spoken.")}
      >
        <Field label={tr("Text")} hint={tr("Use $caller or {{caller}} for variables")}>
          <textarea
            className="input w-full"
            rows={3}
            value={String(data.text ?? data.prompt ?? "")}
            onChange={(e) => patch({ text: e.target.value })}
            placeholder={tr("Welcome. Your code is $pin.")}
          />
        </Field>
        <Field label={tr("Or play saved prompt (WAV)")}>
          <SelectInput
            value={String(data.promptId ?? "")}
            onValueChange={(next) => patch({ promptId: next || undefined })}
            options={[
              { value: "", label: tr("— synthesize text above —") },
              ...prompts.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </Field>
      </SettingsSection>
      <SettingsSection step={2} title={tr("Voice")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr("Language")}>
            <SegmentedSelect
              aria-label={tr("Language")}
              value={String(data.language ?? "en")}
              options={speechLangOptions()}
              onChange={(v) => patch({ language: v })}
            />
          </Field>
          <Field label={tr("Voice")} hint={tr("System default = Admin → Settings → IVR TTS")}>
            <SegmentedSelect
              aria-label={tr("Voice")}
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
      <SettingsSection step={1} title={tr("Prompt")} hint={tr("Spoken before collecting digits.")}>
        <Field label={tr("Menu text")}>
          <textarea
            className="input w-full"
            rows={3}
            value={String(data.prompt ?? data.text ?? "")}
            onChange={(e) => patch({ prompt: e.target.value })}
            placeholder={tr("Press 1 for sales, 2 for support.")}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr("Language")}>
            <SegmentedSelect
              aria-label={tr("Language")}
              value={String(data.language ?? "en")}
              options={speechLangOptions()}
              onChange={(v) => patch({ language: v })}
            />
          </Field>
          <Field label={tr("Voice")} hint={tr("System default = Admin → Settings → IVR TTS")}>
            <SegmentedSelect
              aria-label={tr("Voice")}
              value={String(data.gender ?? data.voice ?? "default")}
              options={voiceOptions(String(data.language ?? "en"))}
              onChange={(v) => patch({ gender: v })}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        step={2}
        title={tr("Keys on the map")}
        hint={tr("Only selected keys appear as exits. Always wire timeout (and optionally invalid).")}
      >
        <div className="flex flex-wrap gap-1.5">
          {[...DEFAULT_MENU_DIGITS, "6", "7", "8", "9", "*", "#"].map((d) => (
            <button
              key={d}
              type="button"
              className={`min-w-[2.25rem] rounded-md border px-2 py-1.5 text-sm font-semibold ${
                digitSet.has(d)
                  ? "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-soft)]"
              }`}
              onClick={() => toggleDigit(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection step={3} title={tr("Collection")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={tr("Max digits")}>
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
          <Field label={tr("Retries")}>
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
          <Field label={tr("Timeout (ms)")}>
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
        title={tr("Store as variable")}
        hint={`Digits are saved here. Elsewhere write $${varName || "pin"} (or {{${varName || "pin"}}}) — TTS, API URL/body, conditions.`}
      >
        <Field label={tr("Variable name")} hint={tr("Letters, numbers, underscore — e.g. pin, order_id")}>
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

      <SettingsSection step={2} title={tr("Prompt")} hint={tr("Spoken before collecting keys. Leave empty for beep-only.")}>
        <Field label={tr("Prompt text")}>
          <textarea
            className="input w-full"
            rows={2}
            value={String(data.prompt ?? data.text ?? "")}
            onChange={(e) => patch({ prompt: e.target.value })}
            placeholder={tr("Enter your PIN, then press pound.")}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr("Language")}>
            <SegmentedSelect
              aria-label={tr("Language")}
              value={String(data.language ?? "en")}
              options={speechLangOptions()}
              onChange={(v) => patch({ language: v })}
            />
          </Field>
          <Field label={tr("Voice")} hint={tr("System default = Admin → Settings → IVR TTS")}>
            <SegmentedSelect
              aria-label={tr("Voice")}
              value={String(data.gender ?? data.voice ?? "default")}
              options={voiceOptions(String(data.language ?? "en"))}
              onChange={(v) => patch({ gender: v })}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        step={3}
        title={tr("Collection")}
        hint={tr("Stops at max digits, #, or silence between digits. * clears and restarts.")}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={tr("Max digits")}>
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
          <Field label={tr("Min digits")}>
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
          <Field label={tr("Timeout (ms)")}>
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
      title={tr("Compare")}
      hint={tr("Result chooses the true or false exit.")}
    >
      <Field
        label={tr("Variable")}
        hint={
          op === "area_code" || op === "country_code"
            ? tr("Leave empty to use caller / DID")
            : tr("e.g. caller, agent, http_status")
        }
      >
        <input
          className="input w-full font-mono"
          value={String(data.variable ?? "")}
          onChange={(e) => patch({ variable: e.target.value })}
          placeholder="caller"
        />
      </Field>
      <Field label={tr("Operator")}>
        <SelectInput
          value={op}
          onValueChange={(next) => patch({ op: next })}
          options={[
            { value: "=", label: tr("equals (=)") },
            { value: "!=", label: tr("not equal (!=)") },
            { value: ">", label: tr("greater (>)") },
            { value: "<", label: tr("less (<)") },
            { value: ">=", label: tr("greater or equal") },
            { value: "<=", label: tr("less or equal") },
            { value: "contains", label: "contains" },
            { value: "starts_with", label: tr("starts with") },
            { value: "ends_with", label: tr("ends with") },
            { value: "empty", label: tr("is empty") },
            { value: "regex", label: tr("matches regex") },
            { value: "area_code", label: tr("area code") },
            { value: "country_code", label: tr("country code") },
          ]}
        />
      </Field>
      {op !== "empty" && (
        <Field label={tr("Value")}>
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
