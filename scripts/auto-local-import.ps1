# Automated Local Bulk Import Script
# This script starts your dev server, runs the bulk import, then stops the server

param(
    [int]$Port = 3000,
    [int]$TimeoutMinutes = 15
)

Write-Host "🤖 Starting automated local bulk import..." -ForegroundColor Green

$ProjectPath = "C:\Users\davy_\mtg_ai_assistant\frontend"
$LogFile = "C:\Users\davy_\mtg_ai_assistant\logs\auto-import-$(Get-Date -Format 'yyyy-MM-dd-HH-mm').log"

# Create logs directory if it doesn't exist
$LogDir = Split-Path $LogFile -Parent
if (!(Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force
}

# Function to log messages
function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "[$Timestamp] $Message"
    Write-Host $LogMessage -ForegroundColor $Color
    Add-Content -Path $LogFile -Value $LogMessage
}

Write-Log "Starting automated bulk import process" "Green"
Write-Log "Project path: $ProjectPath" "Cyan"
Write-Log "Log file: $LogFile" "Cyan"

try {
    # Change to project directory
    Set-Location $ProjectPath
    Write-Log "Changed to project directory" "Yellow"

    # Start the development server in background
    Write-Log "Starting development server on port $Port..." "Yellow"
    $DevServer = Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory $ProjectPath -PassThru -WindowStyle Hidden
    
    if (!$DevServer) {
        throw "Failed to start development server"
    }
    
    Write-Log "Development server started (PID: $($DevServer.Id))" "Green"
    
    # Wait for server to be ready
    Write-Log "Waiting for server to be ready..." "Yellow"
    $ServerReady = $false
    $MaxWaitTime = 60 # seconds
    $WaitTime = 0
    
    while (!$ServerReady -and $WaitTime -lt $MaxWaitTime) {
        try {
            $Response = Invoke-WebRequest -Uri "http://localhost:$Port/api/config?key=maintenance" -TimeoutSec 5 -UseBasicParsing
            if ($Response.StatusCode -eq 200) {
                $ServerReady = $true
                Write-Log "Server is ready!" "Green"
            }
        }
        catch {
            Start-Sleep -Seconds 2
            $WaitTime += 2
            Write-Log "Waiting for server... ($WaitTime/$MaxWaitTime seconds)" "Gray"
        }
    }
    
    if (!$ServerReady) {
        throw "Server did not become ready within $MaxWaitTime seconds"
    }
    
    # Wait a bit more to ensure everything is loaded
    Start-Sleep -Seconds 5
    
    # Call the bulk import API endpoint
    Write-Log "Triggering bulk import..." "Yellow"
    
    try {
        $ImportResponse = Invoke-RestMethod -Uri "http://localhost:$Port/api/cron/bulk-scryfall" -Method POST -Headers @{
            'Content-Type' = 'application/json'
        } -TimeoutSec ($TimeoutMinutes * 60)
        
        if ($ImportResponse.ok) {
            Write-Log "✅ Bulk import completed successfully!" "Green"
            Write-Log "Cards imported: $($ImportResponse.imported)" "Green"
            Write-Log "Cards processed: $($ImportResponse.processed)" "Green"
            Write-Log "Total cards: $($ImportResponse.total_cards)" "Green"
            $ExitCode = 0
        } else {
            Write-Log "❌ Import failed: $($ImportResponse.error)" "Red"
            $ExitCode = 1
        }
    }
    catch {
        Write-Log "❌ Import request failed: $($_.Exception.Message)" "Red"
        $ExitCode = 1
    }
}
catch {
    Write-Log "❌ Script failed: $($_.Exception.Message)" "Red"
    $ExitCode = 1
}
finally {
    # Always try to stop the development server
    if ($DevServer -and !$DevServer.HasExited) {
        Write-Log "Stopping development server..." "Yellow"
        try {
            Stop-Process -Id $DevServer.Id -Force
            Write-Log "Development server stopped" "Green"
        }
        catch {
            Write-Log "Failed to stop development server: $($_.Exception.Message)" "Red"
        }
    }
    
    Write-Log "Automated import process completed" "Cyan"
    Write-Log "Log saved to: $LogFile" "Cyan"
}

exit $ExitCode