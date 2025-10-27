# Admin Jobs Consolidation - Quick Start

## ✅ What Was Done

1. **Consolidated 6 jobs → 3 essential jobs**
2. **Updated admin UI** with detailed explanations
3. **Created GitHub Actions workflow** for nightly automation
4. **Created backup branch** for easy rollback
5. **Comprehensive documentation** and test scripts

## 🚀 Next Steps (Do These Now)

### Step 1: Add GitHub Secrets (2 minutes)

1. Go to: https://github.com/YOUR_USERNAME/mtg_ai_assistant/settings/secrets/actions
2. Add secret: `CRON_KEY` = `Boobies`
3. Add secret: `VERCEL_URL` = `https://www.manatap.ai`

### Step 2: Test the Workflow (15 minutes)

**Option A: Test via GitHub Actions (Recommended)**
1. Go to: https://github.com/YOUR_USERNAME/mtg_ai_assistant/actions
2. Click "Nightly Bulk Data Import"
3. Click "Run workflow" → Select "main" → Click green "Run workflow" button
4. Watch the logs (takes ~10-15 min)

**Option B: Test via PowerShell Script**
```powershell
.\test-admin-jobs.ps1
```
⚠️ This will take ~15 minutes and run all 3 jobs sequentially

### Step 3: Verify Results (2 minutes)

1. Go to: https://www.manatap.ai/admin/data
2. Check that "Last successful run" timestamps are recent
3. Test "Cost to Finish" feature to verify rarity charts work

### Step 4: Wait for Automatic Run

- First automatic run: Tonight at 2:00 AM UTC
- You'll get an email if it fails
- Check tomorrow morning to verify success

## 📋 The 3 Essential Jobs

| Job | What | Runtime | Database Table |
|-----|------|---------|----------------|
| 🎨 **Bulk Scryfall** | Card metadata (images, rarity, types) | 3-5 min | `scryfall_cache` |
| 💰 **Bulk Price Import** | Live prices (USD, EUR, foil) | 3-5 min | `scryfall_cache` |
| 📈 **Historical Snapshots** | Price history for charts | 2-3 min | `price_snapshots` |

**Total nightly runtime:** ~10-15 minutes  
**Schedule:** Every night at 2:00 AM UTC  
**Automatic:** Yes, via GitHub Actions

## 📚 Documentation

- **Full Setup Guide:** `GITHUB_ACTIONS_SETUP.md`
- **Implementation Summary:** `ADMIN_CONSOLIDATION_SUMMARY.md`
- **Test Scripts:** `test-admin-jobs.ps1` (Windows) or `test-admin-jobs.sh` (Mac/Linux)

## 🔙 Rollback if Needed

If something goes wrong:

```bash
git checkout backup-admin-consolidation-oct27
```

Or just disable the GitHub Actions workflow:
- Go to Actions → "Nightly Bulk Data Import" → "..." → "Disable workflow"

## ❓ Common Issues

**"Unauthorized" error:**
- Check GitHub secrets are added correctly
- Verify secret names are exact: `CRON_KEY` and `VERCEL_URL`

**Jobs timing out:**
- GitHub Actions has 60 min timeout, should never timeout
- Check Vercel logs for API endpoint issues

**Jobs succeeding but data not updated:**
- Check database permissions
- Verify API endpoints are hitting correct environment

## 🎯 Success Indicators

✅ GitHub Actions workflow completes with green checkmarks  
✅ Admin page shows recent "Last run" timestamps  
✅ "Cost to Finish" rarity charts populate  
✅ Deck valuations show accurate prices  
✅ No email notifications from GitHub about failures

## 💡 Pro Tips

- You can still trigger jobs manually from `/admin/data` page
- GitHub Actions logs are super detailed - check them if something fails
- First run might take slightly longer (~5-7 min per job)
- Workflow runs automatically every night, no manual intervention needed
- Can modify schedule in `.github/workflows/nightly-bulk-imports.yml`

## ⚡ That's It!

Just add the 2 GitHub secrets and test the workflow. Everything else is automated!

