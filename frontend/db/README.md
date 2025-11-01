# Database SQL Scripts

This directory contains SQL scripts for database maintenance, migrations, and fixes.

## Scripts

### `sql/fix_collections_rls_recursion.sql`

**Problem:** Infinite recursion in `collections` RLS policies causing "infinite recursion detected in policy for relation 'collections'" error.

**Root Cause:** Circular dependency between `collections` and `collection_meta` policies:
- `collections` policy queried `collection_meta` 
- `collection_meta` policies queried `collections`
- This created an infinite loop during RLS evaluation

**Solution:** Dropped the problematic "Public collections visible to all" policy on `collections`.

**Status:** Already applied to production database on 2025-01-31.

**How to apply:** Run the SQL in `sql/fix_collections_rls_recursion.sql` using Supabase SQL Editor.

