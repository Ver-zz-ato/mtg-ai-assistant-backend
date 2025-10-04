# Local Scryfall Cache Update Script
# Run this manually when you want to update your card database

param(
    [string]$BaseUrl = "",
    [string]$CronKey = "",
    [int]$BatchSize = 100,
    [int]$MaxPages = 50  # Limit to prevent runaway
)

Write-Host "🔥 Starting local Scryfall cache update..." -ForegroundColor Green

# Get environment variables if not provided
if (-not $BaseUrl) {
    $BaseUrl = $env:MTG_BASE_URL
    if (-not $BaseUrl) {
        $BaseUrl = Read-Host "Enter your BASE_URL (e.g., https://your-app.vercel.app)"
    }
}

if (-not $CronKey) {
    $CronKey = $env:MTG_CRON_KEY
    if (-not $CronKey) {
        $CronKey = Read-Host "Enter your CRON_KEY" -AsSecureString | ConvertFrom-SecureString -AsPlainText
    }
}

$TotalImported = 0
$Page = 1

Write-Host "📋 Configuration:" -ForegroundColor Cyan
Write-Host "  Base URL: $BaseUrl" -ForegroundColor Gray
Write-Host "  Batch Size: $BatchSize cards per request" -ForegroundColor Gray
Write-Host "  Max Pages: $MaxPages" -ForegroundColor Gray

# Test endpoint first
Write-Host "`n🧪 Testing endpoint..." -ForegroundColor Yellow
try {
    $TestHeaders = @{
        'x-cron-key' = $CronKey
        'x-test-mode' = 'true'
        'Content-Type' = 'application/json'
    }
    
    $TestUrl = "$BaseUrl/api/cron/bulk-scryfall"
    $TestResponse = Invoke-RestMethod -Uri $TestUrl -Method POST -Headers $TestHeaders -TimeoutSec 30
    
    if ($TestResponse.ok) {
        Write-Host "✅ Test successful! Database has $($TestResponse.sample_cache_entries) sample entries" -ForegroundColor Green
    } else {
        Write-Host "❌ Test failed: $($TestResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n🌊 Starting streaming import..." -ForegroundColor Green

# Use streaming mode for single batch processing
try {
    $StreamHeaders = @{
        'x-cron-key' = $CronKey
        'x-use-streaming' = 'true'
        'Content-Type' = 'application/json'
    }
    
    Write-Host "📦 Processing cards in streaming mode (this may take 2-5 minutes)..." -ForegroundColor Yellow
    $StreamResponse = Invoke-RestMethod -Uri $TestUrl -Method POST -Headers $StreamHeaders -TimeoutSec 300
    
    if ($StreamResponse.ok) {
        Write-Host "✅ Streaming import completed!" -ForegroundColor Green
        Write-Host "📊 Results:" -ForegroundColor Cyan
        Write-Host "  Cards imported: $($StreamResponse.imported)" -ForegroundColor Gray
        Write-Host "  Cards processed: $($StreamResponse.processed)" -ForegroundColor Gray
        Write-Host "  Total cards: $($StreamResponse.total_cards)" -ForegroundColor Gray
        Write-Host "  Cache count: $($StreamResponse.final_cache_count)" -ForegroundColor Gray
    } else {
        Write-Host "❌ Streaming failed: $($StreamResponse.error)" -ForegroundColor Red
        
        # Fallback to chunked mode
        Write-Host "`n🔄 Trying fallback chunked mode..." -ForegroundColor Yellow
        
        while ($Page -le $MaxPages) {
            Write-Host "Processing page $Page..." -ForegroundColor Cyan
            
            $ChunkHeaders = @{
                'x-cron-key' = $CronKey
                'x-use-streaming' = 'false'
                'x-chunk-start' = ($Page - 1) * $BatchSize
                'x-chunk-size' = $BatchSize
                'Content-Type' = 'application/json'
            }
            
            try {
                $ChunkResponse = Invoke-RestMethod -Uri $TestUrl -Method POST -Headers $ChunkHeaders -TimeoutSec 120
                
                if ($ChunkResponse.ok) {
                    $TotalImported += $ChunkResponse.imported
                    Write-Host "✅ Page $Page completed: $($ChunkResponse.imported) imported. Total: $TotalImported" -ForegroundColor Green
                    
                    if ($ChunkResponse.is_last_chunk) {
                        Write-Host "🎉 All pages completed!" -ForegroundColor Green
                        break
                    }
                    
                    $Page++
                    Start-Sleep -Seconds 2  # Be nice to the server
                } else {
                    Write-Host "❌ Page $Page failed: $($ChunkResponse.error)" -ForegroundColor Red
                    break
                }
            } catch {
                Write-Host "❌ Page $Page error: $($_.Exception.Message)" -ForegroundColor Red
                break
            }
        }
    }
} catch {
    Write-Host "❌ Import failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n🎉 Scryfall cache update completed!" -ForegroundColor Green
Write-Host "💡 You can run this script anytime to update your card database." -ForegroundColor Cyan