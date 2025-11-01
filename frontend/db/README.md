# Database SQL Scripts

This directory contains SQL scripts for database maintenance, migrations, and fixes.

## Scripts

### `sql/archive_old_price_snapshots.sql`

**Purpose:** Archive price snapshots older than 30 days to reduce database size.

**How it works:** 
1. Exports data older than 30 days to CSV format
2. Uploads to Supabase Storage (requires bucket setup)
3. Deletes old rows from database

**Status:** Ready to use. Requires Supabase Storage bucket to be created first.

**Before running:** Preview what would be deleted:
```sql
SELECT 
  COUNT(*) as rows_to_delete,
  MIN(snapshot_date) as oldest_date,
  MAX(snapshot_date) as newest_date_to_delete
FROM price_snapshots
WHERE snapshot_date < CURRENT_DATE - INTERVAL '30 days';
```

**After running:** Verify cleanup with `verify_archive.sql`.

### `sql/fix_collections_rls_recursion.sql`

**Problem:** Infinite recursion in `collections` RLS policies causing "infinite recursion detected in policy for relation 'collections'" error.

**Root Cause:** Circular dependency between `collections` and `collection_meta` policies:
- `collections` policy queried `collection_meta` 
- `collection_meta` policies queried `collections`
- This created an infinite loop during RLS evaluation

**Solution:** Dropped the problematic "Public collections visible to all" policy on `collections`.

**Status:** Already applied to production database on 2025-01-31.

**How to apply:** Run the SQL in `sql/fix_collections_rls_recursion.sql` using Supabase SQL Editor.

