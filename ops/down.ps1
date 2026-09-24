<#
  Stop everything ops\up.ps1 started.

     powershell -ExecutionPolicy Bypass -File ops\down.ps1
     powershell -ExecutionPolicy Bypass -File ops\down.ps1 -KeepDocker

    1. The API server and the ngrok tunnel (stop.ps1)
    2. Judge0's containers (`docker compose stop` - nothing is deleted, the
       next up.ps1 starts the same containers again in seconds)
    3. Docker Desktop itself, unless -KeepDocker is given (for when you are
       using Docker for something else)

  While this is down, the Vercel site still loads, and JavaScript, Python and
  HTML/CSS/JS keep working in the browser. Sign-in, progress sync and
  Java/C/C++ need the API and come back with ops\up.ps1.
#>
[CmdletBinding()]
param(
    [switch]$KeepDocker
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')

$ComposeFile = Join-Path $PSScriptRoot 'judge0\docker-compose.yml'

function Write-Step { param([string]$Text) Write-Host ''; Write-Host "== $Text" }

function Test-DockerEngine {
    cmd /c 'docker info >nul 2>&1'
    return ($LASTEXITCODE -eq 0)
}

Write-Step 'API server and ngrok tunnel'
& (Join-Path $PSScriptRoot 'stop.ps1')

Write-Step 'Judge0'
if (Test-DockerEngine) {
    cmd /c "docker compose -f `"$ComposeFile`" stop >nul 2>&1"
    if ($LASTEXITCODE -eq 0) { Write-Host '   stopped.' } else { Write-Host '   docker compose stop reported a problem - check: docker ps' }
} else {
    Write-Host '   Docker is not running, so Judge0 is already down.'
}

Write-Step 'Docker Desktop'
if ($KeepDocker) {
    Write-Host '   left running (-KeepDocker).'
} elseif (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue) {
    cmd /c 'docker desktop stop >nul 2>&1'
    if ($LASTEXITCODE -eq 0) { Write-Host '   stopped.' } else { Write-Host '   could not stop it from here - quit it from its tray icon.' }
} else {
    Write-Host '   not running.'
}

Write-Host ''
Write-Host 'Everything is stopped. Start it again with:  powershell -ExecutionPolicy Bypass -File ops\up.ps1'
Write-Host ''
