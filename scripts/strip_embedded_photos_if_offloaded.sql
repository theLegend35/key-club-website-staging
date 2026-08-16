-- OPTIONAL CLEANUP. This is NOT run by the website.
--
-- Only strips embedded PHOTO_DATA blobs from rows that ALREADY have a
-- PHOTO_DRIVE or PHOTO_STORAGE token. Rows with photo data and no offload
-- token are left untouched so proofs are not deleted.
--
-- 1. Run scripts/diagnose_hour_request_photo_size.sql first.
-- 2. Review the counts.
-- 3. If you still want to reclaim disk, run the UPDATE statements below.
-- 4. Then run VACUUM FULL only during a maintenance window. VACUUM FULL
--    locks the table.
--
-- Do not run this until new submissions are storing Drive/Storage tokens.

BEGIN;

UPDATE hour_requests
SET description = regexp_replace(
  description,
  '\[PHOTO_DATA:.*?\]',
  '',
  'g'
)
WHERE description LIKE '%[PHOTO_DATA:%'
  AND (
    description LIKE '%[PHOTO_DRIVE:%'
    OR description LIKE '%[PHOTO_STORAGE:%'
  );

UPDATE hour_requests_archive
SET description = regexp_replace(
  description,
  '\[PHOTO_DATA:.*?\]',
  '',
  'g'
)
WHERE description LIKE '%[PHOTO_DATA:%'
  AND (
    description LIKE '%[PHOTO_DRIVE:%'
    OR description LIKE '%[PHOTO_STORAGE:%'
  );

-- Review the row counts, then COMMIT; or ROLLBACK; if anything looks wrong.
-- COMMIT;

-- After COMMIT, reclaim disk (locks tables — do this off-hours):
-- VACUUM FULL public.hour_requests;
-- VACUUM FULL public.hour_requests_archive;
