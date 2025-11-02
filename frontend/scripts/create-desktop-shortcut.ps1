# Create desktop shortcut for Bulk Scryfall Import automation

$DesktopPath = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $DesktopPath "Bulk Scryfall Import.lnk"
$ScriptPath = "C:\Users\davy_\mtg_ai_assistant\frontend\scripts\run-bulk-scryfall-local.ps1"
$WorkingDir = "C:\Users\davy_\mtg_ai_assistant\frontend"

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

