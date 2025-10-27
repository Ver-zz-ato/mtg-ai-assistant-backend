# Test script for the 3 consolidated admin jobs (PowerShell version)
# Run this to verify all endpoints are working before relying on GitHub Actions

Write-Host "🧪 Testing Admin Jobs Endpoints" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$BaseUrl = "https://www.manatap.ai"
$CronKey = "Boobies"

# Test function
function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$ExpectedDuration
    )
    
    Write-Host "📋 Testing: $Name" -ForegroundColor Yellow
    Write-Host "🌐 URL: $Url"
    Write-Host "⏱️  Expected duration: $ExpectedDuration"
    Write-Host ""
    
    $StartTime = Get-Date
    
    try {
        # Make request
        $Headers = @{
            "x-cron-key" = $CronKey
            "Content-Type" = "application/json"
            "User-Agent" = "Test-Script-PowerShell/1.0"
        }
        
        $Response = Invoke-WebRequest -Uri $Url -Method POST -Headers $Headers -TimeoutSec 600
        $EndTime = Get-Date
        $Duration = ($EndTime - $StartTime).TotalSeconds
        
        $StatusCode = $Response.StatusCode
        $Body = $Response.Content | ConvertFrom-Json
        
        Write-Host "📡 HTTP Status: $StatusCode" -ForegroundColor Green
        Write-Host "⏱️  Actual duration: $([math]::Round($Duration))s"
        Write-Host ""
        Write-Host "✅ SUCCESS" -ForegroundColor Green
        Write-Host "📄 Response:"
        $Body | ConvertTo-Json -Depth 10
        Write-Host ""
        Write-Host "----------------------------------------"
        Write-Host ""
        
        return $true
    }
    catch {
        $EndTime = Get-Date
        $Duration = ($EndTime - $StartTime).TotalSeconds
        
        Write-Host "📡 HTTP Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
        Write-Host "⏱️  Duration before error: $([math]::Round($Duration))s"
        Write-Host ""
        Write-Host "❌ FAILED" -ForegroundColor Red
        Write-Host "📄 Error: $($_.Exception.Message)"
        
        if ($_.Exception.Response) {
            $Reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $ErrorBody = $Reader.ReadToEnd()
            Write-Host "Response body: $ErrorBody"
        }
        
        Write-Host ""
        Write-Host "----------------------------------------"
        Write-Host ""
        
        return $false
    }
}

# Test 1: Bulk Scryfall Import
Write-Host "🎨 JOB 1: Bulk Scryfall Import" -ForegroundColor Magenta
Write-Host "Purpose: Downloads 110k+ cards with metadata"
Write-Host "Target: scryfall_cache table (metadata fields)"
Write-Host ""

$Job1Result = Test-Endpoint `
    -Name "Bulk Scryfall Import" `
    -Url "$BaseUrl/api/cron/bulk-scryfall" `
    -ExpectedDuration "3-5 minutes"

Write-Host "⏸️  Waiting 10 seconds before next test..." -ForegroundColor Gray
Start-Sleep -Seconds 10

# Test 2: Bulk Price Import
Write-Host "💰 JOB 2: Bulk Price Import" -ForegroundColor Magenta
Write-Host "Purpose: Updates prices for all cached cards"
Write-Host "Target: scryfall_cache table (price fields)"
Write-Host ""

$Job2Result = Test-Endpoint `
    -Name "Bulk Price Import" `
    -Url "$BaseUrl/api/cron/bulk-price-import" `
    -ExpectedDuration "3-5 minutes"

Write-Host "⏸️  Waiting 10 seconds before next test..." -ForegroundColor Gray
Start-Sleep -Seconds 10

# Test 3: Historical Snapshots
Write-Host "📈 JOB 3: Historical Price Snapshots" -ForegroundColor Magenta
Write-Host "Purpose: Creates historical price snapshots"
Write-Host "Target: price_snapshots table"
Write-Host ""

$Job3Result = Test-Endpoint `
    -Name "Historical Price Snapshots" `
    -Url "$BaseUrl/api/admin/price/snapshot/bulk" `
    -ExpectedDuration "2-3 minutes"

# Summary
Write-Host ""
Write-Host "🎉 ========================================" -ForegroundColor Cyan
Write-Host "🎉 TEST SUMMARY" -ForegroundColor Cyan
Write-Host "🎉 ========================================" -ForegroundColor Cyan
Write-Host ""

if ($Job1Result) {
    Write-Host "🎨 Job 1 (Metadata):  PASSED" -ForegroundColor Green
} else {
    Write-Host "🎨 Job 1 (Metadata):  FAILED" -ForegroundColor Red
}

if ($Job2Result) {
    Write-Host "💰 Job 2 (Prices):    PASSED" -ForegroundColor Green
} else {
    Write-Host "💰 Job 2 (Prices):    FAILED" -ForegroundColor Red
}

if ($Job3Result) {
    Write-Host "📈 Job 3 (Snapshots): PASSED" -ForegroundColor Green
} else {
    Write-Host "📈 Job 3 (Snapshots): FAILED" -ForegroundColor Red
}

Write-Host ""

# Overall result
if ($Job1Result -and $Job2Result -and $Job3Result) {
    Write-Host "✅ All tests passed! Ready for GitHub Actions automation." -ForegroundColor Green
    exit 0
} else {
    Write-Host "❌ Some tests failed. Fix issues before enabling automation." -ForegroundColor Red
    exit 1
}

