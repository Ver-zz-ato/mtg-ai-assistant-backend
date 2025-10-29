# MTG Bulk Jobs Server

Local server for running memory-intensive bulk data import jobs.

## Setup

1. Install dependencies:
```bash
cd backend/bulk-jobs-server
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Edit `.env` and add your Supabase credentials:
   - Get them from your Supabase project settings
   - You need the URL and SERVICE_ROLE key (not the anon key!)

4. Start the server:
```bash
npm start
```

Server will run on `http://localhost:3001`

## Usage

### From Admin Panel

Go to `/admin/data` on your Next.js app and click the "🚀 RUN NOW (localhost:3001)" button!

### Manually via curl

```powershell
# Health check
curl http://localhost:3001/health

# Run bulk Scryfall import (takes 3-5 minutes)
$headers = @{"x-cron-key" = "Boobies"}
Invoke-WebRequest -Uri "http://localhost:3001/bulk-scryfall" -Method POST -Headers $headers
```

## Endpoints

- `GET /health` - Health check
- `POST /bulk-scryfall` - Download and import all 110k+ cards from Scryfall
  - Requires header: `x-cron-key: Boobies`
  - Takes ~3-5 minutes
  - Downloads ~100MB JSON file
  - Inserts into `scryfall_cache` table

