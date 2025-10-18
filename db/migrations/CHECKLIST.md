# ✅ Supabase Security Fix Checklist

Use this checklist to track your progress applying the security fixes.

## Pre-Application

- [ ] Read `APPLY_NOW.md` (2 min read)
- [ ] Backup current database (optional but recommended)
  - Supabase Dashboard → Settings → Database → Download backup
- [ ] Have rollback plan ready (in `fix_rls_security.sql`)

## Application Steps

### Step 1: Apply RLS Migration
- [ ] Open Supabase Dashboard → SQL Editor
- [ ] Create new query
- [ ] Copy contents of `fix_rls_security.sql`
- [ ] Paste and run
- [ ] Verify: "Success. No rows returned"
- [ ] **Time:** ~30 seconds

### Step 2: Apply Function Security Migration
- [ ] Create new query in SQL Editor
- [ ] Copy contents of `fix_function_search_paths.sql`
- [ ] Paste and run
- [ ] Verify: "Success. No rows returned"
- [ ] **Time:** ~30 seconds

### Step 3: Verify Changes Applied
- [ ] Run verification query (from `APPLY_NOW.md`)
- [ ] All checks show "✅ PASS"
- [ ] **Time:** ~30 seconds

## Testing

### As Regular User
- [ ] Sign in to https://manatap.ai
- [ ] Navigate to `/wishlist`
  - [ ] Can view your wishlist
  - [ ] Can add/remove items
  - [ ] No permission errors
- [ ] Navigate to `/collections`
  - [ ] Can view your collections
  - [ ] Can create/edit collections
  - [ ] Can add tags
  - [ ] No permission errors
- [ ] Create a new deck
  - [ ] Deck creation works
  - [ ] No errors
- [ ] Check browser console (F12)
  - [ ] No 403 Forbidden errors
  - [ ] No RLS policy errors

### As Admin User
- [ ] Sign in with admin account
- [ ] Navigate to `/admin`
  - [ ] Can access admin dashboard
  - [ ] Can view error logs
  - [ ] Can view analytics
  - [ ] No permission errors
- [ ] Check admin endpoints work
  - [ ] User management
  - [ ] System logs
  - [ ] Analytics views

### Edge Cases
- [ ] Try accessing another user's wishlist (should fail)
- [ ] Try editing another user's collection (should fail)
- [ ] Public collections are viewable by anyone
- [ ] Private collections only visible to owner

## Manual Dashboard Fixes (Optional)

### Fix: Leaked Password Protection
- [ ] Dashboard → Authentication → Policies
- [ ] Find "Password strength and leaked password protection"
- [ ] Toggle ON
- [ ] Save
- [ ] **Time:** 2 minutes

### Fix: Postgres Version Upgrade
- [ ] Dashboard → Settings → Database
- [ ] Check for "Upgrade available" banner
- [ ] Click "Schedule upgrade"
- [ ] Choose maintenance window
- [ ] Confirm
- [ ] **Time:** 3 minutes (actual upgrade happens during maintenance)

## Verification Queries

### Check RLS Enabled
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
  'admin_audit', 'error_logs', 'eval_runs', 'knowledge_gaps',
  'wishlists', 'wishlist_items', 'tags', 'collection_card_tags', 
  'collection_meta'
);
```
- [ ] All 9 tables show `rowsecurity = true`

### Check Policies Created
```sql
SELECT COUNT(*) as policy_count 
FROM pg_policies 
WHERE schemaname = 'public';
```
- [ ] Count >= 15 policies

### Check Functions Secured
```sql
SELECT proname, proconfig 
FROM pg_proc 
WHERE proname IN (
  'collection_price_buckets', 
  'collection_basic_stats',
  'update_price_cache_updated_at', 
  'touch_profiles_public'
);
```
- [ ] All 4 functions have `proconfig` not null

## Troubleshooting

### If you see permission errors:

1. **Check which table/operation**
   - Look at browser console error message
   - Note the table name and operation (SELECT/INSERT/UPDATE/DELETE)

2. **Verify policy exists**
   ```sql
   SELECT * FROM pg_policies WHERE tablename = '<table_name>';
   ```

3. **Check user authentication**
   ```sql
   SELECT auth.uid(); -- Should return your user ID
   ```

4. **If needed, rollback specific table**
   ```sql
   DROP POLICY "policy_name" ON <table>;
   ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;
   ```

### If functions fail:

1. **Check function exists**
   ```sql
   SELECT proname FROM pg_proc WHERE proname = '<function_name>';
   ```

2. **Test function call**
   ```sql
   SELECT * FROM collection_price_buckets('<collection_id>', 'USD');
   ```

3. **If needed, revert to old version**
   - Copy old function from `frontend/db/sql/` directory
   - Run without `SET search_path = public` line

## Success Criteria

- [x] All 9 tables have RLS enabled
- [x] 15+ policies created and active
- [x] 4 functions have search_path set
- [x] All user flows tested and working
- [x] No permission errors in console
- [x] Admin dashboard accessible
- [x] Public collections still public
- [x] Private data still private

## Sign-Off

- [ ] All migrations applied successfully
- [ ] All tests passed
- [ ] No errors in production
- [ ] Security linter shows improvements

**Date applied:** _______________
**Applied by:** _______________
**Production tested:** _______________

## Notes

_Add any notes about issues encountered or special considerations:_

---

**Total time to complete:** ~10-15 minutes
**Difficulty:** Easy ✅
**Risk:** Very low ✅
**Benefit:** High ✅

---

## Quick Reference

| File | Purpose | Time |
|------|---------|------|
| `APPLY_NOW.md` | Quick start guide | 2 min read |
| `fix_rls_security.sql` | RLS policies | 30 sec run |
| `fix_function_search_paths.sql` | Function security | 30 sec run |
| `README.md` | Full documentation | Reference |
| `SUMMARY.md` | Implementation details | Reference |
| `CHECKLIST.md` | This file | Track progress |



