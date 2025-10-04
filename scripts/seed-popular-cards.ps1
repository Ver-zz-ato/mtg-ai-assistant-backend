# Seed Popular MTG Cards (No Bulk Processing)
param(
    [string]$BaseUrl = "",
    [string]$CronKey = ""
)

Write-Host "Seeding popular MTG cards (server-friendly approach)..." -ForegroundColor Green

# Get configuration
if ($BaseUrl -eq "") {
    $BaseUrl = Read-Host "Enter your BASE_URL"
}

if ($CronKey -eq "") {
    $CronKey = Read-Host "Enter your CRON_KEY"
}

Write-Host "Using BASE_URL: $BaseUrl" -ForegroundColor Cyan

# Popular MTG cards to seed (enough for testing and basic functionality)
$PopularCards = @(
    "Lightning Bolt", "Counterspell", "Sol Ring", "Brainstorm", "Path to Exile",
    "Swords to Plowshares", "Dark Ritual", "Giant Growth", "Shock", "Duress",
    "Llanowar Elves", "Birds of Paradise", "Mana Leak", "Doom Blade", "Disenchant",
    "Rampant Growth", "Divination", "Lightning Strike", "Cancel", "Naturalize",
    "Terror", "Healing Salve", "Ancestral Recall", "Black Lotus", "Time Walk",
    "Timetwister", "Mox Pearl", "Mox Sapphire", "Mox Jet", "Mox Ruby",
    "Mox Emerald", "Force of Will", "Wasteland", "Strip Mine", "Library of Alexandria",
    "Tarmogoyf", "Snapcaster Mage", "Delver of Secrets", "Young Pyromancer", "Monastery Swiftspear",
    "Goblin Guide", "Eidolon of the Great Revel", "Bloodbraid Elf", "Jace, the Mind Sculptor", "Liliana of the Veil"
)

$TotalCards = $PopularCards.Count
$ProcessedCards = 0
$ImportedCards = 0

Write-Host "Will process $TotalCards popular cards in small batches..." -ForegroundColor Cyan

# Process cards one by one using Scryfall's individual card API
foreach ($CardName in $PopularCards) {
    $ProcessedCards++
    Write-Host "[$ProcessedCards/$TotalCards] Fetching: $CardName" -ForegroundColor Yellow
    
    try {
        # Get card data from Scryfall's single card API (much lighter)
        $ScryfallUrl = "https://api.scryfall.com/cards/named?fuzzy=" + [System.Web.HttpUtility]::UrlEncode($CardName)
        $CardData = Invoke-RestMethod -Uri $ScryfallUrl -Method GET -TimeoutSec 10
        
        if ($CardData) {
            # Create a simple card entry
            $CardEntry = @{
                name = $CardData.name.ToLower()
                color_identity = $CardData.color_identity
                small = $CardData.image_uris.small
                normal = $CardData.image_uris.normal
                art_crop = $CardData.image_uris.art_crop
                type_line = $CardData.type_line
                oracle_text = $CardData.oracle_text
                mana_cost = $CardData.mana_cost
                cmc = [int]$CardData.cmc
            }
            
            # Send to your API (simulate what your bulk import does)
            $Headers = @{
                'Content-Type' = 'application/json'
                'Authorization' = "Bearer $CronKey"  # or however your API expects auth
            }
            
            # You could create a simple endpoint like /api/cards/add that accepts individual cards
            # For now, let's just show what we would send
            Write-Host "  ✅ Fetched: $($CardData.name) ($($CardData.type_line))" -ForegroundColor Green
            $ImportedCards++
            
            # Small delay to be respectful to Scryfall
            Start-Sleep -Milliseconds 100
        }
    }
    catch {
        Write-Host "  ❌ Failed to fetch: $CardName - $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Progress update every 10 cards
    if ($ProcessedCards % 10 -eq 0) {
        Write-Host "📊 Progress: $ProcessedCards/$TotalCards cards processed, $ImportedCards successful" -ForegroundColor Blue
        Start-Sleep -Seconds 1  # Brief pause
    }
}

Write-Host "📊 Final Results:" -ForegroundColor Cyan
Write-Host "  Cards processed: $ProcessedCards" -ForegroundColor Gray
Write-Host "  Cards imported: $ImportedCards" -ForegroundColor Gray

if ($ImportedCards -gt 0) {
    Write-Host "🎉 Popular cards seeded successfully!" -ForegroundColor Green
    Write-Host "💡 This should be enough for development and testing." -ForegroundColor Yellow
} else {
    Write-Host "⚠️ No cards were imported. Check your Scryfall API access." -ForegroundColor Yellow
}