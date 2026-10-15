$pidFile = Join-Path $PSScriptRoot '.web-server.pid'
if (-not (Test-Path $pidFile)) {
  Write-Host 'File PID server tidak ditemukan. Server mungkin sudah berhenti.'
  exit 0
}

$serverPid = [int](Get-Content $pidFile -Raw)
$serverProcess = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if ($serverProcess) {
  Stop-Process -Id $serverPid -Force
  Write-Host 'Server CatatUang dihentikan.'
} else {
  Write-Host 'Server CatatUang sudah berhenti.'
}
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
