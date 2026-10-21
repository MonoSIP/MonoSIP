import { z } from "zod";
import { DestinationSchema } from "./destinations.js";

export const CallPermissionsSchema = z.object({
  localFixed: z.boolean().default(true),
  mobile: z.boolean().default(true),
  short444: z.boolean().default(true),
  international: z.boolean().default(false),
  recording: z.boolean().default(true),
  outboundBlocked: z.boolean().default(false),
});

export const ExtensionCreateSchema = z.object({
  number: z.string().regex(/^\d{2,6}$/),
  name: z.string().min(1).max(100),
  email: z.string().email().optional().nullable(),
  portalEnabled: z.boolean().default(true),
  portalPassword: z.string().min(8).optional(),
  recordingMode: z.enum(["off", "never", "always", "external", "on_demand"]).default("always"),
  recordingListenAllowed: z.boolean().default(true),
  outboundCli: z.string().optional().nullable(),
  callPermissions: CallPermissionsSchema.optional(),
  mobileForwardAllowed: z.boolean().default(false),
  dnd: z.boolean().default(false),
  /** Extension id of the boss this secretary covers */
  bossSecretaryOf: z.string().uuid().optional().nullable(),
});

export const ExtensionUpdateSchema = ExtensionCreateSchema.partial().omit({
  number: true,
});

/** Matches dialplan conditions in config-writer (always / noanswer / busy / chanunavail). */
export const ForwardingRuleSchema = z.object({
  condition: z.enum(["always", "noanswer", "busy", "chanunavail"]),
  ringSeconds: z.number().int().min(5).max(120).default(20),
  destType: DestinationSchema.shape.destType,
  destId: z.string().nullable(),
});

export const TrunkCreateSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1),
  port: z.number().int().default(5060),
  transport: z.enum(["udp", "tcp", "tls"]).default("udp"),
  authType: z.enum(["userpass", "ip"]).default("userpass"),
  username: z.string().optional().nullable(),
  secret: z.string().optional().nullable(),
  /** SIP From domain / realm (defaults to host when empty). */
  fromDomain: z.string().max(255).optional().nullable(),
  /** Optional outbound proxy host[:port]. */
  outboundProxy: z.string().max(255).optional().nullable(),
  /** REGISTER toward the provider (userpass only). */
  register: z.boolean().default(true),
  codecs: z.array(z.string()).default(["ulaw", "alaw"]),
  maxChannels: z.number().int().min(1).max(100).default(10),
  /** Free-text: account #, DID list, support notes. */
  notes: z.string().max(2000).optional().nullable(),
  enabled: z.boolean().default(true),
});

export const InboundRouteSchema = z.object({
  did: z.string().min(1),
  callerPattern: z.string().optional().nullable(),
  priority: z.number().int().default(100),
  destType: DestinationSchema.shape.destType,
  destId: z.string().nullable(),
});

export const OutboundRouteSchema = z.object({
  name: z.string().min(1),
  pattern: z.string().min(1),
  stripPrefix: z.number().int().min(0).default(0),
  prepend: z.string().default(""),
  trunkIds: z.array(z.string()).min(1),
  requiredPermission: z
    .enum(["localFixed", "mobile", "short444", "international"])
    .default("localFixed"),
  enabled: z.boolean().default(true),
});

export const RingGroupSchema = z.object({
  name: z.string().min(1),
  number: z.string().regex(/^\d{2,6}$/),
  strategy: z.enum(["ringall", "linear"]).default("ringall"),
  ringSeconds: z.number().int().min(5).max(120).default(25),
  memberIds: z.array(z.string()).default([]),
  unansweredDestType: DestinationSchema.shape.destType.optional().nullable(),
  unansweredDestId: z.string().optional().nullable(),
});

export const QueueSchema = z.object({
  name: z.string().min(1),
  number: z.string().regex(/^\d{2,6}$/),
  strategy: z
    .enum([
      "ringall",
      "leastrecent",
      "fewestcalls",
      "rrmemory",
      "linear",
      "random",
    ])
    .default("rrmemory"),
  memberTimeout: z.number().int().default(15),
  wrapup: z.number().int().default(5),
  maxWait: z.number().int().default(300),
  maxCallers: z.number().int().default(20),
  announceHoldtime: z.boolean().default(true),
  announcePosition: z.boolean().default(true),
  mohId: z.string().optional().nullable(),
  scheduleId: z.string().optional().nullable(),
  timeoutDestType: DestinationSchema.shape.destType.optional().nullable(),
  timeoutDestId: z.string().optional().nullable(),
  fullDestType: DestinationSchema.shape.destType.optional().nullable(),
  fullDestId: z.string().optional().nullable(),
  joinemptyDestType: DestinationSchema.shape.destType.optional().nullable(),
  joinemptyDestId: z.string().optional().nullable(),
  callbackEnabled: z.boolean().default(false),
  /** Announcement language; null = system default */
  language: z.enum(["tr", "en"]).optional().nullable(),
  members: z
    .array(
      z.object({
        extensionId: z.string(),
        penalty: z.number().int().default(0),
        paused: z.boolean().default(false),
      }),
    )
    .default([]),
});

export const ScheduleRangeSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  status: z.enum(["open", "lunch"]),
});

export const ScheduleSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().default("Europe/Istanbul"),
  overrideMode: z.enum(["auto", "open", "closed"]).default("auto"),
  overrideUntil: z.string().datetime().optional().nullable(),
  ranges: z.array(ScheduleRangeSchema).default([]),
  openDestType: DestinationSchema.shape.destType.optional().nullable(),
  openDestId: z.string().optional().nullable(),
  lunchDestType: DestinationSchema.shape.destType.optional().nullable(),
  lunchDestId: z.string().optional().nullable(),
  closedDestType: DestinationSchema.shape.destType.optional().nullable(),
  closedDestId: z.string().optional().nullable(),
  holidayDestType: DestinationSchema.shape.destType.optional().nullable(),
  holidayDestId: z.string().optional().nullable(),
});

export const BlacklistSchema = z.object({
  pattern: z.string().min(1),
  direction: z.enum(["inbound", "outbound", "both"]).default("inbound"),
  note: z.string().optional().nullable(),
});

export const WebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(
    z.enum(["call.ringing", "call.answered", "call.ended", "call.missed"]),
  ),
  active: z.boolean().default(true),
});

export const SettingsSchema = z.object({
  companyName: z.string().default("DSip"),
  defaultLocale: z.enum(["en", "tr"]).default("en"),
  recordingRetentionMonths: z.number().int().min(1).max(84).default(12),
  kvkkAnnouncementEnabled: z.boolean().default(true),
  kvkkPromptId: z.string().uuid().optional().nullable(),
  /**
   * Default TTS voice/model for live IVR speech: female | male | ema-lightning | kokoro.
   * Used when a node has no voice or voice is "default", and always when ttsVoiceApplyAll.
   */
  ttsVoice: z.string().max(40).default("female"),
  /** When true, all IVR live TTS uses ttsVoice (ignore per-node voice). */
  ttsVoiceApplyAll: z.boolean().default(true),
  /** How long dynamic IVR TTS WAV cache entries are kept (days). */
  ttsCacheRetentionDays: z.number().int().min(1).max(90).default(7),
  adminIpAllowlist: z.array(z.string()).default([]),
  /** Empty = open (remote softphones). Non-empty = portal login only from these CIDRs. */
  portalIpAllowlist: z.array(z.string()).default([]),
  /** Empty = no Asterisk ACL. Non-empty = only these CIDRs may REGISTER/INVITE (plus trunk hosts). */
  sipIpAllowlist: z.array(z.string()).default([]),
  /** Permanent SIP denylist (deny= lines). */
  sipIpDenylist: z.array(z.string()).default([]),
  securityLoginMaxRetry: z.number().int().min(3).max(50).default(8),
  securityLoginBanMinutes: z.number().int().min(1).max(1440).default(15),
  /** ISO country codes allowed for international outbound (e.g. TR,DE). Use ALL/INTL for unrestricted. */
  allowedCountries: z.array(z.string()).default(["TR"]),
  /** ISO country codes always blocked for international outbound (checked before allowlist). */
  blockedCountries: z.array(z.string()).default([]),
  dailySpendLimitMinutes: z.number().int().default(1000),
  monthlySpendLimitMinutes: z.number().int().default(20000),
  blockAnonymousInbound: z.boolean().default(true),
  maxOutboundPerHour: z.number().int().default(60),
  emailFrom: z.string().optional().nullable(),
  smtpHost: z.string().optional().nullable(),
  smtpPort: z.number().int().optional().nullable(),
  smtpUser: z.string().optional().nullable(),
  smtpPassword: z.string().optional().nullable(),
  smtpTo: z.string().optional().nullable(),
  recordingArchivePath: z.string().optional().nullable(),
  /** sftp://user[:pass]@host[:port]/remote/path — optional remote archive */
  recordingArchiveSftp: z.string().optional().nullable(),
  /** Public FQDN for the panel (e.g. pbx.example.com). Used for softphone URLs + Let's Encrypt. */
  hostname: z.string().max(253).optional().nullable(),
  /** When true, obtain/renew Let's Encrypt certs for `hostname` and install them for nginx. */
  autoSsl: z.boolean().default(false),
  /** Contact email for ACME registration (defaults to admin email). */
  sslEmail: z.string().max(254).optional().nullable(),
  /** Last known SSL status — written by the cert job, not set by the UI directly. */
  sslStatus: z.enum(["none", "pending", "ok", "error"]).optional().nullable(),
  sslExpiresAt: z.string().optional().nullable(),
  sslLastCheckAt: z.string().optional().nullable(),
  sslLastError: z.string().optional().nullable(),
});

export const PortalLoginSchema = z.object({
  extension: z.string().min(2),
  password: z.string().min(1),
});

export const AdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

export type ExtensionCreate = z.infer<typeof ExtensionCreateSchema>;
export type TrunkCreate = z.infer<typeof TrunkCreateSchema>;
export type QueueInput = z.infer<typeof QueueSchema>;
export type ScheduleInput = z.infer<typeof ScheduleSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
