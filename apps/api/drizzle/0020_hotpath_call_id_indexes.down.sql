-- Rollback for 0020_hotpath_call_id_indexes (manual ops).
DROP INDEX IF EXISTS "call_events_call_id_at_idx";
DROP INDEX IF EXISTS "call_events_call_id_idx";
DROP INDEX IF EXISTS "recordings_call_id_idx";
