# frontend/scripts/run-bulk-scryfall-local.ps1
# Automates the bulk Scryfall import by starting the dev server and triggering the job
#
# Usage: .\scripts\run-bulk-scryfall-local.ps1 [-Clean]
#   -Clean  Clear .next cache before starting (fixes "ENOENT @opentelemetry" / stuck startup)

param([switch]$Clean)

Write-Host "Bulk Scryfall Import - Local Automation" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script's directory and navigate to frontend folder
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = if ($ScriptDir -like "*scripts*") { Split-Path -Parent $ScriptDir } else { $ScriptDir }

# Change to frontend directory
Push-Location $FrontendDir

try {
    # Configuration
    $Port = 3000
    $LocalUrl = "http://localhost:$Port"
    $Endpoint = "$LocalUrl/api/cron/bulk-scryfall"
    $CronKey = $env:CRON_KEY

    if (-not $CronKey) {
        Write-Host "WARNING: CRON_KEY not found in environment variables" -ForegroundColor Yellow
        Write-Host "TIP: You can set it in your .env.local file or export it" -ForegroundColor Gray
        Write-Host "TIP: Alternatively, run: `$env:CRON_KEY='your-key'; .\scripts\run-bulk-scryfall-local.ps1" -ForegroundColor Gray
        Write-Host ""
        $prompt = Read-Host "Enter CRON_KEY (or press Enter to skip auth - requires admin session)"
        if ($prompt) {
            $CronKey = $prompt
        }
    }

    # Step 1: Check if server is already running
    Write-Host "Checking if server is already running..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "$LocalUrl" -Method GET -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        Write-Host "OK: Server is already running on port $Port" -ForegroundColor Green
        $ServerAlreadyRunning = $true
    } catch {
        $ServerAlreadyRunning = $false
        Write-Host "INFO: Server not running, will start it..." -ForegroundColor Gray
    }

    # Step 2: Start dev server if not running
    $DevServerProcess = $null
    if (-not $ServerAlreadyRunning) {
        if ($Clean) {
            $NextDir = Join-Path $FrontendDir ".next"
            if (Test-Path $NextDir) {
                Write-Host ""
                Write-Host "Clearing .next cache (-Clean)..." -ForegroundColor Yellow
                Remove-Item -Recurse -Force $NextDir -ErrorAction SilentlyContinue
                Write-Host "OK: Cache cleared" -ForegroundColor Green
            }
        }
        Write-Host ""
        Write-Host "Starting Next.js dev server..." -ForegroundColor Yellow
        Write-Host "   (This may take 30-60 seconds to compile)" -ForegroundColor Gray
        
        # Start npm run dev in background
        # Use cmd.exe to properly execute npm (avoids file association issues)
        $CurrentDir = Get-Location
        $DevServerProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" -PassThru -WindowStyle Hidden -WorkingDirectory $CurrentDir
        
        Write-Host "Waiting for server to be ready..." -ForegroundColor Yellow
        
        # Wait for server to be ready (check every 2 seconds, max 120 seconds)
        $MaxWaitTime = 120
        $WaitInterval = 2
        $Elapsed = 0
        $Ready = $false
        
        while ($Elapsed -lt $MaxWaitTime -and -not $Ready) {
            Start-Sleep -Seconds $WaitInterval
            $Elapsed += $WaitInterval
            
            try {
                $testResponse = Invoke-WebRequest -Uri "$LocalUrl" -Method GET -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
                $Ready = $true
                $secondsText = "$Elapsed seconds"
                Write-Host "Server is ready! (took ~$secondsText)" -ForegroundColor Green
            } catch {
                if ($Elapsed % 10 -eq 0) {
                    $waitText = "$Elapsed of $MaxWaitTime seconds"
                    Write-Host "   Still waiting... ($waitText)" -ForegroundColor Gray
                }
            }
        }
        
        if (-not $Ready) {
            Write-Host "ERROR: Server failed to start within $MaxWaitTime seconds" -ForegroundColor Red
            Write-Host "TIP: Try running with -Clean to clear corrupted .next cache:" -ForegroundColor Yellow
            Write-Host "     .\scripts\run-bulk-scryfall-local.ps1 -Clean" -ForegroundColor Gray
            if ($DevServerProcess) {
                Stop-Process -Id $DevServerProcess.Id -Force -ErrorAction SilentlyContinue
            }
            Pop-Location
            Read-Host "Press Enter to exit"
            exit 1
        }
    }

    # Step 3: Trigger the bulk import
    Write-Host ""
    Write-Host "Triggering Bulk Scryfall Import..." -ForegroundColor Cyan
    Write-Host "Endpoint: $Endpoint" -ForegroundColor Gray
    Write-Host "This will take 3-5 minutes. Watch console for progress..." -ForegroundColor Yellow
    Write-Host ""

    $StartTime = Get-Date

    try {
        $Headers = @{
            "Content-Type" = "application/json"
            "User-Agent" = "Local-Automation-Script/1.0"
        }
        
        if ($CronKey) {
            $Headers["x-cron-key"] = $CronKey
            Write-Host "Using CRON_KEY authentication" -ForegroundColor Gray
        } else {
            Write-Host "WARNING: No CRON_KEY - will attempt admin session auth" -ForegroundColor Yellow
        }
        
        # Make the request (with long timeout for the import)
        $Response = Invoke-WebRequest -Uri $Endpoint -Method POST -Headers $Headers -TimeoutSec 600 -UseBasicParsing -ErrorAction Stop
        
        $EndTime = Get-Date
        $Duration = ($EndTime - $StartTime).TotalSeconds
        
        $StatusCode = $Response.StatusCode
        $Body = $Response.Content | ConvertFrom-Json
        
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "HTTP Status: $StatusCode" -ForegroundColor Green
        $minutes = [math]::Round($Duration / 60, 1)
        Write-Host "Duration: $([math]::Round($Duration))s ($minutes minutes)" -ForegroundColor Gray
        Write-Host ""
        
        if ($Body.ok) {
            Write-Host "SUCCESS!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Import Results:" -ForegroundColor Cyan
            Write-Host "   - Cards processed: $($Body.processed)" -ForegroundColor White
            Write-Host "   - Unique normalized names: $($Body.unique_normalized_names)" -ForegroundColor White
            Write-Host "   - Final cache entries: $($Body.final_cache_count)" -ForegroundColor White
            if ($Body.cache_entries_with_images) {
                Write-Host "   - Entries with images: $($Body.cache_entries_with_images)" -ForegroundColor White
            }
            Write-Host "   - Timestamp: $($Body.timestamp)" -ForegroundColor Gray
            Write-Host ""
            
            # Show full response
            Write-Host "Full Response:" -ForegroundColor Cyan
            $Body | ConvertTo-Json -Depth 10 | Write-Host
        } else {
            Write-Host "ERROR: Import reported failure" -ForegroundColor Red
            Write-Host "Error: $($Body.error)" -ForegroundColor Red
        }
        
    } catch {
        $EndTime = Get-Date
        $Duration = ($EndTime - $StartTime).TotalSeconds
        
        Write-Host ""
        Write-Host "REQUEST FAILED" -ForegroundColor Red
        Write-Host "Duration before error: $([math]::Round($Duration))s" -ForegroundColor Gray
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        
        if ($_.Exception.Response) {
            $StatusCode = $_.Exception.Response.StatusCode.value__
            Write-Host "HTTP Status: $StatusCode" -ForegroundColor Red
            
            try {
                $ErrorStream = $_.Exception.Response.GetResponseStream()
                $Reader = New-Object System.IO.StreamReader($ErrorStream)
                $ErrorBody = $Reader.ReadToEnd()
                Write-Host "Response: $ErrorBody" -ForegroundColor Red
            } catch {}
        }
    } finally {
        Write-Host ""
        Write-Host "INFO: Server is still running on $LocalUrl" -ForegroundColor Gray
        Write-Host "TIP: You can access it at $LocalUrl or stop it manually" -ForegroundColor Gray
        
        if (-not $ServerAlreadyRunning -and $DevServerProcess) {
            Write-Host ""
            $keepOpen = Read-Host "Keep server running? (Y/n)"
            if ($keepOpen -eq 'n' -or $keepOpen -eq 'N') {
                Write-Host "Stopping dev server..." -ForegroundColor Yellow
                Stop-Process -Id $DevServerProcess.Id -Force -ErrorAction SilentlyContinue
                Write-Host "OK: Server stopped" -ForegroundColor Green
            }
        }
    }
    
} finally {
    Pop-Location
    Write-Host ""
    Read-Host "Press Enter to exit"
}

