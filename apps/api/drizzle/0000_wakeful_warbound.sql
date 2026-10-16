CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" varchar(12) NOT NULL,
	"permissions" jsonb DEFAULT '["cdr","originate"]'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" varchar(20) NOT NULL,
	"actor_id" uuid,
	"action" varchar(64) NOT NULL,
	"object_type" varchar(64),
	"object_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" varchar(64),
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blacklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern" varchar(64) NOT NULL,
	"direction" varchar(16) DEFAULT 'inbound' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" varchar(64) NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" varchar(64) NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdr" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" varchar(64) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"direction" varchar(16) NOT NULL,
	"caller" varchar(64),
	"callee" varchar(64),
	"did" varchar(32),
	"extension_number" varchar(16),
	"queue_number" varchar(16),
	"disposition" varchar(32),
	"duration" integer DEFAULT 0,
	"billsec" integer DEFAULT 0,
	"trunk_id" uuid,
	"recording_id" uuid,
	"dnd_flag" boolean DEFAULT false NOT NULL,
	"jitter" real,
	"packet_loss" real,
	"mos" real
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extension_id" uuid NOT NULL,
	"model" varchar(64),
	"mac" varchar(32),
	"provisioning_profile" varchar(64),
	"last_registered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "extension_forwarding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extension_id" uuid NOT NULL,
	"condition" varchar(20) NOT NULL,
	"ring_seconds" integer DEFAULT 20 NOT NULL,
	"dest_type" varchar(32) NOT NULL,
	"dest_id" text
);
--> statement-breakpoint
CREATE TABLE "extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(16) NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(255),
	"sip_secret_enc" text NOT NULL,
	"portal_password_hash" text,
	"portal_enabled" boolean DEFAULT true NOT NULL,
	"recording_mode" varchar(20) DEFAULT 'always' NOT NULL,
	"recording_listen_allowed" boolean DEFAULT true NOT NULL,
	"outbound_cli" varchar(32),
	"call_permissions" jsonb DEFAULT '{"localFixed":true,"mobile":true,"short444":true,"international":false,"recording":true,"outboundBlocked":false}'::jsonb NOT NULL,
	"mobile_forward_allowed" boolean DEFAULT false NOT NULL,
	"dnd" boolean DEFAULT false NOT NULL,
	"voicemail_pin" varchar(16) DEFAULT '1234',
	"boss_secretary_of" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flow_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"json" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"draft_json" jsonb NOT NULL,
	"published_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid,
	"date" varchar(10) NOT NULL,
	"half_day" boolean DEFAULT false NOT NULL,
	"name" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"did" varchar(32) NOT NULL,
	"caller_pattern" varchar(64),
	"priority" integer DEFAULT 100 NOT NULL,
	"dest_type" varchar(32) NOT NULL,
	"dest_id" text
);
--> statement-breakpoint
CREATE TABLE "last_dial_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extension_number" varchar(16) NOT NULL,
	"number" varchar(64) NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missed_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(64) NOT NULL,
	"target" varchar(64),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"callback_call_id" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "moh_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"pattern" varchar(64) NOT NULL,
	"strip_prefix" integer DEFAULT 0 NOT NULL,
	"prepend" varchar(32) DEFAULT '' NOT NULL,
	"trunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_permission" varchar(32) DEFAULT 'localFixed' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"language" varchar(8) DEFAULT 'en' NOT NULL,
	"file_path" text,
	"tts_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue" varchar(64) NOT NULL,
	"event" varchar(64) NOT NULL,
	"agent" varchar(64),
	"call_id" varchar(64),
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_id" uuid NOT NULL,
	"extension_id" uuid NOT NULL,
	"penalty" integer DEFAULT 0 NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"pause_reason" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "queues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"number" varchar(16) NOT NULL,
	"strategy" varchar(32) DEFAULT 'rrmemory' NOT NULL,
	"member_timeout" integer DEFAULT 15 NOT NULL,
	"wrapup" integer DEFAULT 5 NOT NULL,
	"max_wait" integer DEFAULT 300 NOT NULL,
	"max_callers" integer DEFAULT 20 NOT NULL,
	"announce_holdtime" boolean DEFAULT true NOT NULL,
	"announce_position" boolean DEFAULT true NOT NULL,
	"moh_id" uuid,
	"schedule_id" uuid,
	"timeout_dest_type" varchar(32),
	"timeout_dest_id" text,
	"full_dest_type" varchar(32),
	"full_dest_id" text,
	"joinempty_dest_type" varchar(32),
	"joinempty_dest_id" text,
	"callback_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "queues_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "recording_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recording_id" uuid NOT NULL,
	"actor_type" varchar(20) NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" varchar(20) NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" varchar(64) NOT NULL,
	"file_path" text NOT NULL,
	"duration" integer DEFAULT 0,
	"size_bytes" integer DEFAULT 0,
	"delete_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ring_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ring_group_id" uuid NOT NULL,
	"extension_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ring_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"number" varchar(16) NOT NULL,
	"strategy" varchar(20) DEFAULT 'ringall' NOT NULL,
	"ring_seconds" integer DEFAULT 25 NOT NULL,
	"unanswered_dest_type" varchar(32),
	"unanswered_dest_id" text,
	CONSTRAINT "ring_groups_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "schedule_ranges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"timezone" varchar(64) DEFAULT 'Europe/Istanbul' NOT NULL,
	"override_mode" varchar(16) DEFAULT 'auto' NOT NULL,
	"override_until" timestamp with time zone,
	"open_dest_type" varchar(32),
	"open_dest_id" text,
	"lunch_dest_type" varchar(32),
	"lunch_dest_id" text,
	"closed_dest_type" varchar(32),
	"closed_dest_id" text,
	"holiday_dest_type" varchar(32),
	"holiday_dest_id" text
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"value_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(128) NOT NULL,
	"actor_type" varchar(20) NOT NULL,
	"actor_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spend_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(20) NOT NULL,
	"scope_id" uuid,
	"daily_limit_minutes" integer DEFAULT 1000 NOT NULL,
	"monthly_limit_minutes" integer DEFAULT 20000 NOT NULL,
	"daily_used" integer DEFAULT 0 NOT NULL,
	"monthly_used" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"host" varchar(255) NOT NULL,
	"port" integer DEFAULT 5060 NOT NULL,
	"transport" varchar(8) DEFAULT 'udp' NOT NULL,
	"auth_type" varchar(16) DEFAULT 'userpass' NOT NULL,
	"username" varchar(128),
	"secret_enc" text,
	"codecs" jsonb DEFAULT '["ulaw","alaw","opus"]'::jsonb NOT NULL,
	"max_channels" integer DEFAULT 10 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" varchar(32) DEFAULT 'unknown' NOT NULL,
	"latency_ms" integer
);
--> statement-breakpoint
CREATE TABLE "voicemails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extension_id" uuid NOT NULL,
	"caller" varchar(64),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_path" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secret" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_extension_id_extensions_id_fk" FOREIGN KEY ("extension_id") REFERENCES "public"."extensions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extension_forwarding" ADD CONSTRAINT "extension_forwarding_extension_id_extensions_id_fk" FOREIGN KEY ("extension_id") REFERENCES "public"."extensions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_versions" ADD CONSTRAINT "flow_versions_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_members" ADD CONSTRAINT "queue_members_queue_id_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."queues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_members" ADD CONSTRAINT "queue_members_extension_id_extensions_id_fk" FOREIGN KEY ("extension_id") REFERENCES "public"."extensions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_access_log" ADD CONSTRAINT "recording_access_log_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ring_group_members" ADD CONSTRAINT "ring_group_members_ring_group_id_ring_groups_id_fk" FOREIGN KEY ("ring_group_id") REFERENCES "public"."ring_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ring_group_members" ADD CONSTRAINT "ring_group_members_extension_id_extensions_id_fk" FOREIGN KEY ("extension_id") REFERENCES "public"."extensions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_ranges" ADD CONSTRAINT "schedule_ranges_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voicemails" ADD CONSTRAINT "voicemails_extension_id_extensions_id_fk" FOREIGN KEY ("extension_id") REFERENCES "public"."extensions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cdr_started_idx" ON "cdr" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "cdr_call_id_idx" ON "cdr" USING btree ("call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "extensions_number_idx" ON "extensions" USING btree ("number");