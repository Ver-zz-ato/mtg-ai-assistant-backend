# GitHub Actions Nightly Import Setup

## Overview

Automated nightly data import using GitHub Actions to run 3 essential bulk jobs:
1. **Bulk Scryfall Import** - Card metadata (images, rarity, types)
2. **Bulk Price Import** - Live prices for all cached cards
3. **Historical Snapshots** - Price history for charts/trends

**Total runtime:** ~10-15 minutes
**Schedule:** Every night at 2:00 AM UTC
**Timeout:** 60 minutes max (prevents crashes)

## Why GitHub Actions?

✅ **Free** - No cost for public repos  
✅ **Reliable** - GitHub's infrastructure  
✅ **No timeouts** - 60 min limit vs Vercel's 10s/5min  
✅ **Detailed logs** - Full visibility into each job  
✅ **Manual triggers** - Can run anytime for testing  
✅ **Email notifications** - Auto-alerts on failure  

## Required GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

### 1. `CRON_KEY`
- **Value:** `Boobies` (your current cron authentication key)
- **Purpose:** Authenticates GitHub Actions to call your API endpoints
- **Where it's used:** All 3 API endpoint calls

### 2. `VERCEL_URL`
- **Value:** `https://www.manatap.ai`
- **Purpose:** Base URL of your deployed application
- **Where it's used:** All API endpoint URLs

## Setup Steps

### Step 1: Add GitHub Secrets

1. Go to https://github.com/YOUR_USERNAME/mtg_ai_assistant/settings/secrets/actions
2. Click "New repository secret"
3. Add `CRON_KEY` with value `Boobies`
4. Click "Add secret"
5. Click "New repository secret" again
6. Add `VERCEL_URL` with value `https://www.manatap.ai`
7. Click "Add secret"

### Step 2: Verify Workflow File Exists

The workflow file should be at: `.github/workflows/nightly-bulk-imports.yml`

If you need to edit the schedule or settings, modify this file.

### Step 3: Test Manually (RECOMMENDED FIRST)

Before waiting for the nightly schedule:

1. Go to https://github.com/YOUR_USERNAME/mtg_ai_assistant/actions
2. Click "Nightly Bulk Data Import" workflow
3. Click "Run workflow" button (top right)
4. Select "main" branch
5. Check "Enable extra debug logging" (optional)
6. Click "Run workflow"

### Step 4: Monitor the Run

1. Click on the running workflow
2. Click on the "bulk-import" job
3. Expand each step to see detailed logs
4. Watch for:
   - ✅ Green checkmarks = success
   - ❌ Red X = failure
   - ⏱️ Duration for each job
   - 📊 Stats (cards processed, inserted, etc.)

### Step 5: Verify Results

After successful run, check:

1. **Admin Page:** Go to `/admin/data` and verify "Last run" timestamps updated
2. **Database:** Check `scryfall_cache` has fresh data
3. **Site Functions:** Test "Cost to Finish" charts, deck valuations, etc.

## Monitoring & Maintenance

### View Past Runs

- Go to Actions tab → "Nightly Bulk Data Import"
- See history of all runs (successes and failures)
- Click any run to see detailed logs

### Email Notifications

GitHub will automatically email you if:
- Workflow fails
- Any job fails
- Timeout occurs

Check your GitHub notification settings to ensure emails are enabled.

### Success Indicators

Look for these in the Summary step:
```
✅ All jobs completed successfully!
🎨 Job 1 (Metadata):  success - 243s
💰 Job 2 (Prices):    success - 287s
📈 Job 3 (Snapshots): success - 156s
⏱️ Total runtime: 686 seconds (~11 minutes)
```

### Failure Indicators

If you see:
- ❌ HTTP status not 200
- 🔍 Error details logged
- Workflow marked as failed (red X)

Common issues:
1. **Unauthorized (401):** Check CRON_KEY secret matches
2. **Connection refused:** Check VERCEL_URL is correct
3. **Timeout:** Increase `timeout-minutes` in workflow (currently 60)
4. **504 Gateway Timeout:** API endpoint taking too long, check Vercel logs

## Debugging Failed Runs

### Check Workflow Logs
1. Go to failed run in Actions tab
2. Click on "bulk-import" job
3. Expand failed step
4. Look for HTTP status code and error message

### Check Vercel Logs
1. Go to Vercel dashboard
2. Click on your project
3. Go to "Logs" tab
4. Filter by time of failed run
5. Look for corresponding API endpoint logs

### Download Failure Artifacts
If workflow fails, it automatically uploads logs:
1. Go to failed run
2. Scroll to bottom
3. Click "Artifacts" → "failure-logs-{run_id}"
4. Download and inspect response.json

## Manual Runs for Testing

### Test Individual Jobs

You can test each job individually using curl:

#### Job 1: Metadata
```bash
curl -X POST \
  -H "x-cron-key: Boobies" \
  -H "Content-Type: application/json" \
  "https://www.manatap.ai/api/cron/bulk-scryfall"
```

#### Job 2: Prices
```bash
curl -X POST \
  -H "x-cron-key: Boobies" \
  -H "Content-Type: application/json" \
  "https://www.manatap.ai/api/cron/bulk-price-import"
```

#### Job 3: Snapshots
```bash
curl -X POST \
  -H "x-cron-key: Boobies" \
  -H "Content-Type: application/json" \
  "https://www.manatap.ai/api/admin/price/snapshot/bulk"
```

## Modifying the Schedule

To change when the workflow runs, edit `.github/workflows/nightly-bulk-imports.yml`:

```yaml
schedule:
  - cron: '0 2 * * *'  # 2:00 AM UTC daily
```

Cron syntax:
- `0 2 * * *` - 2:00 AM every day
- `0 2 * * 0` - 2:00 AM every Sunday
- `0 */6 * * *` - Every 6 hours
- `30 3 * * 1-5` - 3:30 AM weekdays only

After editing, commit and push changes to GitHub.

## Troubleshooting

### Workflow not running automatically
- Check that `.github/workflows/nightly-bulk-imports.yml` is in main branch
- Verify secrets are added correctly
- GitHub Actions must be enabled for your repo (Settings → Actions → General)

### Jobs timing out in workflow but work locally
- Your local environment might have different timeout settings
- GitHub Actions has 60 min timeout (generous)
- If still timing out, the API endpoints might need optimization

### Secrets not working
- Secrets are case-sensitive
- Verify secret names match exactly: `CRON_KEY` and `VERCEL_URL`
- Try deleting and re-creating secrets

## Rollback Plan

If automated runs cause issues:

1. **Disable workflow temporarily:**
   - Go to Actions → "Nightly Bulk Data Import" → "..." → "Disable workflow"

2. **Switch back to manual:**
   - Continue using manual triggers from `/admin/data` page
   - Or use curl commands above

3. **Revert to backup branch:**
   ```bash
   git checkout backup-admin-consolidation-oct27
   ```

## Comparison: Before vs After

### Before (6 Jobs)
- ❌ Prewarm Scryfall (400 cards) - redundant
- ❌ Daily Snapshot (subset) - redundant  
- ❌ Build Snapshot (subset) - redundant
- ✅ Bulk Scryfall (110k cards) - kept
- ✅ Bulk Price Import (all prices) - kept
- ✅ Weekly FULL (historical) - kept

### After (3 Jobs)
- ✅ Bulk Scryfall - 110k+ cards metadata
- ✅ Bulk Price Import - All prices
- ✅ Historical Snapshots - Price tracking

**Benefits:**
- Simpler to understand and maintain
- No redundant/overlapping jobs
- All jobs run automatically nightly
- Better visibility with GitHub Actions logs
- No more manual triggers needed (but still available)

## Next Steps

1. ✅ Add GitHub secrets (CRON_KEY, VERCEL_URL)
2. ✅ Test workflow manually via Actions tab
3. ✅ Verify results in admin panel
4. ✅ Wait for first automatic nightly run
5. ✅ Check email for success notification
6. 🎉 Enjoy automated data updates!

## Support

If you run into issues:
1. Check this guide first
2. Review workflow logs in Actions tab
3. Check Vercel logs for API endpoint errors
4. Test individual jobs with curl
5. Verify secrets are set correctly

The workflow includes extensive debugging output, so failures should be easy to diagnose from the logs.

