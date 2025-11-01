-- Verify 60-day retention for price_snapshots
-- Run this after cleanup to confirm only data from last 60 days remains

-- 1. Overall summary: date range and total rows
SELECT 
  COUNT(*) as total_rows,
  MIN(snapshot_date) as oldest_date,
  MAX(snapshot_date) as newest_date,
  CURRENT_DATE - MIN(snapshot_date) as days_of_data,
  CASE 
    WHEN MIN(snapshot_date) >= CURRENT_DATE - INTERVAL '60 days' THEN '✅ Within 60-day limit'
    ELSE '❌ Data older than 60 days found!'
  END as retention_status
FROM price_snapshots;

-- 2. Check if any data older than 60 days still exists (should be 0)
SELECT 
  COUNT(*) as rows_older_than_60_days,
  MIN(snapshot_date) as oldest_date,
  MAX(snapshot_date) as newest_old_date
FROM price_snapshots
WHERE snapshot_date < CURRENT_DATE - INTERVAL '60 days';

-- 3. Row count by month (last 3 months to see distribution)
SELECT 
  DATE_TRUNC('month', snapshot_date) as month,
  COUNT(*) as rows_in_month,
  COUNT(DISTINCT name_norm) as unique_cards,
  COUNT(DISTINCT snapshot_date) as days_with_data
FROM price_snapshots
WHERE snapshot_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE_TRUNC('month', snapshot_date)
ORDER BY month DESC;

-- 4. Recent snapshot dates (last 10 days)
SELECT 
  snapshot_date,
  COUNT(*) as rows,
  COUNT(DISTINCT name_norm) as unique_cards,
  COUNT(DISTINCT currency) as currencies
FROM price_snapshots
WHERE snapshot_date >= CURRENT_DATE - INTERVAL '10 days'
GROUP BY snapshot_date
ORDER BY snapshot_date DESC;

-- 5. Quick sanity check: rows per currency in last 60 days
SELECT 
  currency,
  COUNT(*) as rows,
  COUNT(DISTINCT name_norm) as unique_cards,
  MIN(snapshot_date) as first_date,
  MAX(snapshot_date) as last_date
FROM price_snapshots
WHERE snapshot_date >= CURRENT_DATE - INTERVAL '60 days'
GROUP BY currency
ORDER BY currency;

