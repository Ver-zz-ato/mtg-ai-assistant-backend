# 🚀 Render Deployment Guide - Bulk Jobs Workaround

## The Situation

After 12 attempts to fix Vercel's mysterious HTTP 405 errors on POST requests, we're deploying the bulk import jobs to Render instead. Your main site stays on Vercel untouched - this is JUST for the 3 admin bulk import jobs.

## What's Working

✅ **Main Site (Vercel):** All user features, deck builder, collections, auth, etc.  
✅ **All Other APIs:** Working perfectly  
🆕 **Bulk Jobs (Render):** Will work after deployment

---

## Step-by-Step Render Deployment

### 1. Sign Up for Render (FREE)

1. Go to https://render.com/
2. Click "Get Started for Free"
3. Sign up with your GitHub account
4. Authorize Render to access your repositories

### 2. Create New Web Service

1. Click "New +" button (top right)
2. Select "Web Service"
3. Find and select your repository: `mtg-ai-assistant-backend`
4. Click "Connect"

### 3. Configure Service

**Basic Settings:**
- **Name:** `mtg-bulk-jobs` (or whatever you want)
- **Root Directory:** `bulk-jobs-server` ← **IMPORTANT!**
- **Environment:** `Node`
- **Region:** Choose closest to you (Frankfurt for Europe)
- **Branch:** `main`

**Build & Deploy:**
- **Build Command:** `npm install` (should auto-detect)
- **Start Command:** `node server.js` (should auto-detect from render.yaml)

**Plan:**
- Select **FREE** tier

### 4. Add Environment Variables

Click "Advanced" or scroll to "Environment Variables" section.

Add these 3 secrets:

| Key | Value | Where to Get It |
|-----|-------|-----------------|
| `SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key | Supabase Dashboard → Settings → API → service_role (secret!) |
| `CRON_KEY` | `Boobies` | Same key you use for GitHub Actions |

**IMPORTANT:** Use the **Service Role Key**, not the anon key!

### 5. Deploy!

1. Click "Create Web Service" at the bottom
2. Wait 2-3 minutes for deployment
3. You'll see logs showing build progress
4. When you see "🚀 Bulk Jobs Server running on port 10000", it's ready!

### 6. Get Your Render URL

Once deployed, you'll see your service URL at the top of the dashboard, something like:
```
https://mtg-bulk-jobs.onrender.com
```

**Copy this URL!** You'll need it for the next steps.

---

## Update GitHub Actions

Open `.github/workflows/nightly-bulk-imports.yml` and update these lines:

**FROM:**
```yaml
API_URL="${{ secrets.VERCEL_URL }}/api/bulk-jobs/scryfall-import"
```

**TO:**
```yaml
API_URL="https://mtg-bulk-jobs.onrender.com/bulk-scryfall"
```

Do this for all 3 jobs:
- Job 1: `/bulk-scryfall`
- Job 2: `/bulk-price-import`
- Job 3: `/price-snapshot`

---

## Update Admin Page

Open `frontend/app/admin/data/page.tsx` and update the button URLs:

**FROM:**
```typescript
onClick={()=>runCron('/api/bulk-jobs/scryfall-import', true)}
```

**TO:**
```typescript
onClick={()=>runCron('https://mtg-bulk-jobs.onrender.com/bulk-scryfall', true)}
```

Same for all 3 buttons.

**OR** better yet, add a new environment variable to Vercel:
- Key: `RENDER_BULK_JOBS_URL`
- Value: `https://mtg-bulk-jobs.onrender.com`

Then use:
```typescript
onClick={()=>runCron(`${process.env.RENDER_BULK_JOBS_URL}/bulk-scryfall`, true)}
```

---

## Testing

### Test 1: Health Check
```powershell
Invoke-WebRequest -Uri "https://mtg-bulk-jobs.onrender.com/health" -Method GET
```

Should return:
```json
{"ok":true,"service":"bulk-jobs-server","timestamp":"..."}
```

### Test 2: Trigger Bulk Import
```powershell
$headers = @{
    "x-cron-key" = "Boobies"
    "Content-Type" = "application/json"
}

Invoke-WebRequest -Uri "https://mtg-bulk-jobs.onrender.com/bulk-scryfall" -Method POST -Headers $headers
```

Should return **202 Accepted**:
```json
{
  "ok":true,
  "message":"Bulk Scryfall import started",
  "note":"Job running in background, will take 3-10 minutes"
}
```

Then check Render logs to see progress!

---

## Important Notes

### Free Tier Behavior
- **Spins down after 15 minutes** of inactivity
- **Takes ~30 seconds to wake up** on first request
- After wake-up, runs normally

### GitHub Actions Adjustment
Add a wake-up step before running jobs:

```yaml
- name: Wake up Render service
  run: |
    echo "🔔 Waking up Render service..."
    curl https://mtg-bulk-jobs.onrender.com/health
    echo "⏳ Waiting 30 seconds for service to be ready..."
    sleep 30
```

### Job Monitoring
Watch logs in real-time on Render dashboard:
1. Click your service
2. Click "Logs" tab
3. See live output with all the emojis 🎨💰📈

---

## Troubleshooting

### "Service Unavailable"
- Render is waking up, wait 30 seconds and retry

### "Unauthorized"
- Check `CRON_KEY` environment variable in Render matches your header

### "Cannot connect to Supabase"
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct
- Make sure you used the **service_role** key, not anon key

### Job Doesn't Complete
- Check Render logs for errors
- Free tier has 15-minute timeout (should be enough for all jobs)

---

## Cost

**Render FREE Tier:**
- ✅ 750 hours/month
- ✅ 15-minute request timeout
- ✅ Automatic HTTPS
- ✅ No credit card required

**If you need always-on (no spin-down):**
- Upgrade to Starter plan: $7/month
- Instant wake-up, no delays

---

## Architecture Summary

```
┌─────────────────┐
│  GitHub Actions │  (Triggers nightly at 2 AM)
└────────┬────────┘
         │ POST with x-cron-key
         ▼
┌─────────────────┐
│  Render Server  │  (Express.js, FREE tier)
│   Port 10000    │  - /bulk-scryfall
└────────┬────────┘  - /bulk-price-import
         │            - /price-snapshot
         ▼
┌─────────────────┐
│   Supabase DB   │  (Updates scryfall_cache, price_snapshots)
└─────────────────┘

┌─────────────────┐
│  Vercel (Main)  │  (Next.js site, all user features)
│  www.manatap.ai │  (UNCHANGED)
└─────────────────┘
```

---

## Next Steps

1. ✅ Deploy to Render (follow steps above)
2. ⏳ Update GitHub Actions URLs
3. ⏳ Update Admin page URLs
4. ⏳ Test all 3 endpoints
5. ⏳ Run GitHub Actions workflow
6. 🎉 Bulk imports work!

---

**Questions?** Check Render logs first - they're very detailed and show exactly what's happening!

