# 🚨 GitHub Actions Fix Required

## Current Issues

### 1. BASE_URL Secret Problem
```
Run if [ -z "" ]; then
Error: BASE_URL is not set in repo secrets (e.g., https://your.app).
Error: Process completed with exit code 1.
```

**Issue**: BASE_URL secret is empty (`""`) instead of your URL.

### 2. Previous Night's URL Error
```
curl: (3) URL rejected: No host part in the URL
Error: Process completed with exit code 3.
```

**Issue**: BASE_URL was completely missing or malformed.

## 🛠️ Fix Instructions

### Step 1: Check Current Secrets
1. Go to: `https://github.com/Ver-zz-ato/mtg-ai-assistant-backend/settings/secrets/actions`
2. Look for these secrets:
   - `BASE_URL`
   - `CRON_KEY`

### Step 2: Fix BASE_URL Secret
**Current (broken)**: BASE_URL is empty or has wrong value
**Required**: `BASE_URL` = `https://manatap.ai`

**Action**: 
1. Click on `BASE_URL` secret
2. Click "Update" 
3. Set value to: `https://manatap.ai` (exactly, no trailing slash)
4. Click "Update secret"

### Step 3: Verify CRON_KEY
**Required**: `CRON_KEY` = same value as in your Render environment

### Step 4: Test the Fix
1. Go to: `https://github.com/Ver-zz-ato/mtg-ai-assistant-backend/actions`
2. Find `nightly-prewarm-and-snapshot` workflow
3. Click "Run workflow" to test manually
4. Check logs - should show:
   ```
   POST https://manatap.ai/api/cron/prewarm-scryfall
   {"ok":true,"warmed":N}
   ```

## 🔍 Verification Commands

After fixing, the workflow should succeed with these calls:
```bash
# Should work (no more empty BASE_URL)
curl -f -sS -X POST -H "x-cron-key: YOUR_CRON_KEY" "https://manatap.ai/api/cron/prewarm-scryfall"

# Should return JSON like: {"ok":true,"warmed":13}
```

## 🎯 Expected Results After Fix
- ✅ Nightly jobs run automatically at 4 AM UTC
- ✅ Cache populates with 200-400 cards
- ✅ Profile pages work without Scryfall rate limits
- ✅ No more failed workflow emails