<#
  Development, running BESIDE the live server instead of on top of it.

  The live server owns port 4000, the ngrok tunnel and server\data\db.json.
  This starts a second stack that touches none of those:

      API    http://localhost:4001   (its own process, with --watch)
      web    http://localhost:3000   (Vite, proxying /api to 4001)
      data   server\data-dev\db.json (its own database - see below)

  Why a separate database: every server process holds the whole state in
  memory and rewrites the file, so two of them sharing one db.json means the
  last writer silently wins. Your test signups would also land in the live
  database that real users are in. The first run copies the live file so you
  start from realistic content; after that the two drift apart, which is the
  point.

      powershell -ExecutionPolicy Bypass -File ops\dev.ps1

  Ctrl+C stops it. The live server is never touched.
#>
[CmdletBinding()]
param(
    [int]$ApiPort = 4001,
    # Start from a fresh, empty database instead of a copy of the live one.
    [switch]$Empty
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')

$devData = Join-Path $script:RepoRoot 'server\data-dev'
$devDb = Join-Path $devData 'db.json'
$liveDb = Join-Path $script:RepoRoot 'server\data\db.json'

if (-not (Test-Path -LiteralPath $devData)) {
    New-Item -ItemType Directory -Path $devData -Force | Out-Null
}
if ($Empty -and (Test-Path -LiteralPath $devDb)) {
    Remove-Item -LiteralPath $devDb -Force
    Write-Host 'Starting from an empty development database.'
}
if (-not (Test-Path -LiteralPath $devDb)) {
    if (Test-Path -LiteralPath $liveDb) {
        Copy-Item -LiteralPath $liveDb -Destination $devDb
        Write-Host 'Seeded server\data-dev\db.json from the live database (a copy - the live one is not touched).'
    } else {
        Write-Host 'No live database to copy; the development server will create an empty one.'
    }
}

# Warn rather than fail: the live server is not required for development.
$livePort = Get-ApiPort
if ($null -eq (Get-PortOwnerPid -Port $livePort)) {
    Write-Host "Note: the live server is not running on $livePort right now (ops\start.ps1 starts it)."
} else {
    Write-Host "The live server keeps running on $livePort - this does not disturb it."
}

if ($null -ne (Get-PortOwnerPid -Port $ApiPort)) {
    Write-Host ''
    Write-Host "Port $ApiPort is already in use - a development API is probably already running."
    Write-Host 'Close that window first, or pass a different -ApiPort.'
    exit 1
}

Write-Host ''
Write-Host "  API  http://localhost:$ApiPort"
Write-Host '  web  http://localhost:3000'
Write-Host "  data server\data-dev\db.json"
Write-Host ''
Write-Host 'Ctrl+C stops it.'
Write-Host ''

# Scoped to this process only - nothing here is written to .env, so the live
# server (which reads .env) is unaffected.
$env:API_PORT = "$ApiPort"
$env:VITE_API_PROXY = "http://localhost:$ApiPort"
$env:DATA_DIR = 'server/data-dev'
$env:NODE_ENV = 'development'

$npm = Join-Path $env:ProgramFiles 'nodejs\npm.cmd'
if (-not (Test-Path -LiteralPath $npm)) { $npm = 'npm.cmd' }

# Inherit the console so Ctrl+C reaches it and the output is live.
& $npm run dev
