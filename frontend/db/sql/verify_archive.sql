-- Verify archive cleanup worked
-- Check current data range and size

-- 1. Check date range of remaining data
SELECT 
  COUNT(*) as total_rows,
  MIN(snapshot_date) as oldest_date,
  MAX(snapshot_date) as newest_date,
  MAX(snapshot_date) - MIN(snapshot_date) as days_covered
FROM price_snapshots;

-- 2. Check breakdown by month (to see if old data is gone)
SELECT 
  DATE_TRUNC('month', snapshot_date) as month,
  COUNT(*) as rows_in_month
FROM price_snapshots
GROUP BY DATE_TRUNC('month', snapshot_date)
ORDER BY month DESC;

-- 3. Check MTGJSON vs Scryfall counts
SELECT 
  source,
  COUNT(*) as row_count,
  MIN(snapshot_date) as oldest_date,
  MAX(snapshot_date) as newest_date
FROM price_snapshots
GROUP BY source
ORDER BY source;

-- 4. Sample check - should only have last 30 days
SELECT 
  snapshot_date,
  COUNT(*) as rows
FROM price_snapshots
GROUP BY snapshot_date
ORDER BY snapshot_date DESC
LIMIT 35;

