# Fetch decks from MTGGoldfish and create CSVs for import
# Usage: .\scripts\fetch-mtggoldfish-decks.ps1

param(
    [int]$DecksPerFormat = 50,
    [string]$OutputDir = "scripts/deck-imports"
)

$ErrorActionPreference = "Continue"

# Create output directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = Split-Path -Parent $ScriptDir
$OutputPath = Join-Path $FrontendDir $OutputDir
if (-not (Test-Path $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
}

Write-Host "MTGGoldfish Deck Fetcher" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host "Fetching $DecksPerFormat decks per format..." -ForegroundColor Yellow
Write-Host ""

# Fetch deck IDs dynamically from archetype pages
function Get-DeckIdsFromArchetype {
    param([string]$ArchetypeUrl, [int]$MaxDecks = 5)
    
    try {
        $response = Invoke-WebRequest -Uri $ArchetypeUrl -UseBasicParsing -TimeoutSec 15
        $content = $response.Content
        
        # Find deck IDs in the page
        $matches = [regex]::Matches($content, '/deck/(\d{7})#')
        $ids = @()
        foreach ($m in $matches) {
            $id = [int]$m.Groups[1].Value
            if ($ids -notcontains $id) {
                $ids += $id
                if ($ids.Count -ge $MaxDecks) { break }
            }
        }
        return $ids
    } catch {
        Write-Host "  Failed to fetch archetype: $ArchetypeUrl" -ForegroundColor Red
        return @()
    }
}

# Modern archetypes
$ModernArchetypes = @(
    "https://www.mtggoldfish.com/archetype/modern-boros-energy#paper",
    "https://www.mtggoldfish.com/archetype/modern-ruby-storm#paper",
    "https://www.mtggoldfish.com/archetype/eldrazi-tron#paper",
    "https://www.mtggoldfish.com/archetype/modern-affinity#paper",
    "https://www.mtggoldfish.com/archetype/modern-jeskai-blink#paper",
    "https://www.mtggoldfish.com/archetype/modern-domain-zoo#paper",
    "https://www.mtggoldfish.com/archetype/modern-eldrazi-ramp#paper",
    "https://www.mtggoldfish.com/archetype/modern-dimir-midrange#paper",
    "https://www.mtggoldfish.com/archetype/amulet-titan#paper",
    "https://www.mtggoldfish.com/archetype/neobrand#paper"
)

# Pioneer archetypes
$PioneerArchetypes = @(
    "https://www.mtggoldfish.com/archetype/pioneer-mono-red-prowess#paper",
    "https://www.mtggoldfish.com/archetype/pioneer-abzan-greasefang#paper",
    "https://www.mtggoldfish.com/archetype/pioneer-izzet-prowess#paper",
    "https://www.mtggoldfish.com/archetype/pioneer-azorius-control#paper",
    "https://www.mtggoldfish.com/archetype/pioneer-golgari-midrange#paper",
    "https://www.mtggoldfish.com/archetype/pioneer-selesnya-company#paper",
    "https://www.mtggoldfish.com/archetype/pioneer-orzhov-greasefang#paper",
    "https://www.mtggoldfish.com/archetype/pioneer-orzhov-midrange#paper",
    "https://www.mtggoldfish.com/archetype/izzet-phoenix-57eb17e3-2b71-4301-99a6-45002ffcfadb#paper",
    "https://www.mtggoldfish.com/archetype/pioneer-sultai-scapeshift#paper"
)

# Standard archetypes
$StandardArchetypes = @(
    "https://www.mtggoldfish.com/archetype/standard-dimir-midrange#paper",
    "https://www.mtggoldfish.com/archetype/standard-mono-red-aggro#paper",
    "https://www.mtggoldfish.com/archetype/standard-azorius-control#paper",
    "https://www.mtggoldfish.com/archetype/standard-boros-mice#paper",
    "https://www.mtggoldfish.com/archetype/standard-gruul-prowess#paper",
    "https://www.mtggoldfish.com/archetype/standard-4c-legends#paper",
    "https://www.mtggoldfish.com/archetype/standard-mardu-midrange#paper",
    "https://www.mtggoldfish.com/archetype/standard-golgari-midrange#paper",
    "https://www.mtggoldfish.com/archetype/standard-simic-scapeshift#paper",
    "https://www.mtggoldfish.com/archetype/standard-izzet-prowess#paper"
)

function Fetch-Deck {
    param([int]$DeckId, [string]$Format)
    
    $url = "https://www.mtggoldfish.com/deck/download/$DeckId"
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
        $content = $response.Content.Trim()
        
        # Parse the deck name from the deck page
        $pageUrl = "https://www.mtggoldfish.com/deck/$DeckId"
        $pageResponse = Invoke-WebRequest -Uri $pageUrl -UseBasicParsing -TimeoutSec 10
        $titleMatch = [regex]::Match($pageResponse.Content, '<title>([^<]+)</title>')
        $title = if ($titleMatch.Success) { 
            $titleMatch.Groups[1].Value -replace ' Deck for Magic: the Gathering', '' -replace ' by .+$', ''
        } else { 
            "$Format Deck $DeckId" 
        }
        $title = $title.Trim()
        
        # Split main deck and sideboard
        $parts = $content -split "`n`n"
        $mainDeck = $parts[0].Trim()
        
        return @{
            Title = $title
            Format = $Format
            Decklist = $mainDeck
            Success = $true
        }
    } catch {
        Write-Host "  Failed to fetch deck $DeckId : $($_.Exception.Message)" -ForegroundColor Red
        return @{ Success = $false }
    }
}

function Create-CSV {
    param([array]$Decks, [string]$Format, [string]$OutputFile)
    
    $csvContent = "title,commander,format,decklist`n"
    
    foreach ($deck in $Decks) {
        if ($deck.Success) {
            $title = $deck.Title -replace '"', '""'
            $decklist = $deck.Decklist -replace '"', '""'
            $csvContent += "`"$title`",`"`",$Format,`"$decklist`"`n"
        }
    }
    
    $csvContent | Out-File -FilePath $OutputFile -Encoding UTF8 -Force
    Write-Host "Created: $OutputFile" -ForegroundColor Green
}

function Fetch-DecksForFormat {
    param([array]$Archetypes, [string]$Format, [int]$MaxTotal)
    
    Write-Host "`nFetching $Format decks..." -ForegroundColor Yellow
    $decks = @()
    $decksPerArchetype = [math]::Ceiling($MaxTotal / $Archetypes.Count)
    
    foreach ($archetypeUrl in $Archetypes) {
        if ($decks.Count -ge $MaxTotal) { break }
        
        $archetypeName = [regex]::Match($archetypeUrl, '/archetype/[^/]+-([^#]+)').Groups[1].Value
        Write-Host "  Archetype: $archetypeName" -ForegroundColor Cyan
        
        $ids = Get-DeckIdsFromArchetype -ArchetypeUrl $archetypeUrl -MaxDecks $decksPerArchetype
        Start-Sleep -Milliseconds 300
        
        foreach ($id in $ids) {
            if ($decks.Count -ge $MaxTotal) { break }
            Write-Host "    Fetching deck $id..." -ForegroundColor Gray
            $deck = Fetch-Deck -DeckId $id -Format $Format
            if ($deck.Success) {
                $decks += $deck
                Write-Host "      Got: $($deck.Title)" -ForegroundColor Green
            }
            Start-Sleep -Milliseconds 300
        }
    }
    
    return $decks
}

# Fetch all formats
$modernDecks = Fetch-DecksForFormat -Archetypes $ModernArchetypes -Format "Modern" -MaxTotal $DecksPerFormat
Create-CSV -Decks $modernDecks -Format "Modern" -OutputFile (Join-Path $OutputPath "modern_decks.csv")

$pioneerDecks = Fetch-DecksForFormat -Archetypes $PioneerArchetypes -Format "Pioneer" -MaxTotal $DecksPerFormat
Create-CSV -Decks $pioneerDecks -Format "Pioneer" -OutputFile (Join-Path $OutputPath "pioneer_decks.csv")

$standardDecks = Fetch-DecksForFormat -Archetypes $StandardArchetypes -Format "Standard" -MaxTotal $DecksPerFormat
Create-CSV -Decks $standardDecks -Format "Standard" -OutputFile (Join-Path $OutputPath "standard_decks.csv")

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Done!" -ForegroundColor Green
Write-Host "Modern: $($modernDecks.Count) decks" -ForegroundColor White
Write-Host "Pioneer: $($pioneerDecks.Count) decks" -ForegroundColor White
Write-Host "Standard: $($standardDecks.Count) decks" -ForegroundColor White
Write-Host "`nCSV files saved to: $OutputPath" -ForegroundColor Yellow
Write-Host "`nTo import, use Admin > Data > Bulk Import" -ForegroundColor Gray

Read-Host "`nPress Enter to exit"
