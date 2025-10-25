# GitHub Actions Cron Job Setup

## Overview
This setup replaces manual cron jobs with a GitHub Actions workflow that runs weekly to update your Scryfall card cache.

## Required GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add these two secrets:

### 1. `CRON_KEY`
- **Value**: Your cron authentication key
- **Example**: `your-secret-cron-key-here`
- **Purpose**: Authenticates the GitHub Action to call your API

### 2. `BASE_URL` 
- **Value**: Your application's base URL
- **Example**: `https://your-app.vercel.app` or `https://your-app.herokuapp.com`
- **Purpose**: The base URL where your app is deployed

## Environment Variables (in your app)

Make sure your deployed app has this environment variable:

```env
CRON_KEY=your-secret-cron-key-here
# This should match the CRON_KEY secret in GitHub
```

## Testing the Workflow

### Manual Test (Recommended First)
1. Go to your GitHub repo → Actions tab
2. Click "Weekly Scryfall Bulk Import" workflow
3. Click "Run workflow" button
4. Monitor the logs to ensure it works

### Automatic Schedule
- **Frequency**: Every Sunday at 2:00 AM UTC
- **Cron Expression**: `0 2 * * 0`
- **Next Run**: Will show in the Actions tab

## Monitoring

### Success Indicators
- ✅ Workflow completes without errors
- 📊 Shows cards imported count in job summary
- 💾 Final cache count matches expectations (~35K+ cards)

### Failure Indicators  
- ❌ HTTP errors (check if app is accessible)
- 🔑 Authentication errors (check CRON_KEY secret)
- ⏰ Timeout errors (bulk import takes ~2-5 minutes)

## Workflow Features

- **Automatic retry**: GitHub Actions has built-in retry logic
- **Rich summaries**: Shows import statistics in GitHub UI
- **Manual triggers**: Can run anytime via "workflow_dispatch"
- **Failure notifications**: GitHub will email you if it fails
- **15-minute timeout**: Prevents runaway jobs

## Benefits Over External Cron

✅ **Free**: No external cron service needed  
✅ **Reliable**: GitHub's infrastructure  
✅ **Visible**: All runs logged and monitored  
✅ **Secure**: Uses GitHub secrets management  
✅ **Flexible**: Easy to modify schedule or logic  

## Removing Old Cron Jobs

If you had external cron jobs setup:
- Remove them from your hosting platform
- The `prewarm-scryfall` job can be removed entirely (redundant)
- Keep price snapshot jobs if you use pricing features

## Troubleshooting

### Common Issues

1. **"unauthorized" error**
   - Check CRON_KEY secret matches your app's environment variable
   
2. **"connection refused" error**  
   - Verify BASE_URL secret points to your deployed app
   - Ensure your app is running and accessible

3. **Timeout errors**
   - Bulk import can take 2-5 minutes for ~100K cards
   - This is normal for the initial run

### Checking Logs
- Go to Actions tab → Click on the workflow run → View logs
- Look for the "Trigger Bulk Import" step for detailed output

## Next Steps

1. Add the two secrets to GitHub
2. Test with manual workflow trigger
3. Verify your `/debug/profile-data` page shows updated cache
4. Remove any old external cron jobs
5. Enjoy automated weekly updates! 🎉