# Create desktop shortcut for Bulk Scryfall Import automation
# Paths follow this repo wherever it lives (no hardcoded drive/folder).

$DesktopPath = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $DesktopPath "Bulk Scryfall Import.lnk"
$ScriptPath = Join-Path $PSScriptRoot "run-bulk-scryfall-local.ps1"
$WorkingDir = Split-Path -Parent $PSScriptRoot

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-ExecutionPolicy Bypass -NoExit -File `"$ScriptPath`""
$Shortcut.WorkingDirectory = $WorkingDir
$Shortcut.IconLocation = "powershell.exe,0"
$Shortcut.Description = "Run Bulk Scryfall Import (Local Automation)"
$Shortcut.Save()

Write-Host "Desktop shortcut created successfully!" -ForegroundColor Green
Write-Host "Location: $ShortcutPath" -ForegroundColor Gray

