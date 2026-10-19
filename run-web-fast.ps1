$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot

& (Join-Path $projectDir 'stop-web.ps1')

Push-Location $projectDir
try {
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw 'Build frontend gagal; server ringan tidak dijalankan.'
  }

  $env:SERVE_BUILT_FRONTEND = 'true'
  & (Join-Path $projectDir 'run-web.ps1')
} finally {
  Remove-Item Env:SERVE_BUILT_FRONTEND -ErrorAction SilentlyContinue
  Pop-Location
}
