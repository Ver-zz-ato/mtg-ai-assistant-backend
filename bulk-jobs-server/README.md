# Bulk Jobs Server

Express.js server for running long-duration MTG data import jobs that Vercel can't handle.

## Why This Exists

Vercel mysteriously returns 405 on POST requests for these bulk import routes, even after 12+ debugging attempts. This standalone Express server on Render works around that issue.

## Endpoints

- `GET /health` - Health check
- `POST /bulk-scryfall` - Import all 110k+ MTG cards with metadata
- `POST /bulk-price-import` - Stream Scryfall `default_cards` and upsert `price_cache` for cached cards
- `POST /price-snapshot` - Create historical price snapshots

All POST endpoints require the shared cron secret for authentication.

- Preferred: `Authorization: Bearer <CRON_SECRET>`
- Temporary compatibility: `x-cron-key: <CRON_SECRET>` is still accepted for older callers

## Deploy to Render

1. Go to https://render.com/
2. Sign in with GitHub
3. New Web Service
4. Connect this repository
5. Select `bulk-jobs-server` as root directory
6. Render will auto-detect `render.yaml`
7. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
   - `CRON_KEY`
8. Deploy!

## Local Testing

```bash
npm install
# Create .env file with your secrets
npm start
```

Test with:
```bash
curl -X POST http://localhost:3001/bulk-scryfall \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

Legacy compatibility test:
```bash
curl -X POST http://localhost:3001/bulk-scryfall \
  -H "x-cron-key: $CRON_SECRET" \
  -H "Content-Type: application/json"
```

## Notes

- Jobs return 202 Accepted immediately and run in background
- Free Render tier spins down after 15min inactivity (~30s wake time)
- Functions timeout at 15 minutes (perfect for these jobs)
- `/bulk-price-import` uses a streaming parser so the 500MB+ Scryfall bulk file is not loaded into memory at once

