# Incremental Scryfall Update (No Bulk Downloads)
param(
    [string]$BaseUrl = "",
    [string]$CronKey = ""
)

Write-Host "Starting incremental Scryfall update (no bulk downloads)..." -ForegroundColor Green

# Get configuration
if ($BaseUrl -eq "") {
    $BaseUrl = Read-Host "Enter your BASE_URL"
}

if ($CronKey -eq "") {
    $CronKey = Read-Host "Enter your CRON_KEY"
}

Write-Host "Using BASE_URL: $BaseUrl" -ForegroundColor Cyan

# Test endpoint first
Write-Host "Testing endpoint..." -ForegroundColor Yellow

$TestHeaders = @{
    'x-cron-key' = $CronKey
    'x-test-mode' = 'true'
    'Content-Type' = 'application/json'
}

$TestUrl = "$BaseUrl/api/cron/bulk-scryfall"

try {
    $TestResponse = Invoke-RestMethod -Uri $TestUrl -Method POST -Headers $TestHeaders -TimeoutSec 30
    
    if ($TestResponse.ok) {
        Write-Host "Test successful!" -ForegroundColor Green
    } else {
        Write-Host "Test failed!" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "Test failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "Using small incremental requests (no server overload)..." -ForegroundColor Green

# Process in very small chunks to avoid 502 errors
$Page = 0
$BatchSize = 50  # Very small batches
$TotalImported = 0
$MaxPages = 100
$SuccessfulPages = 0

while ($Page -le $MaxPages) {
    $ChunkStart = $Page * $BatchSize
    Write-Host "Processing cards $ChunkStart-$($ChunkStart + $BatchSize)..." -ForegroundColor Cyan
    
    $ChunkHeaders = @{
        'x-cron-key' = $CronKey
        'x-use-streaming' = 'false'
        'x-chunk-start' = $ChunkStart.ToString()
        'x-chunk-size' = $BatchSize.ToString()
        'Content-Type' = 'application/json'
    }
    
    try {
        $ChunkResponse = Invoke-RestMethod -Uri $TestUrl -Method POST -Headers $ChunkHeaders -TimeoutSec 90
        
        if ($ChunkResponse.ok) {
            $Imported = if ($ChunkResponse.imported) { $ChunkResponse.imported } else { 0 }
            $TotalImported += $Imported
            $SuccessfulPages++
            
            Write-Host "✅ Batch completed: $Imported cards imported. Total: $TotalImported" -ForegroundColor Green
            
            # Check if we're done
            if ($ChunkResponse.is_last_chunk -eq $true -or $Imported -eq 0) {
                Write-Host "🎉 All available cards processed!" -ForegroundColor Green
                break
            }
            
            # Small delay to be nice to server
            Start-Sleep -Seconds 3
        } else {
            Write-Host "❌ Batch failed: $($ChunkResponse.error)" -ForegroundColor Red
            
            # If we've had some success, don't fail completely
            if ($SuccessfulPages -gt 0) {
                Write-Host "⚠️ Continuing with next batch..." -ForegroundColor Yellow
            } else {
                Write-Host "❌ No successful batches, stopping." -ForegroundColor Red
                break
            }
        }
    }
    catch {
        Write-Host "❌ Batch error: $($_.Exception.Message)" -ForegroundColor Red
        
        # If it's a 502 error and we've had some success, continue
        if ($_.Exception.Message -like "*502*" -and $SuccessfulPages -gt 0) {
            Write-Host "⚠️ Server overloaded, taking longer break..." -ForegroundColor Yellow
            Start-Sleep -Seconds 10
        } else {
            Write-Host "❌ Stopping due to repeated failures." -ForegroundColor Red
            break
        }
    }
    
    $Page++
    
    # Progress update every 10 batches
    if ($Page % 10 -eq 0) {
        Write-Host "📊 Progress: $Page batches processed, $TotalImported total cards imported" -ForegroundColor Blue
    }
}

Write-Host "📊 Final Results:" -ForegroundColor Cyan
Write-Host "  Successful batches: $SuccessfulPages" -ForegroundColor Gray
Write-Host "  Total cards imported: $TotalImported" -ForegroundColor Gray

if ($TotalImported -gt 0) {
    Write-Host "🎉 Incremental update completed successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠️ No cards were imported. Server may be overloaded." -ForegroundColor Yellow
}