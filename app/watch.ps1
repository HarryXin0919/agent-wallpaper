# Opens the Claude wallpaper whenever the Claude desktop app opens. (The wallpaper closes itself when Claude closes.)
# Started at sign-in from the Startup folder. It only starts the wallpaper when Claude goes from closed to open,
# so if you quit the wallpaper yourself it stays off until the next time Claude starts.
$dir = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $dir 'node_modules\electron\dist\electron.exe'
$mutex = New-Object System.Threading.Mutex($false, 'Local\ClaudeWallpaperWatcher')
if (-not $mutex.WaitOne(0)) { exit }   # already watching
function ClaudeUp { [bool](Get-Process -Name Claude -ErrorAction SilentlyContinue | Where-Object { $_.Path -match '\\WindowsApps\\Claude_|\\AnthropicClaude\\|\\Programs\\Claude\\' }) }
function WallUp { [bool](Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($dir) }) }
$was = $false
while ($true) {
  $up = ClaudeUp
  if ($up -and -not $was -and -not (WallUp)) { Start-Process -FilePath $exe -ArgumentList "`"$dir`"" }
  $was = $up
  Start-Sleep -Seconds 4
}
