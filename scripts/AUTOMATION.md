# Automated MTG Card Import

**Fully automate your local bulk imports!** No more manual clicking - let Windows Task Scheduler handle it.

## 🚀 Quick Setup

### Step 1: Setup Automation (One-time)
```powershell
# Run PowerShell as Administrator (right-click → "Run as Administrator")
.\scripts\setup-scheduler.ps1
```

### Step 2: Done! 
Your computer will now automatically:
- Start your dev server
- Run the bulk import 
- Stop the dev server
- All every Sunday at 3 AM

## 📅 Schedule Options

### Weekly (Default)
```powershell
.\scripts\setup-scheduler.ps1 -Schedule "Weekly" -Time "03:00"
```

### Daily Updates
```powershell
.\scripts\setup-scheduler.ps1 -Schedule "Daily" -Time "02:00"
```

### Custom Schedule
```powershell
# Every Friday at 6 PM
.\scripts\setup-scheduler.ps1 -Schedule "Weekly" -Time "18:00" -TaskName "MTG-Friday-Update"
```

## 🔧 How It Works

1. **Windows Task Scheduler** triggers at scheduled time
2. **auto-local-import.ps1** script runs:
   - Starts `npm run dev` in background
   - Waits for server to be ready
   - Calls `/api/cron/bulk-scryfall` endpoint
   - Processes ~1000 cards in ~13 seconds
   - Stops the dev server
   - Logs everything

3. **Your live website** automatically uses the fresh data

## 📊 Management Commands

```powershell
# Test run now (don't wait for schedule)
Start-ScheduledTask -TaskName "MTG-Card-Import"

# Check task status
Get-ScheduledTask -TaskName "MTG-Card-Import"

# View recent logs
Get-ChildItem "C:\Users\davy_\mtg_ai_assistant\logs" | Sort-Object LastWriteTime -Descending | Select-Object -First 5

# Delete the scheduled task
Unregister-ScheduledTask -TaskName "MTG-Card-Import"
```

## 📋 Logs

All automation runs create detailed logs in:
```
C:\Users\davy_\mtg_ai_assistant\logs\
```

Example log names:
- `auto-import-2025-10-04-03-00.log`
- `auto-import-2025-10-11-03-00.log`

## ✅ Benefits

- **🤖 Fully Automated** - Set it and forget it
- **🕒 Runs When You Sleep** - No interruption to your work
- **📊 Detailed Logging** - See exactly what happened
- **🔄 Reliable** - Uses the same local process that works perfectly
- **⚡ Fast** - ~13 seconds total, much faster than live server attempts
- **🎯 No More 502 Errors** - Bypasses all live server limitations

## 🛠️ Troubleshooting

### Task Not Running?
```powershell
# Check if task exists and is enabled
Get-ScheduledTask -TaskName "MTG-Card-Import"

# Check task history
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-TaskScheduler/Operational'; ID=200,201} | Where-Object {$_.Message -like "*MTG-Card-Import*"} | Select-Object -First 5
```

### View Last Run Result
```powershell
Get-ScheduledTask -TaskName "MTG-Card-Import" | Get-ScheduledTaskInfo
```

### Manual Test
```powershell
# Test the automation script manually
.\scripts\auto-local-import.ps1
```

## 🎉 Perfect Workflow

1. **One-time setup**: Run `setup-scheduler.ps1` as Administrator
2. **Automatic updates**: Every Sunday at 3 AM, fresh cards imported
3. **Live website**: Always has up-to-date card data
4. **Zero maintenance**: Logs tell you everything is working

**Your bulk import problem is completely solved!** 🎊