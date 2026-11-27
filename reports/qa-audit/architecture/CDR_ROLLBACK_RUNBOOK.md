# CDR Rollback Runbook

Order is the **reverse** of apply. Never restore archived rows while `cdr_call_id_uidx` UNIQUE is present.

## If SQL A or B failed mid-transaction

Postgres rolled back automatically. Verify counts unchanged; no archive batch should exist for a failed run.

## If SQL A/B committed but verification failed

1. Drop UNIQUE if already applied:
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
     -f apps/api/drizzle/0019_cdr_call_id_unique.down.sql
   ```
2. Rollback G8 first (if B ran):
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
     -f reports/qa-audit/architecture/cdr-dedupe/02_g8_manual_rollback.sql
   ```
3. Rollback definite:
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
     -f reports/qa-audit/architecture/cdr-dedupe/01_definite_dedupe_rollback.sql
   ```
4. Confirm G1–G7 row sum = 7251 and G8 = 2.
5. Optional: `DELETE FROM cdr_dup_archive WHERE archive_batch IN ('definite-g1-g7','g8-manual');` before re-apply.
6. Nuclear: restore Postgres backup from pre-window snapshot.

## Re-run safety

- Rollback scripts abort if archived ids already live (no double insert).
- Forward scripts no-op if groups already size 1.
- Clearing archive without restoring live rows leaves a soft state — prefer backup restore if confused.

## Migration 0019 only rollback

`0019_cdr_call_id_unique.down.sql` restores non-unique `cdr_call_id_idx`. Does **not** restore deleted CDR rows.
