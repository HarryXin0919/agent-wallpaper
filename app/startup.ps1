# Adds (or with -Remove, removes) a shortcut in your Startup folder that runs app\watch.ps1 at sign-in.
# watch.ps1 then opens the wallpaper whenever the Claude desktop app opens.
param([switch]$Remove)
$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'Agent Wallpaper (follow Claude).lnk'
if ($Remove) {
  if (Test-Path $link) { Remove-Item $link; 'Removed the Startup shortcut.' } else { 'No Startup shortcut to remove.' }
  exit
}
$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($link)
$s.TargetPath = (Get-Command powershell.exe).Source
$s.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'watch.ps1')`""
$s.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$s.WindowStyle = 7
$s.Save()
"Added: $link"
