# Cron Job Setup for MTG AI Assistant

## Weekly Bulk Scryfall Import

### For Production (Render/Vercel/etc.)
Add this to your hosting platform's cron job configuration:

```bash
# Every Sunday at 2:00 AM UTC
0 2 * * 0 curl -X POST -H "x-cron-key: YOUR_CRON_KEY" https://your-app.com/api/cron/bulk-scryfall
```

### Environment Variables Needed
```env
CRON_KEY=your-secret-cron-key-here
# OR
RENDER_CRON_SECRET=your-render-cron-secret-here
```

### For Local Development/Self-hosted
Create a system cron job:

1. Open crontab: `crontab -e`
2. Add this line:
```bash
# Weekly Scryfall bulk import - Sundays at 2 AM
0 2 * * 0 curl -X POST -H "x-cron-key: YOUR_CRON_KEY" http://localhost:3000/api/cron/bulk-scryfall
```

### Remove Redundant Jobs

The prewarm job can be removed or reduced to monthly since we now have comprehensive bulk import:

```bash
# If keeping prewarm, run monthly instead of daily/weekly
0 3 1 * * curl -X POST -H "x-cron-key: YOUR_CRON_KEY" https://your-app.com/api/cron/prewarm-scryfall
```

### Testing

To test the cron jobs manually, use these admin API endpoints:
- Bulk import: `POST /api/cron/bulk-scryfall`  
- Prewarm cache: `POST /api/cron/prewarm-scryfall`
- Cache debug: `POST /api/debug/cache-reset`

### Expected Results

After successful setup:
- ~100K+ cards cached weekly
- Profile charts populated with color/type data
- Fast deck art loading across the app
- Reduced Scryfall API rate limiting

### Monitoring

Check the admin audit logs and app_config table for job status:
- `job:last:bulk_scryfall` - timestamp of last successful run
- `admin_audit` table - detailed job execution logs