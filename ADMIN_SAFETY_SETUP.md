# Admin Safety Features - Setup Guide

## 🎉 What's Been Implemented

### ✅ **1. Admin Audit Pinboard**
- **Location**: `/admin/ops` page (new top section)
- **Features**: 
  - 24h error count with color-coded health indicators
  - Real-time AI spending vs budget limits
  - Price snapshot staleness monitoring 
  - Performance issues tracking
  - One-click refresh button

### ✅ **2. Budget Auto-Disable**
- **Automatic**: Budget exceeded → Auto-disables `risky_betas` flag
- **Manual**: Red "Auto-Disable" button appears when over budget
- **Logging**: All auto-disable actions logged to `admin_audit` table
- **Fail-safe**: Won't break if budget check fails

### ✅ **3. Stale Snapshot Alerts**
- **Thresholds**: 
  - Green: < 36 hours old
  - Yellow: 36-72 hours old  
  - Red: > 72 hours old
- **Monitoring**: Automated via `/api/admin/monitor` endpoint

### ✅ **4. System Monitoring API**
- **Endpoint**: `POST /api/admin/monitor`
- **Checks**: Budget limits, snapshot staleness, error rates
- **Auto-actions**: Disables features when thresholds exceeded
- **Audit trail**: Logs all alerts and actions

## 🚀 How to Use

### Daily Operations
1. Visit `/admin/ops` 
2. Check the **System Health Pinboard** at the top
3. Color coding tells you status at a glance:
   - 🟢 Green = All good
   - 🟡 Yellow = Needs attention  
   - 🔴 Red = Critical issue
4. Click "Refresh" for latest data

### Budget Management
- Set daily/weekly limits in the "Budget Caps" section
- When exceeded, red "Auto-Disable" button appears
- Click it to instantly disable expensive features
- System can also auto-disable automatically

### Snapshot Monitoring
- Price data age shown in "Price Data" widget
- If > 36h old, you'll see warnings
- Use "Rollback to Yesterday" if recent snapshots are bad

## 📊 Technical Details

### New API Endpoints
- `GET /api/admin/audit-pinboard` - Health dashboard data
- `POST /api/admin/monitor` - Automated monitoring checks

### New Utilities
- `lib/server/budgetEnforcement.ts` - Budget checking and auto-disable logic
- Integrates with your existing `app_config` and `admin_audit` tables

### Database Integration
- Uses existing `error_logs`, `ai_usage`, `price_snapshots` tables
- Respects your current `app_config` structure
- Follows your admin audit logging patterns

## 🔧 Optional Automation

### Cron Job Setup
Add this to your cron jobs for automated monitoring:
```bash
# Check every 30 minutes
*/30 * * * * curl -X POST https://your-domain.com/api/admin/monitor
```

### Webhook Integration
The monitor endpoint returns JSON you can integrate with:
- Discord/Slack notifications
- Email alerts  
- PagerDuty/monitoring services

## 🎯 What This Gives You

✅ **Proactive monitoring** - Catch issues before users do
✅ **Budget protection** - Never get surprise AI bills
✅ **Data quality assurance** - Know when price data is stale  
✅ **Operational visibility** - Single dashboard for system health
✅ **Automated responses** - System fixes itself when possible

The features are designed to be:
- **Non-breaking**: Won't interfere with existing functionality
- **Fail-safe**: Errors won't block normal operations
- **Lightweight**: Minimal performance impact
- **Extensible**: Easy to add more checks and alerts

Everything integrates seamlessly with your existing admin infrastructure!