# Alternative Scheduling Solutions

Since GitHub Actions can be unreliable, here are multiple backup scheduling options for your daily cache maintenance tasks.

## Overview

Your daily automation needs:
- **Daily Price Updates**: `/api/cron/daily-price-update` (3:00 AM UTC)
- **Daily Cache Cleanup**: `/api/cron/cleanup-price-cache` (4:00 AM UTC)

## Option 1: Render Cron Jobs (Recommended)

If you're hosting on Render, they provide native cron job support.

### Setup:
1. In your Render dashboard, create a new "Cron Job" service
2. Configure the schedule and command:

```yaml
# Daily Price Update
name: daily-price-update
command: curl -X POST -H "x-cron-key: $CRON_KEY" -H "Content-Type: application/json" "$BASE_URL/api/cron/daily-price-update"
schedule: "0 3 * * *"
```

```yaml
# Daily Cache Cleanup  
name: daily-cache-cleanup
command: curl -X POST -H "x-cron-key: $CRON_KEY" -H "Content-Type: application/json" "$BASE_URL/api/cron/cleanup-price-cache"
schedule: "0 4 * * *"
```

### Environment Variables:
- `CRON_KEY`: Your cron authentication key
- `BASE_URL`: Your app's base URL

## Option 2: Vercel Cron (if hosting on Vercel)

Add to your `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-price-update",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/cleanup-price-cache", 
      "schedule": "0 4 * * *"
    }
  ]
}
```

Note: Vercel cron automatically includes proper authentication headers.

## Option 3: UptimeRobot (Free External Service)

UptimeRobot can be used to ping your endpoints at scheduled intervals.

### Setup:
1. Sign up at https://uptimerobot.com
2. Create "HTTP(s)" monitors for each endpoint
3. Set custom intervals (minimum 5 minutes on free plan)

### Monitor Configuration:
```
URL: https://your-app.com/api/cron/daily-price-update
Method: POST
Custom Headers:
  x-cron-key: your-cron-key
  Content-Type: application/json

Check Interval: Daily at specific time (Pro plan) or every 24 hours (Free)
```

**Limitation**: Free plan doesn't allow exact time scheduling, only intervals.

## Option 4: Cron-job.org (External Service)

Free service that can make HTTP requests on schedule.

### Setup:
1. Visit https://cron-job.org
2. Create account and add new cron job
3. Configure:
   - URL: `https://your-app.com/api/cron/daily-price-update`
   - Schedule: `0 3 * * *`
   - HTTP Method: POST
   - Headers: `x-cron-key: your-key`

Repeat for cleanup endpoint.

## Option 5: AWS EventBridge + Lambda (Advanced)

For more reliable enterprise solution:

1. Create Lambda functions that call your endpoints
2. Use EventBridge (CloudWatch Events) to trigger on schedule
3. Lambda code example:

```javascript
exports.handler = async (event) => {
    const response = await fetch('https://your-app.com/api/cron/daily-price-update', {
        method: 'POST',
        headers: {
            'x-cron-key': process.env.CRON_KEY,
            'Content-Type': 'application/json'
        }
    });
    
    return {
        statusCode: response.status,
        body: JSON.stringify(await response.json())
    };
};
```

## Option 6: Local Server Cron (if you have one)

If you have any server running 24/7, add to crontab:

```bash
# Edit crontab
crontab -e

# Add these lines
0 3 * * * curl -X POST -H "x-cron-key: YOUR_KEY" -H "Content-Type: application/json" "https://your-app.com/api/cron/daily-price-update"
0 4 * * * curl -X POST -H "x-cron-key: YOUR_KEY" -H "Content-Type: application/json" "https://your-app.com/api/cron/cleanup-price-cache"
```

## Testing Your Setup

Test any endpoint manually:

```bash
# Test price update
curl -X POST \
  -H "x-cron-key: YOUR_CRON_KEY" \
  -H "x-test-mode: true" \
  -H "Content-Type: application/json" \
  "https://your-app.com/api/cron/daily-price-update"

# Test cleanup
curl -X POST \
  -H "x-cron-key: YOUR_CRON_KEY" \
  -H "Content-Type: application/json" \
  "https://your-app.com/api/cron/cleanup-price-cache"
```

## Monitoring & Redundancy

**Best Practice**: Set up 2-3 different scheduling methods:
1. Primary: Render Cron or Vercel Cron (hosting provider)
2. Backup: UptimeRobot or cron-job.org (external)
3. Emergency: GitHub Actions (fallback despite reliability issues)

Your endpoints are designed to handle duplicate calls gracefully, so multiple schedulers won't cause issues.

## Current Schedule Summary

- **2:00 AM UTC**: Weekly Scryfall bulk import (Sundays only)
- **3:00 AM UTC**: Daily price updates (up to 500 cards, ~50 API calls)
- **4:00 AM UTC**: Daily cache cleanup (removes entries >48 hours old)

This staggered approach ensures:
1. Bulk data is fresh before price updates
2. Price updates complete before cleanup
3. Minimal API rate limit conflicts
4. Each job has time to complete before the next begins