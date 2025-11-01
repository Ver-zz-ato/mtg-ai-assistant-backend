-- Delete price snapshots older than 60 days
-- This will permanently delete the data, so make sure you have a backup if needed

-- First, check what will be deleted (optional preview)
SELECT 
  COUNT(*) as rows_to_delete,
  MIN(snapshot_date) as oldest_date,
  MAX(snapshot_date) as newest_date_to_delete
FROM price_snapshots
WHERE snapshot_date < CURRENT_DATE - INTERVAL '60 days';

-- Uncomment the line below to actually delete the data:
-- DELETE FROM price_snapshots
-- WHERE snapshot_date < CURRENT_DATE - INTERVAL '60 days';

-- After deletion, verify:
-- SELECT COUNT(*) as remaining_rows_older_than_60_days
-- FROM price_snapshots
-- WHERE snapshot_date < CURRENT_DATE - INTERVAL '60 days';
-- Should return 0

