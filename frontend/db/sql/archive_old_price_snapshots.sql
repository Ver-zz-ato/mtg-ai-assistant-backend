-- Archive old price snapshots (older than 60 days) to Supabase Storage
-- This reduces database size while preserving historical data

-- Step 1: Create a function to export old snapshots to CSV
CREATE OR REPLACE FUNCTION archive_price_snapshots_to_csv()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  archive_start_date date;
  row_count bigint;
  csv_data text;
BEGIN
  -- Calculate cutoff date (60 days ago)
  archive_start_date := CURRENT_DATE - INTERVAL '60 days';
  
  -- Check how many rows will be archived
  SELECT COUNT(*) INTO row_count
  FROM price_snapshots
  WHERE snapshot_date < archive_start_date;
  
  IF row_count = 0 THEN
    RETURN 'No data to archive';
  END IF;
  
  -- Export to CSV format
  SELECT string_agg(
    format('%s,%s,%s,%s,%s,%s',
      snapshot_date,
      name_norm,
      currency,
      unit,
      source,
      created_at
    ),
    E'\n'
  )
  INTO csv_data
  FROM (
    SELECT 
      snapshot_date,
      name_norm,
      currency,
      unit,
      source,
      created_at
    FROM price_snapshots
    WHERE snapshot_date < archive_start_date
    ORDER BY snapshot_date, name_norm, currency
  ) sub;
  
  -- Return summary
  RETURN format('Archived %s rows from before %s', row_count, archive_start_date);
END;
$$;

-- Step 2: Create a function to backup and delete old snapshots
CREATE OR REPLACE FUNCTION archive_and_delete_old_snapshots()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  archive_start_date date;
  row_count bigint;
  archive_filename text;
  csv_data text;
  result jsonb;
BEGIN
  archive_start_date := CURRENT_DATE - INTERVAL '60 days';
  archive_filename := 'price_snapshots_' || archive_start_date || '.csv';
  
  -- Get row count
  SELECT COUNT(*) INTO row_count
  FROM price_snapshots
  WHERE snapshot_date < archive_start_date;
  
  -- Export to CSV
  SELECT string_agg(
    format('%s,%s,%s,%s,%s,%s',
      snapshot_date,
      name_norm,
      currency,
      unit,
      source,
      created_at
    ),
    E'\n'
  )
  INTO csv_data
  FROM (
    SELECT 
      snapshot_date,
      name_norm,
      currency,
      unit,
      source,
      created_at
    FROM price_snapshots
    WHERE snapshot_date < archive_start_date
    ORDER BY snapshot_date, name_norm, currency
  ) sub;
  
  -- TODO: Upload csv_data to Supabase Storage bucket 'archives'
  -- This requires a storage bucket to be created first
  
  -- Delete old snapshots after archiving
  DELETE FROM price_snapshots
  WHERE snapshot_date < archive_start_date;
  
  -- Return summary
  result := jsonb_build_object(
    'rows_archived', row_count,
    'archive_filename', archive_filename,
    'archive_date', archive_start_date
  );
  
  RETURN result;
END;
$$;

-- Step 3: Manual command to run when ready
-- SELECT archive_and_delete_old_snapshots();

-- For now, just preview what would be deleted:
-- SELECT 
--   COUNT(*) as rows_to_delete,
--   MIN(snapshot_date) as oldest_date,
--   MAX(snapshot_date) as newest_date_to_delete
-- FROM price_snapshots
-- WHERE snapshot_date < CURRENT_DATE - INTERVAL '60 days';

