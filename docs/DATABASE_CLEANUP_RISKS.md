# Database Cleanup Functions - Risk Assessment

## 🟢 SAFE (Read-Only or No Data Loss)

### ✅ **Analyze Database Sizes** (`/api/admin/data/table-sizes`)
- **Risk Level**: ZERO
- **What it does**: Reads database statistics only
- **Data Loss**: None
- **Reversible**: N/A
- **Safety**: Completely safe, no changes made

### ✅ **VACUUM ANALYZE** (`/api/admin/data/vacuum-analyze`)
- **Risk Level**: VERY LOW
- **What it does**: Database maintenance (optimizes indexes, reclaims space)
- **Data Loss**: None
- **Reversible**: N/A (just maintenance, no data changes)
- **Safety**: Standard PostgreSQL maintenance operation
- **Note**: Currently requires manual SQL execution (endpoint provides instructions)

---

## 🟡 MODERATE RISK (Data Loss, but Non-Critical)

### ⚠️ **Price Snapshots Cleanup** (`/api/admin/data/cleanup-snapshots`)
- **Risk Level**: MODERATE
- **What it does**: Deletes price snapshot data older than 60 days
- **Data Loss**: Historical price data older than retention period
- **Reversible**: ✅ YES (if you have backups)
  - Supabase backups: 7 days (free) or 30 days (pro)
  - GitHub Actions backups: Daily backups kept
- **Impact if Lost**:
  - ❌ Historical price charts lose data beyond 60 days
  - ✅ Current prices still work
  - ✅ Cost-to-Finish still works (uses current prices)
  - ⚠️ Price trend analysis limited to 60-day window
- **Safety Features**:
  - ✅ Shows preview of what will be deleted before execution
  - ✅ Requires confirmation
  - ✅ Detailed logging of all operations
- **Recommendation**: **Safe to use** - this is exactly what you want (60-day retention)

### ⚠️ **Scryfall Cache Optimization** (`/api/admin/data/optimize-scryfall-cache`)
- **Risk Level**: MODERATE (Low for analyze, Medium for optimize)
- **What it does**: 
  - **Analyze mode**: Just reads data (SAFE)
  - **Optimize mode**: Truncates long oracle_text fields (>500 chars)
- **Data Loss**: Truncated oracle_text (loses card description details beyond 500 chars)
- **Reversible**: ⚠️ PARTIAL (only if you have backups of scryfall_cache)
- **Impact if Lost**:
  - ❌ Full oracle text beyond 500 chars lost (card flavor text, long descriptions)
  - ✅ First 500 chars preserved
  - ✅ Card images, types, rarity, costs unaffected
  - ✅ Most card lookups still work fine
- **Safety Features**:
  - ✅ Limited to 100 rows per run (safe batch size)
  - ✅ Provides SQL for full optimization (you control when to run)
  - ✅ Only truncates, doesn't delete rows
- **Recommendation**: **Low risk** - Limited batches + you control when to run full optimization

### ⚠️ **Audit Logs Cleanup** (`/api/admin/data/cleanup-audit-logs`)
- **Risk Level**: LOW-MODERATE
- **What it does**: Deletes admin_audit or error_logs entries older than retention period
- **Data Loss**: Historical logs
- **Reversible**: ✅ YES (if you have backups)
- **Impact if Lost**:
  - ❌ Lose audit trail history beyond retention period
  - ✅ System functionality unaffected
  - ✅ Recent logs still available
- **Safety Features**:
  - ✅ Separate operations for each table
  - ✅ Shows count before deletion
  - ✅ Detailed logging
- **Recommendation**: **Safe to use** - These are logs, not critical data

---

## 🔴 HIGH RISK (Irreversible User Data Loss)

### 🚨 **Abandoned Accounts Cleanup** (`/api/admin/data/cleanup-abandoned-accounts`)
- **Risk Level**: HIGH
- **What it does**: 
  - **Find mode**: Lists accounts inactive 1+ year (SAFE - read-only)
  - **Delete mode**: Permanently deletes user accounts and ALL associated data
- **Data Loss**: 
  - ❌ User accounts deleted
  - ❌ All user decks deleted
  - ❌ All user collections deleted
  - ❌ All user chat history deleted
  - ❌ All user wishlists deleted
  - ❌ All user custom cards deleted
- **Reversible**: ⚠️ ONLY if you have backups AND restore quickly
- **Impact if Lost**:
  - ❌ Users lose all their data permanently
  - ❌ GDPR compliance issues if done incorrectly
  - ❌ Cannot be undone without full backup restore
- **Safety Features**:
  - ✅ Default mode is "find" (read-only preview)
  - ✅ Shows full list before deletion
  - ⚠️ Delete mode requires explicit action='delete' parameter
  - ⚠️ Currently no double-confirmation in UI (needs improvement)
- **Recommendation**: ⚠️ **Use with extreme caution**
  - Always use "Find" mode first to preview
  - Only delete if you're certain accounts are truly abandoned
  - Consider GDPR retention requirements (may need to keep data longer)

---

## 🛡️ Safety Features Already Built-In

1. **Supabase Automatic Backups**:
   - Daily backups (7-day retention on free tier, 30-day on pro)
   - Point-in-time recovery available
   - Can restore entire database from backup

2. **GitHub Actions Backups**:
   - Daily automated backups to GitHub
   - JSON format, downloadable
   - 7-day retention

3. **Preview Before Delete**:
   - All cleanup functions show what will be deleted
   - Count of rows affected
   - Date ranges of data to be removed

4. **Detailed Logging**:
   - All operations logged with timestamps
   - Can trace exactly what was deleted
   - Logs stored in response for review

5. **Confirmation Dialogs**:
   - Price snapshots: Browser confirm dialog
   - Other cleanups: Browser confirm dialogs
   - Abandoned accounts: Preview-only by default

---

## 💡 Recommendations

### Before Running Any Cleanup:
1. ✅ Check Supabase Dashboard → Backups (verify recent backup exists)
2. ✅ Run "Analyze Database Sizes" first to understand current state
3. ✅ Start with lowest-risk operations (audit logs, price snapshots)
4. ✅ Verify backups are working before high-risk operations

### Safest Order of Operations:
1. **Start Here**: Analyze Database Sizes (100% safe)
2. **Then**: Cleanup Audit Logs (low risk, just logs)
3. **Then**: Cleanup Price Snapshots (moderate risk, but 60-day retention is intended)
4. **Optional**: Scryfall Cache Optimization (run analyze first, optimize only if needed)
5. **Avoid Unless Necessary**: Abandoned Accounts deletion (very high risk)

### If Something Goes Wrong:
1. **Don't Panic**: Supabase has daily backups
2. **Stop All Operations**: Don't run more cleanups
3. **Contact Supabase Support**: They can help restore from backup
4. **Check Backup Status**: Verify your latest backup in Supabase Dashboard

---

## 📝 Suggested Safety Improvements

Consider adding:
- [ ] Pre-cleanup backup reminder/check
- [ ] Dry-run mode for all cleanup functions (shows what would happen without executing)
- [ ] Double confirmation for abandoned accounts deletion
- [ ] Automatic backup creation before large deletions
- [ ] Rollback capability (store deleted data temporarily before permanent deletion)

