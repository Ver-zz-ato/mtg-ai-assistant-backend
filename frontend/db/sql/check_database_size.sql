-- Quick check of database size and recent data
SELECT 
  COUNT(*) as total_rows,
  MIN(snapshot_date) as oldest_date,
  MAX(snapshot_date) as newest_date
FROM price_snapshots;

-- Total rows should be around 30 days worth now
-- The database quota should show improvement after hourly refresh

