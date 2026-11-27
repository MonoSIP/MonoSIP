-- Hot-path secondary indexes for recordings / call_events by call_id.
-- Independent of CDR dedupe / UNIQUE(call_id) migration 0019.
-- Non-CONCURRENTLY form for drizzle transactional migrate (small/medium installs).
-- For large production tables, prefer manual:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS ...
CREATE INDEX IF NOT EXISTS "recordings_call_id_idx" ON "recordings" ("call_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_events_call_id_idx" ON "call_events" ("call_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_events_call_id_at_idx" ON "call_events" ("call_id","at" DESC);
