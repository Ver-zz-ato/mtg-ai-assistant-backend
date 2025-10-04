# Setup Windows Task Scheduler for Automated MTG Card Import
# Run this script as Administrator to create the scheduled task

param(
    [string]$TaskName = "MTG-Card-Import",
    [string]$Schedule = "Weekly",  # Weekly, Daily, or specify time
    [string]$Time = "03:00"        # 3 AM
)

Write-Host "🕒 Setting up Windows Task Scheduler for automated MTG card imports..." -ForegroundColor Green

# Check if running as Administrator
$IsAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $IsAdmin) {
    Write-Host "❌ This script must be run as Administrator to create scheduled tasks." -ForegroundColor Red
    Write-Host "💡 Right-click PowerShell and 'Run as Administrator', then run this script again." -ForegroundColor Yellow
    exit 1
}

$ScriptPath = "C:\Users\davy_\mtg_ai_assistant\scripts\auto-local-import.ps1"
$LogPath = "C:\Users\davy_\mtg_ai_assistant\logs"

# Create logs directory
if (!(Test-Path $LogPath)) {
    New-Item -ItemType Directory -Path $LogPath -Force
    Write-Host "📁 Created logs directory: $LogPath" -ForegroundColor Green
}

# Check if the automation script exists
if (!(Test-Path $ScriptPath)) {
    Write-Host "❌ Automation script not found: $ScriptPath" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Task Configuration:" -ForegroundColor Cyan
Write-Host "  Task Name: $TaskName" -ForegroundColor Gray
Write-Host "  Schedule: $Schedule" -ForegroundColor Gray
Write-Host "  Time: $Time" -ForegroundColor Gray
Write-Host "  Script: $ScriptPath" -ForegroundColor Gray

try {
    # Remove existing task if it exists
    $ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($ExistingTask) {
        Write-Host "🗑️ Removing existing task..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }

    # Create the action (what to run)
    $Action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -File `"$ScriptPath`""

    # Create the trigger (when to run)
    if ($Schedule -eq "Weekly") {
        $Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At $Time
        Write-Host "📅 Scheduled for: Every Sunday at $Time" -ForegroundColor Green
    }
    elseif ($Schedule -eq "Daily") {
        $Trigger = New-ScheduledTaskTrigger -Daily -At $Time
        Write-Host "📅 Scheduled for: Every day at $Time" -ForegroundColor Green
    }
    else {
        # Custom time format: "MM/dd/yyyy HH:mm"
        $Trigger = New-ScheduledTaskTrigger -Once -At $Schedule
        Write-Host "📅 Scheduled for: $Schedule (one-time)" -ForegroundColor Green
    }

    # Create the settings (including wake from sleep)
    $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable -WakeToRun

    # Create the principal (run as current user)
    $Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

    # Register the task
    $Task = New-ScheduledTask -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "Automated MTG card import using local development server"
    
    Register-ScheduledTask -TaskName $TaskName -InputObject $Task

    Write-Host "✅ Task '$TaskName' created successfully!" -ForegroundColor Green
    Write-Host "📊 Task Details:" -ForegroundColor Cyan
    
    $CreatedTask = Get-ScheduledTask -TaskName $TaskName
    Write-Host "  Status: $($CreatedTask.State)" -ForegroundColor Gray
    Write-Host "  Next Run: $((Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo).NextRunTime)" -ForegroundColor Gray
    
    Write-Host "`n💡 Management Options:" -ForegroundColor Yellow
    Write-Host "  View task: Get-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
    Write-Host "  Run now: Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
    Write-Host "  Delete task: Unregister-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Gray
    Write-Host "  View logs: Get-ChildItem '$LogPath' | Sort-Object LastWriteTime -Descending" -ForegroundColor Gray
    
    Write-Host "`n🎉 Automation setup complete!" -ForegroundColor Green
    Write-Host "Your MTG card database will update automatically $Schedule at $Time" -ForegroundColor Cyan
}
catch {
    Write-Host "❌ Failed to create scheduled task: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}