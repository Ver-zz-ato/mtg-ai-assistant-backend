# GitHub Secrets Configuration Check

## Required Secrets for Scheduled Jobs

Your scheduled GitHub Actions are failing because they need these repository secrets to be configured:

### 1. BASE_URL
- **What**: The full URL to your deployed application
- **Example**: `https://your-app-name.vercel.app` or `https://yourdomain.com`
- **Why**: The GitHub Action needs to know where to send the API requests

### 2. CRON_KEY
- **What**: A secret key that authenticates the scheduled job calls
- **Example**: A random string like `your-secret-cron-key-123`
- **Why**: Prevents unauthorized access to your cron endpoints

## How to Fix

### Option 1: Set GitHub Repository Secrets
1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these secrets:
   - Name: `BASE_URL`, Value: `https://your-deployed-app-url.com`
   - Name: `CRON_KEY`, Value: `your-secret-key-here`

### Option 2: Set Environment Variables in Your Deploy Platform
If using Vercel/Netlify/etc., also set:
- `CRON_KEY=your-secret-key-here`

## Test the Configuration

After setting the secrets, you can:

1. **Manual test**: Go to GitHub → Actions → "nightly-prewarm-and-snapshot" → "Run workflow"
2. **Check the logs**: Look for successful HTTP 200 responses
3. **Verify in app**: Visit `/debug/profile-data` to see if cache is populated

## Current Status
- ✅ Prewarm endpoint works (you got `{"ok":true,"warmed":13}`)
- ❌ GitHub scheduled job fails (missing/invalid secrets)
- ❌ Price snapshot never runs (same issue)

## Expected Results After Fix
- Cache should populate automatically every night at 4 AM UTC
- Profile pages should stop hitting Scryfall rate limits
- Price snapshots should run daily/weekly