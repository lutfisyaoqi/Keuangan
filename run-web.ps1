$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$url = 'http://localhost:3000'
$pidFile = Join-Path $projectDir '.web-server.pid'
$logFile = Join-Path $projectDir 'web-server.log'
$errorLogFile = Join-Path $projectDir 'web-server-error.log'

$status = & curl.exe --silent --output NUL --write-out '%{http_code}' --max-time 2 $url 2>$null
if ($LASTEXITCODE -eq 0 -and $status -eq '200') {
  Start-Process $url
  Write-Host "CatatUang sudah berjalan: $url"
  exit 0
}

$node = (Get-Command node).Source
$tsx = Join-Path $projectDir 'node_modules/tsx/dist/cli.mjs'
if (-not (Test-Path $tsx)) {
  throw 'Dependency belum terpasang. Jalankan npm install terlebih dahulu.'
}

$process = Start-Process -FilePath $node -ArgumentList @($tsx, 'server.ts') `
  -WorkingDirectory $projectDir -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput $logFile -RedirectStandardError $errorLogFile
$process.Id | Set-Content -Path $pidFile

for ($attempt = 0; $attempt -lt 40; $attempt++) {
  Start-Sleep -Milliseconds 500
  try {
    $status = & curl.exe --silent --output NUL --write-out '%{http_code}' --max-time 2 $url 2>$null
    if ($LASTEXITCODE -eq 0 -and $status -eq '200') {
      Start-Process $url
      Write-Host "CatatUang berjalan dan dibuka di browser: $url"
      Write-Host "Log server: $logFile"
      Write-Host 'Untuk berhenti, jalankan: npm run stop:web'
      exit 0
    }
  } catch {}
  if ($process.HasExited) { break }
}

$details = @()
if (Test-Path $logFile) { $details += Get-Content $logFile -Tail 20 }
if (Test-Path $errorLogFile) { $details += Get-Content $errorLogFile -Tail 20 }
if (-not $details) { $details = @('Tidak ada log server.') }
throw "Server gagal aktif di $url.`n$details"
