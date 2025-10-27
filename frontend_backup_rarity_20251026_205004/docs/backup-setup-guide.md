# ManaTap.ai Backup Setup Guide

This guide walks you through setting up comprehensive automated backups and monitoring for ManaTap.ai.

## 🗄️ Part 1: Supabase Automated Backups

### Step 1: Verify Supabase Backup Status

1. **Login to Supabase Dashboard**:
   - Go to: https://supabase.com/dashboard
   - Select your ManaTap project

2. **Navigate to Backups**:
   - Go to Settings → Database → Backups
   - OR: Direct link: `https://supabase.com/dashboard/project/[YOUR_PROJECT_ID]/settings/database`

3. **Verify Backup Configuration**:
   ```
   ✅ Daily Backups: Enabled (automatic)
   ✅ Retention: 7 days (free tier) / 30 days (pro tier)
   ✅ Backup Time: ~02:00 UTC daily
   ✅ Point-in-time Recovery: Available
   ```

### Step 2: Upgrade for Better Retention (Recommended)

**Free Tier Limitations**:
- 7-day backup retention
- Limited point-in-time recovery

**Pro Tier Benefits** ($25/month):
- 30-day backup retention
- Full point-in-time recovery
- Backup encryption
- Priority support

**To Upgrade**:
1. In Supabase Dashboard → Settings → Billing
2. Upgrade to Pro plan
3. Verify backup retention increased to 30 days

### Step 3: Test Backup Creation

1. **Manual Backup Test**:
   - Go to Database → Backups
   - Look for recent backups (should be daily)
   - Note backup size and status

2. **Test Point-in-Time Recovery**:
   - Select any recent backup
   - Click "Create project from backup"
   - **IMPORTANT**: This creates a NEW project (for testing only)
   - Delete test project after verification

---

## 📊 Part 2: Backup Monitoring Setup

### Step 1: Install Monitoring Script

The monitoring script is already created at `scripts/backup-monitor.js`. 

**Test the script**:
```bash
# Test locally (requires your site to be running)
node scripts/backup-monitor.js

# You should see output like:
[2024-XX-XX] INFO: Starting backup monitoring check...
[2024-XX-XX] INFO: Checking system health...
[2024-XX-XX] INFO: Health check passed in XXXms
[2024-XX-XX] INFO: All monitoring checks passed
```

### Step 2: Configure Environment Variables

Create monitoring configuration:

```bash
# Add to your environment (production)
HEALTH_CHECK_URL=https://manatap.ai/api/health
BACKUP_CHECK_URL=https://manatap.ai/api/admin/backups
ADMIN_EMAIL=davy@manatap.ai
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
ADMIN_TOKEN=your_admin_auth_token_here
```

### Step 3: Set Up Scheduled Monitoring

**Option A: GitHub Actions (Recommended)**

Create `.github/workflows/backup-monitor.yml`:
```yaml
name: Backup Monitor

on:
  schedule:
    # Run daily at 3 AM UTC (after backups complete)
    - cron: '0 3 * * *'
  workflow_dispatch: # Manual trigger

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Run Backup Monitor
        env:
          HEALTH_CHECK_URL: ${{ secrets.HEALTH_CHECK_URL }}
          BACKUP_CHECK_URL: ${{ secrets.BACKUP_CHECK_URL }}
          ADMIN_EMAIL: ${{ secrets.ADMIN_EMAIL }}
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          ADMIN_TOKEN: ${{ secrets.ADMIN_TOKEN }}
        run: |
          node scripts/backup-monitor.js
```

**Option B: Server Cron Job**

If you have a server/VPS:
```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 3 AM)
0 3 * * * cd /path/to/manatap && node scripts/backup-monitor.js
```

**Option C: External Monitoring Service**

Use services like:
- **UptimeRobot**: Monitor `/api/health` endpoint
- **Pingdom**: HTTP monitoring with alerts
- **DataDog**: Comprehensive monitoring (overkill for small app)

---

## 🚨 Part 3: Alert Configuration

### Step 1: Slack Notifications (Optional)

1. **Create Slack App**:
   - Go to: https://api.slack.com/apps
   - Create new app for your workspace

2. **Enable Incoming Webhooks**:
   - In app settings → Incoming Webhooks
   - Create webhook URL

3. **Configure Webhook**:
   ```bash
   export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
   ```

### Step 2: Email Alerts

The monitoring script logs alerts to `logs/alerts.log`. You can process these with:

```bash
# Simple email script (alerts-emailer.sh)
#!/bin/bash
ALERT_FILE="logs/alerts.log"
LAST_SENT_FILE="logs/last-alert-email.txt"

if [ -f "$ALERT_FILE" ]; then
  # Check if new alerts since last email
  if [ ! -f "$LAST_SENT_FILE" ] || [ "$ALERT_FILE" -nt "$LAST_SENT_FILE" ]; then
    # Send email with recent alerts
    tail -10 "$ALERT_FILE" | mail -s "ManaTap Backup Alerts" davy@manatap.ai
    touch "$LAST_SENT_FILE"
  fi
fi
```

---

## 🧪 Part 4: Testing & Validation

### Step 1: Test Backup Monitoring

```bash
# Test health check
curl https://manatap.ai/api/health

# Expected response:
{
  "ok": true,
  "supabase": {"ok": true, "ms": 100},
  "scryfall": {"ok": true, "ms": 200},
  "ts": "2024-XX-XXTXX:XX:XX.XXXZ"
}
```

### Step 2: Test Admin Backup Interface

1. **Access Admin Panel**:
   - Go to: https://manatap.ai/admin/JustForDavy
   - Click "Database Backups"

2. **Verify Interface**:
   - Should show backup status
   - Should list recent backups
   - Manual backup button should work
   - Test restore should work

### Step 3: Simulate Failure Scenarios

**Test 1: Health Check Failure**
```bash
# Temporarily break health endpoint (in testing)
# Run monitoring script - should generate alert
node scripts/backup-monitor.js
```

**Test 2: Backup Age Alert**
```bash
# Modify MAX_BACKUP_AGE_HOURS to 1 hour in script
# Run monitoring - should alert if no recent backups
```

---

## 📅 Part 5: Maintenance Schedule

### Daily (Automated)
- ✅ Supabase creates daily backup at ~02:00 UTC
- ✅ Monitoring script checks health at 03:00 UTC
- ✅ Alerts sent if any issues detected

### Weekly (Manual - 15 minutes)
1. **Check Admin Dashboard**:
   - Visit `/admin/backups`
   - Verify 7 days of backups are present
   - Check backup sizes are reasonable

2. **Review Monitoring Logs**:
   ```bash
   # Check recent monitoring logs
   tail -20 logs/backup-monitor.log
   
   # Check for any alerts
   cat logs/alerts.log
   ```

### Monthly (Manual - 30 minutes)
1. **Full Recovery Test**:
   - Create test project from recent backup
   - Test key functionality (login, deck creation, chat)
   - Document test results
   - Delete test project

2. **Update Recovery Procedures**:
   - Review disaster recovery runbook
   - Update any changed procedures
   - Verify contact information is current

### Quarterly (Manual - 2 hours)
1. **Complete Recovery Drill**:
   - Schedule maintenance window
   - Practice full disaster recovery
   - Time each step
   - Update procedures based on learnings

---

## ✅ Setup Checklist

### Initial Setup
- [ ] Verify Supabase backups are enabled
- [ ] Consider upgrading to Pro tier for 30-day retention
- [ ] Install monitoring script dependencies
- [ ] Configure environment variables
- [ ] Set up scheduled monitoring (GitHub Actions recommended)
- [ ] Test monitoring script locally
- [ ] Configure Slack/email alerts
- [ ] Test admin backup interface

### Ongoing Maintenance
- [ ] Weekly backup status check
- [ ] Monthly recovery test
- [ ] Quarterly full recovery drill
- [ ] Annual procedure review and updates

---

## 🆘 Emergency Contacts & Resources

**Primary Admin**: Davy Seits (davy@manatap.ai)

**Service Status Pages**:
- Supabase: https://status.supabase.com
- Vercel: https://status.vercel.com  
- Render: https://status.render.com

**Support Contacts**:
- Supabase: https://supabase.com/support
- Vercel: https://vercel.com/support
- Render: https://render.com/support

**Documentation**:
- Disaster Recovery Runbook: `docs/disaster-recovery-runbook.md`
- Admin Backup Interface: `https://manatap.ai/admin/backups`
- Health Check: `https://manatap.ai/api/health`

---

## 🔄 Document Updates

**Last Updated**: October 11, 2024  
**Next Review**: January 11, 2025  
**Version**: 1.0  

Update this document when:
- Infrastructure changes occur
- New monitoring tools are added
- Recovery procedures change
- Contact information updates