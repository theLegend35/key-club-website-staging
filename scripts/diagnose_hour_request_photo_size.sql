-- SAFE DIAGNOSTIC ONLY. Does not change any data.
-- Run in the Supabase SQL editor to see how much of Database size is
-- still embedded proof photos in hour_requests / hour_requests_archive.
--
-- Do NOT run VACUUM or UPDATE from this file.

SELECT
  'hour_requests' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE description LIKE '%[PHOTO_DATA:%' OR description LIKE '%data:image/%') AS rows_with_embedded_photo,
  COUNT(*) FILTER (WHERE description LIKE '%[PHOTO_DRIVE:%') AS rows_with_drive_token,
  COUNT(*) FILTER (WHERE description LIKE '%[PHOTO_STORAGE:%') AS rows_with_storage_token,
  pg_size_pretty(pg_total_relation_size('public.hour_requests')) AS table_size
FROM hour_requests

UNION ALL

SELECT
  'hour_requests_archive' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE description LIKE '%[PHOTO_DATA:%' OR description LIKE '%data:image/%') AS rows_with_embedded_photo,
  COUNT(*) FILTER (WHERE description LIKE '%[PHOTO_DRIVE:%') AS rows_with_drive_token,
  COUNT(*) FILTER (WHERE description LIKE '%[PHOTO_STORAGE:%') AS rows_with_storage_token,
  pg_size_pretty(pg_total_relation_size('public.hour_requests_archive')) AS table_size
FROM hour_requests_archive;
