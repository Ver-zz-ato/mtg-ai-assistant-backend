-- Quick check to see if changelog data exists
-- Run this in Supabase SQL editor to verify the data was inserted

SELECT 
  key,
  value->>'last_updated' as last_updated,
  jsonb_array_length(value->'entries') as entry_count,
  value->'entries'->0->>'version' as latest_version,
  value->'entries'->0->>'title' as latest_title
FROM app_config
WHERE key = 'changelog';

-- If this returns no rows, the data wasn't inserted
-- If it returns rows but entry_count is 0, the entries array is empty
-- If it returns rows with entry_count > 0, the data is there and the API might be the issue
