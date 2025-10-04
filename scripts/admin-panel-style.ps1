# Admin Panel Style Bulk Import
param(
    [string]$BaseUrl = "",
    [string]$CronKey = ""
)

Write-Host "Starting bulk import (admin panel style)..." -ForegroundColor Green

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

# Run bulk import exactly like admin panel does (no streaming headers)
Write-Host "Starting bulk import (may take 5-10 minutes)..." -ForegroundColor Green

$ImportHeaders = @{
    'x-cron-key' = $CronKey
    'Content-Type' = 'application/json'
}

Write-Host "Processing all cards in single request (like admin panel)..." -ForegroundColor Yellow

try {
    $ImportResponse = Invoke-RestMethod -Uri $TestUrl -Method POST -Headers $ImportHeaders -TimeoutSec 600
    
    if ($ImportResponse.ok) {
        Write-Host "✅ Bulk import completed successfully!" -ForegroundColor Green
        Write-Host "📊 Results:" -ForegroundColor Cyan
        Write-Host "  Cards imported: $($ImportResponse.imported)" -ForegroundColor Gray
        Write-Host "  Cards processed: $($ImportResponse.processed)" -ForegroundColor Gray
        Write-Host "  Total cards: $($ImportResponse.total_cards)" -ForegroundColor Gray
    } else {
        Write-Host "❌ Import failed: $($ImportResponse.error)" -ForegroundColor Red
    }
}
catch {
    Write-Host "❌ Import failed: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Message -like "*502*") {
        Write-Host "💡 Server overloaded. Try using the admin panel instead, or wait and try again later." -ForegroundColor Yellow
    }
}

Write-Host "Bulk import attempt completed." -ForegroundColor Green