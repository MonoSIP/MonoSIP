-- =============================================================================
-- Rollback for definite-g1-g7 batch. Restores archived losers into cdr.
-- Safe only if keepers still present and archived ids are absent from cdr.
-- DO NOT RUN ON PRODUCTION without explicit written approval.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  archived int;
  already_live int;
BEGIN
  SELECT count(*) INTO archived
  FROM cdr_dup_archive WHERE archive_batch = 'definite-g1-g7';
  IF archived <> 7244 THEN
    RAISE EXCEPTION 'expected 7244 archived rows for definite-g1-g7, found %', archived;
  END IF;

  SELECT count(*) INTO already_live
  FROM cdr c
  JOIN cdr_dup_archive a ON a.id = c.id AND a.archive_batch = 'definite-g1-g7';
  IF already_live > 0 THEN
    RAISE EXCEPTION '% archived ids already live in cdr — abort', already_live;
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
WHERE archive_batch = 'definite-g1-g7';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM cdr
  WHERE call_id IN (
      '1793211608.40','1793217547.7','1793211593.39','1793211552.38',
      '1793211511.36','1793215834.0','1793215885.1'
    );
  IF n <> 7251 THEN
    RAISE EXCEPTION 'after restore expected 7251 rows across G1–G7, found %', n;
  END IF;
END $$;

-- Optionally clear this batch from archive after successful restore:
-- DELETE FROM cdr_dup_archive WHERE archive_batch = 'definite-g1-g7';

COMMIT;
