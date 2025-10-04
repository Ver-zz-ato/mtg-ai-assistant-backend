# Configure PC to Wake for Scheduled Tasks
# Run as Administrator to enable wake-from-sleep for task scheduling

Write-Host "⚡ Configuring PC wake settings for scheduled tasks..." -ForegroundColor Green

# Check if running as Administrator
$IsAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $IsAdmin) {
    Write-Host "❌ This script must be run as Administrator." -ForegroundColor Red
    Write-Host "💡 Right-click PowerShell and 'Run as Administrator', then run this script again." -ForegroundColor Yellow
    exit 1
}

Write-Host "🔧 Enabling wake timers in power settings..." -ForegroundColor Yellow

try {
    # Enable wake timers for both AC and battery power
    powercfg -setacvalueindex SCHEME_CURRENT 238C9FA8-0AAD-41ED-83F4-97BE242C8F20 BD3B718A-0680-4D9D-8AB2-E1D2B4AC806D 1
    powercfg -setdcvalueindex SCHEME_CURRENT 238C9FA8-0AAD-41ED-83F4-97BE242C8F20 BD3B718A-0680-4D9D-8AB2-E1D2B4AC806D 1
    powercfg -setactive SCHEME_CURRENT
    
    Write-Host "✅ Wake timers enabled" -ForegroundColor Green
    
    # Check network adapter wake capabilities
    Write-Host "🌐 Checking network adapters for wake capabilities..." -ForegroundColor Yellow
    
    $NetworkAdapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
    
    foreach ($Adapter in $NetworkAdapters) {
        Write-Host "  Adapter: $($Adapter.Name)" -ForegroundColor Cyan
        
        # Enable wake-on-LAN if supported
        try {
            $WakeCapable = Get-NetAdapterPowerManagement -Name $Adapter.Name -ErrorAction SilentlyContinue
            if ($WakeCapable) {
                Set-NetAdapterPowerManagement -Name $Adapter.Name -WakeOnMagicPacket Enabled -ErrorAction SilentlyContinue
                Write-Host "    ✅ Wake-on-LAN enabled" -ForegroundColor Green
            } else {
                Write-Host "    ⚠️ Wake-on-LAN not supported" -ForegroundColor Yellow
            }
        }
        catch {
            Write-Host "    ⚠️ Could not configure wake settings" -ForegroundColor Yellow
        }
    }
    
    Write-Host "`n💡 Additional Recommendations:" -ForegroundColor Cyan
    Write-Host "  1. Set your PC to Sleep instead of Hibernate or Shutdown" -ForegroundColor Gray
    Write-Host "  2. In Power Options, allow wake timers" -ForegroundColor Gray
    Write-Host "  3. Ensure your PC is plugged in (wake timers work better on AC power)" -ForegroundColor Gray
    
    Write-Host "`n🔍 Testing wake capability..." -ForegroundColor Yellow
    
    # Create a test task that wakes in 2 minutes
    $TestTime = (Get-Date).AddMinutes(2).ToString("HH:mm")
    $TestDate = (Get-Date).ToString("MM/dd/yyyy")
    
    Write-Host "Creating test wake task for $TestDate at $TestTime..." -ForegroundColor Gray
    
    $TestAction = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-Command `"Write-Host 'Wake test successful!' -ForegroundColor Green; Start-Sleep 5`""
    $TestTrigger = New-ScheduledTaskTrigger -Once -At "$TestDate $TestTime"
    $TestSettings = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries
    $TestPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
    
    $TestTask = New-ScheduledTask -Action $TestAction -Trigger $TestTrigger -Settings $TestSettings -Principal $TestPrincipal -Description "Test wake capability - will auto-delete"
    Register-ScheduledTask -TaskName "MTG-Wake-Test" -InputObject $TestTask
    
    Write-Host "✅ Test task created! Your PC should wake up in 2 minutes." -ForegroundColor Green
    Write-Host "   If it wakes successfully, the wake settings are working!" -ForegroundColor Cyan
    Write-Host "   The test task will automatically be deleted afterward." -ForegroundColor Gray
    
    # Schedule the test task to delete itself after running
    Start-Sleep -Seconds 5
    $DeleteAction = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-Command `"Unregister-ScheduledTask -TaskName 'MTG-Wake-Test' -Confirm:`$false`""
    $DeleteTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(3).ToString("MM/dd/yyyy HH:mm")
    $DeleteSettings = New-ScheduledTaskSettingsSet
    $DeletePrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
    
    $DeleteTask = New-ScheduledTask -Action $DeleteAction -Trigger $DeleteTrigger -Settings $DeleteSettings -Principal $DeletePrincipal -Description "Cleanup test task"
    Register-ScheduledTask -TaskName "MTG-Wake-Test-Cleanup" -InputObject $DeleteTask
    
    Write-Host "`n🎉 Wake settings configured successfully!" -ForegroundColor Green
    Write-Host "Your PC should now wake up for scheduled MTG imports." -ForegroundColor Cyan
    
}
catch {
    Write-Host "❌ Failed to configure wake settings: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 You may need to manually enable wake timers in Power Options." -ForegroundColor Yellow
}