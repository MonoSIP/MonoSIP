-- =============================================================================
-- Rollback for g8-manual batch.
-- DO NOT RUN ON PRODUCTION without explicit written approval.
-- =============================================================================

BEGIN;

DO $$
DECLARE archived int; live int;
BEGIN
  SELECT count(*) INTO archived FROM cdr_dup_archive WHERE archive_batch = 'g8-manual';
  IF archived <> 1 THEN
    RAISE EXCEPTION 'expected 1 g8-manual archive row, found %', archived;
  END IF;
  SELECT count(*) INTO live FROM cdr c
  JOIN cdr_dup_archive a ON a.id = c.id AND a.archive_batch = 'g8-manual';
  IF live > 0 THEN
    RAISE EXCEPTION 'G8 discard already live — abort';
  END IF;
END $$;

INSERT INTO cdr (
  id, call_id, started_at, answered_at, ended_at, direction, caller, callee,
  did, extension_number, queue_number, disposition, duration, billsec,
  wait_sec, trunk_id, recording_id, dnd_flag, jitter, packet_loss, mos
)
SELECT
  id, call_id, started_at, answered_at, ended_at, direction, caller, callee,
  did, extension_number, queue_number, disposition, duration, billsec,
  wait_sec, trunk_id, recording_id, dnd_flag, jitter, packet_loss, mos
FROM cdr_dup_archive
WHERE archive_batch = 'g8-manual';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM cdr WHERE call_id = '1793233454.37';
  IF n <> 2 THEN
    RAISE EXCEPTION 'G8 after restore expected 2 rows, found %', n;
  END IF;
END $$;

COMMIT;
