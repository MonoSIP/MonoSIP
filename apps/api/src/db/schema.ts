import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  varchar,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const admins = pgTable("admins", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  actorType: varchar("actor_type", { length: 20 }).notNull(), // admin | extension
  actorId: uuid("actor_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const extensions = pgTable(
  "extensions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    number: varchar("number", { length: 16 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }),
    sipSecretEnc: text("sip_secret_enc").notNull(),
    portalPasswordHash: text("portal_password_hash"),
    portalEnabled: boolean("portal_enabled").notNull().default(true),
    recordingMode: varchar("recording_mode", { length: 20 }).notNull().default("always"),
    recordingListenAllowed: boolean("recording_listen_allowed").notNull().default(true),
    outboundCli: varchar("outbound_cli", { length: 32 }),
    callPermissions: jsonb("call_permissions").notNull().default({
      localFixed: true,
      mobile: true,
      short444: true,
      international: false,
      recording: true,
      outboundBlocked: false,
    }),
    mobileForwardAllowed: boolean("mobile_forward_allowed").notNull().default(false),
    dnd: boolean("dnd").notNull().default(false),
    voicemailPin: varchar("voicemail_pin", { length: 16 }).default("1234"),
    bossSecretaryOf: uuid("boss_secretary_of"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("extensions_number_idx").on(t.number)],
);

export const extensionForwarding = pgTable("extension_forwarding", {
  id: uuid("id").defaultRandom().primaryKey(),
  extensionId: uuid("extension_id")
    .notNull()
    .references(() => extensions.id, { onDelete: "cascade" }),
  condition: varchar("condition", { length: 20 }).notNull(),
  ringSeconds: integer("ring_seconds").notNull().default(20),
  destType: varchar("dest_type", { length: 32 }).notNull(),
  destId: text("dest_id"),
});

export const devices = pgTable("devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  extensionId: uuid("extension_id")
    .notNull()
    .references(() => extensions.id, { onDelete: "cascade" }),
  model: varchar("model", { length: 64 }),
  mac: varchar("mac", { length: 32 }),
  provisioningProfile: varchar("provisioning_profile", { length: 64 }),
  lastRegisteredAt: timestamp("last_registered_at", { withTimezone: true }),
});

export const ringGroups = pgTable("ring_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  number: varchar("number", { length: 16 }).notNull().unique(),
  strategy: varchar("strategy", { length: 20 }).notNull().default("ringall"),
  ringSeconds: integer("ring_seconds").notNull().default(25),
  unansweredDestType: varchar("unanswered_dest_type", { length: 32 }),
  unansweredDestId: text("unanswered_dest_id"),
});

export const ringGroupMembers = pgTable("ring_group_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  ringGroupId: uuid("ring_group_id")
    .notNull()
    .references(() => ringGroups.id, { onDelete: "cascade" }),
  extensionId: uuid("extension_id")
    .notNull()
    .references(() => extensions.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const queues = pgTable("queues", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  number: varchar("number", { length: 16 }).notNull().unique(),
  strategy: varchar("strategy", { length: 32 }).notNull().default("rrmemory"),
  memberTimeout: integer("member_timeout").notNull().default(15),
  wrapup: integer("wrapup").notNull().default(5),
  maxWait: integer("max_wait").notNull().default(300),
  maxCallers: integer("max_callers").notNull().default(20),
  announceHoldtime: boolean("announce_holdtime").notNull().default(true),
  announcePosition: boolean("announce_position").notNull().default(true),
  mohId: uuid("moh_id"),
  scheduleId: uuid("schedule_id"),
  timeoutDestType: varchar("timeout_dest_type", { length: 32 }),
  timeoutDestId: text("timeout_dest_id"),
  fullDestType: varchar("full_dest_type", { length: 32 }),
  fullDestId: text("full_dest_id"),
  joinemptyDestType: varchar("joinempty_dest_type", { length: 32 }),
  joinemptyDestId: text("joinempty_dest_id"),
  callbackEnabled: boolean("callback_enabled").notNull().default(false),
  /** Announcement language (tr/en); null = system default */
  language: varchar("language", { length: 8 }),
  /** Announcement voice/model (female | male | ema-lightning); null = default voice */
  voice: varchar("voice", { length: 40 }),
});

export const queueMembers = pgTable("queue_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  queueId: uuid("queue_id")
    .notNull()
    .references(() => queues.id, { onDelete: "cascade" }),
  extensionId: uuid("extension_id")
    .notNull()
    .references(() => extensions.id, { onDelete: "cascade" }),
  penalty: integer("penalty").notNull().default(0),
  paused: boolean("paused").notNull().default(false),
  pauseReason: varchar("pause_reason", { length: 100 }),
});

export const schedules = pgTable("schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Europe/Istanbul"),
  overrideMode: varchar("override_mode", { length: 16 }).notNull().default("auto"),
  overrideUntil: timestamp("override_until", { withTimezone: true }),
  openDestType: varchar("open_dest_type", { length: 32 }),
  openDestId: text("open_dest_id"),
  lunchDestType: varchar("lunch_dest_type", { length: 32 }),
  lunchDestId: text("lunch_dest_id"),
  closedDestType: varchar("closed_dest_type", { length: 32 }),
  closedDestId: text("closed_dest_id"),
  holidayDestType: varchar("holiday_dest_type", { length: 32 }),
  holidayDestId: text("holiday_dest_id"),
});

export const scheduleRanges = pgTable("schedule_ranges", {
  id: uuid("id").defaultRandom().primaryKey(),
  scheduleId: uuid("schedule_id")
    .notNull()
    .references(() => schedules.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("open"),
});

export const holidays = pgTable("holidays", {
  id: uuid("id").defaultRandom().primaryKey(),
  scheduleId: uuid("schedule_id").references(() => schedules.id, {
    onDelete: "cascade",
  }),
  date: varchar("date", { length: 10 }).notNull(),
  halfDay: boolean("half_day").notNull().default(false),
  name: varchar("name", { length: 100 }).notNull(),
});

export const trunks = pgTable("trunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  port: integer("port").notNull().default(5060),
  transport: varchar("transport", { length: 8 }).notNull().default("udp"),
  authType: varchar("auth_type", { length: 16 }).notNull().default("userpass"),
  username: varchar("username", { length: 128 }),
  secretEnc: text("secret_enc"),
  /** Number the operator presents on outbound calls. Registration still uses username. */
  callerId: varchar("caller_id", { length: 32 }),
  fromDomain: varchar("from_domain", { length: 255 }),
  outboundProxy: varchar("outbound_proxy", { length: 255 }),
  register: boolean("register").notNull().default(true),
  codecs: jsonb("codecs").notNull().default(["ulaw", "alaw"]),
  maxChannels: integer("max_channels").notNull().default(10),
  notes: text("notes"),
  enabled: boolean("enabled").notNull().default(true),
  status: varchar("status", { length: 32 }).notNull().default("unknown"),
  latencyMs: integer("latency_ms"),
});

export const inboundRoutes = pgTable("inbound_routes", {
  id: uuid("id").defaultRandom().primaryKey(),
  did: varchar("did", { length: 32 }).notNull(),
  callerPattern: varchar("caller_pattern", { length: 64 }),
  priority: integer("priority").notNull().default(100),
  destType: varchar("dest_type", { length: 32 }).notNull(),
  destId: text("dest_id"),
});

export const outboundRoutes = pgTable("outbound_routes", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  pattern: varchar("pattern", { length: 64 }).notNull(),
  stripPrefix: integer("strip_prefix").notNull().default(0),
  prepend: varchar("prepend", { length: 32 }).notNull().default(""),
  trunkIds: jsonb("trunk_ids").notNull().default([]),
  requiredPermission: varchar("required_permission", { length: 32 })
    .notNull()
    .default("localFixed"),
  enabled: boolean("enabled").notNull().default(true),
});

export const blacklist = pgTable("blacklist", {
  id: uuid("id").defaultRandom().primaryKey(),
  pattern: varchar("pattern", { length: 64 }).notNull(),
  direction: varchar("direction", { length: 16 }).notNull().default("inbound"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Panel-visible IP bans (login flood, fail2ban webhook, manual). */
export const ipBans = pgTable(
  "ip_bans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ip: varchar("ip", { length: 64 }).notNull(),
    source: varchar("source", { length: 16 }).notNull().default("manual"),
    reason: text("reason"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [index("ip_bans_ip_idx").on(t.ip), index("ip_bans_active_idx").on(t.active)],
);

export const flows = pgTable("flows", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  /** Softphone / dialplan test number, e.g. 900 */
  extensionNumber: varchar("extension_number", { length: 16 }),
  draftJson: jsonb("draft_json").notNull(),
  publishedVersionId: uuid("published_version_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const flowVersions = pgTable("flow_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  flowId: uuid("flow_id")
    .notNull()
    .references(() => flows.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  json: jsonb("json").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
});

export const secrets = pgTable("secrets", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  valueEnc: text("value_enc").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const prompts = pgTable("prompts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  language: varchar("language", { length: 8 }).notNull().default("en"),
  filePath: text("file_path"),
  ttsText: text("tts_text"),
  /** TTS voice/model: female | male (Edge) | ema-lightning (TR). */
  voice: varchar("voice", { length: 40 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Content-addressed live IVR TTS cache (dynamic announce/menu text). */
export const ttsCache = pgTable("tts_cache", {
  id: uuid("id").defaultRandom().primaryKey(),
  cacheKey: varchar("cache_key", { length: 40 }).notNull().unique(),
  text: text("text").notNull(),
  language: varchar("language", { length: 8 }).notNull().default("en"),
  voice: varchar("voice", { length: 40 }).notNull().default("female"),
  lengthScale: varchar("length_scale", { length: 16 }).notNull().default("1.05"),
  filePath: text("file_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const mohClasses = pgTable("moh_classes", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  files: jsonb("files").notNull().default([]),
});

export const cdr = pgTable(
  "cdr",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    callId: varchar("call_id", { length: 64 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    direction: varchar("direction", { length: 16 }).notNull(),
    caller: varchar("caller", { length: 64 }),
    callee: varchar("callee", { length: 64 }),
    did: varchar("did", { length: 32 }),
    extensionNumber: varchar("extension_number", { length: 16 }),
    queueNumber: varchar("queue_number", { length: 16 }),
    disposition: varchar("disposition", { length: 32 }),
    duration: integer("duration").default(0),
    billsec: integer("billsec").default(0),
    /** Seconds the caller waited before an agent/extension answered (queue hold or ring time). */
    waitSec: integer("wait_sec"),
    trunkId: uuid("trunk_id"),
    recordingId: uuid("recording_id"),
    dndFlag: boolean("dnd_flag").notNull().default(false),
    jitter: real("jitter"),
    packetLoss: real("packet_loss"),
    mos: real("mos"),
  },
  (t) => [
    index("cdr_started_idx").on(t.startedAt),
    index("cdr_call_id_idx").on(t.callId),
  ],
);

export const callEvents = pgTable("call_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  callId: varchar("call_id", { length: 64 }).notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  type: varchar("type", { length: 64 }).notNull(),
  data: jsonb("data").notNull().default({}),
});

export const queueEvents = pgTable("queue_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  queue: varchar("queue", { length: 64 }).notNull(),
  event: varchar("event", { length: 64 }).notNull(),
  agent: varchar("agent", { length: 64 }),
  callId: varchar("call_id", { length: 64 }),
  data: jsonb("data").notNull().default({}),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const recordings = pgTable("recordings", {
  id: uuid("id").defaultRandom().primaryKey(),
  callId: varchar("call_id", { length: 64 }).notNull(),
  filePath: text("file_path").notNull(),
  duration: integer("duration").default(0),
  sizeBytes: integer("size_bytes").default(0),
  deleteAt: timestamp("delete_at", { withTimezone: true }),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recordingAccessLog = pgTable("recording_access_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  recordingId: uuid("recording_id")
    .notNull()
    .references(() => recordings.id, { onDelete: "cascade" }),
  actorType: varchar("actor_type", { length: 20 }).notNull(),
  actorId: uuid("actor_id").notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});

export const missedCalls = pgTable("missed_calls", {
  id: uuid("id").defaultRandom().primaryKey(),
  number: varchar("number", { length: 64 }).notNull(),
  target: varchar("target", { length: 64 }),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  callbackCallId: varchar("callback_call_id", { length: 64 }),
  // Menu badge counts pending rows until the extension opens Missed.
  seen: boolean("seen").notNull().default(false),
});

export const voicemails = pgTable("voicemails", {
  id: uuid("id").defaultRandom().primaryKey(),
  extensionId: uuid("extension_id")
    .notNull()
    .references(() => extensions.id, { onDelete: "cascade" }),
  caller: varchar("caller", { length: 64 }),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  filePath: text("file_path").notNull(),
  read: boolean("read").notNull().default(false),
});

export const spendLimits = pgTable("spend_limits", {
  id: uuid("id").defaultRandom().primaryKey(),
  scope: varchar("scope", { length: 20 }).notNull(),
  scopeId: uuid("scope_id"),
  dailyLimitMinutes: integer("daily_limit_minutes").notNull().default(1000),
  monthlyLimitMinutes: integer("monthly_limit_minutes").notNull().default(20000),
  dailyUsed: integer("daily_used").notNull().default(0),
  monthlyUsed: integer("monthly_used").notNull().default(0),
});

export const webhooks = pgTable("webhooks", {
  id: uuid("id").defaultRandom().primaryKey(),
  url: text("url").notNull(),
  events: jsonb("events").notNull().default([]),
  secret: text("secret").notNull(),
  active: boolean("active").notNull().default(true),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
  permissions: jsonb("permissions").notNull().default(["cdr", "originate"]),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorType: varchar("actor_type", { length: 20 }).notNull(),
  actorId: uuid("actor_id"),
  action: varchar("action", { length: 64 }).notNull(),
  objectType: varchar("object_type", { length: 64 }),
  objectId: text("object_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: varchar("ip", { length: 64 }),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").notNull().default({}),
});

export const lastDialAttempts = pgTable("last_dial_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  extensionNumber: varchar("extension_number", { length: 16 }).notNull(),
  number: varchar("number", { length: 64 }).notNull(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});

/** Website “Call us” widgets (WebRTC guest + optional call-back). */
export const webWidgets = pgTable(
  "web_widgets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicKey: varchar("public_key", { length: 32 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    /** Virtual DID shown in CDR / dialled by the guest softphone. */
    number: varchar("number", { length: 20 }).notNull(),
    destType: varchar("dest_type", { length: 32 }).notNull(),
    destId: text("dest_id"),
    allowedOrigins: jsonb("allowed_origins").notNull().default([]),
    maxConcurrent: integer("max_concurrent").notNull().default(5),
    maxCallSeconds: integer("max_call_seconds").notNull().default(600),
    dailyLimit: integer("daily_limit").notNull().default(100),
    requestsPerIpHour: integer("requests_per_ip_hour").notNull().default(30),
    buttonText: varchar("button_text", { length: 64 }).notNull().default("Call us"),
    buttonColor: varchar("button_color", { length: 16 }).notNull().default("#0f766e"),
    position: varchar("position", { length: 24 }).notNull().default("bottom-right"),
    locale: varchar("locale", { length: 8 }).notNull().default("en"),
    askName: boolean("ask_name").notNull().default(false),
    browserCallEnabled: boolean("browser_call_enabled").notNull().default(true),
    callbackEnabled: boolean("callback_enabled").notNull().default(false),
    /** Digit prefixes allowed for call-back (e.g. ["05","90"]). */
    callbackPrefixes: jsonb("callback_prefixes").notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("web_widgets_public_key_idx").on(t.publicKey),
    uniqueIndex("web_widgets_number_idx").on(t.number),
  ],
);

export const widgetSessions = pgTable(
  "widget_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    widgetId: uuid("widget_id")
      .notNull()
      .references(() => webWidgets.id, { onDelete: "cascade" }),
    sipUser: varchar("sip_user", { length: 32 }).notNull(),
    sipPassEnc: text("sip_pass_enc").notNull(),
    callerName: varchar("caller_name", { length: 100 }),
    origin: varchar("origin", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("widget_sessions_sip_user_idx").on(t.sipUser)],
);

export const widgetDailyStats = pgTable(
  "widget_daily_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    widgetId: uuid("widget_id")
      .notNull()
      .references(() => webWidgets.id, { onDelete: "cascade" }),
    day: varchar("day", { length: 10 }).notNull(),
    calls: integer("calls").notNull().default(0),
    callbacks: integer("callbacks").notNull().default(0),
  },
  (t) => [uniqueIndex("widget_daily_stats_day_idx").on(t.widgetId, t.day)],
);
