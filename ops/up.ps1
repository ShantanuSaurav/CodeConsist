<#
  Start everything the hosted site needs, by hand, in order - and prove it works.

     powershell -ExecutionPolicy Bypass -File ops\up.ps1

    1. Docker Desktop   the engine Judge0 runs in
    2. Judge0           the sandbox that compiles and runs Java, C and C++
    3. API + tunnel     the "CodeConsist Server" and "CodeConsist Tunnel"
                        scheduled tasks, through start.ps1
    4. Checks           the public domain reaches this machine's API, and the
                        API can see Judge0

  Nothing starts at login any more; this is the one command after a reboot.
  Safe to run again at any time: whatever is already running is left alone.
  The walkthrough is START-AND-STOP.md; ops\down.ps1 is the reverse.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')

$ComposeFile = Join-Path $PSScriptRoot 'judge0\docker-compose.yml'
$Judge0Conf = Join-Path $PSScriptRoot 'judge0\judge0.conf'
$DockerExe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
$port = Get-ApiPort
$config = Get-TunnelConfig

function Write-Step { param([string]$Text) Write-Host ''; Write-Host "== $Text" }
function Write-Ok { param([string]$Text) Write-Host "   [ok]   $Text" }
function Write-Fail { param([string]$Text) Write-Host "   [FAIL] $Text" }

<#
  Native commands go through cmd so their stderr - where docker writes its
  progress - cannot trip Windows PowerShell 5.1 into a terminating error.
#>
function Test-DockerEngine {
    cmd /c 'docker info >nul 2>&1'
    return ($LASTEXITCODE -eq 0)
}

<# HTTP status of a URL as a string ("000" when nothing answered). #>
function Get-HttpCode {
    param([string]$Url, [int]$TimeoutSeconds = 5)
    $code = & curl.exe -s -o NUL -w '%{http_code}' -m $TimeoutSeconds -H 'ngrok-skip-browser-warning: 1' $Url 2>$null
    if (-not $code) { return '000' }
    return [string]$code
}

<#
  Docker Desktop 4.48 on this Windows build leaves Unix-socket files behind
  that Windows itself cannot delete ("The file cannot be accessed by the
  system", even for fsutil), and then crashes at its next launch trying to
  remove them. Renaming the folder that holds them works, and Docker recreates
  it. Only ever called while Docker Desktop is not running.
#>
function Clear-StaleDockerSockets {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $dirs = @(
        (Join-Path $env:LOCALAPPDATA 'Docker\run'),
        (Join-Path $env:LOCALAPPDATA 'docker-secrets-engine')
    )
    foreach ($dir in $dirs) {
        if (-not (Test-Path -LiteralPath $dir)) { continue }
        $sockets = @(Get-ChildItem -LiteralPath $dir -Force -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
        if ($sockets.Count -eq 0) { continue }
        $stuck = $false
        foreach ($socket in $sockets) {
            try { Remove-Item -LiteralPath $socket.FullName -Force -ErrorAction Stop } catch { $stuck = $true }
        }
        if ($stuck) {
            $newName = (Split-Path -Leaf $dir) + ".stale-$stamp"
            Rename-Item -LiteralPath $dir -NewName $newName
            Write-Host "   moved aside $dir (left-over sockets Windows cannot delete)"
        }
    }
}

<# ------------------------------------------------------------ 1. Docker #>

Write-Step 'Docker Desktop'
if (Test-DockerEngine) {
    Write-Ok 'already running'
} else {
    $running = Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue
    if ($null -eq $running) {
        if (-not (Test-Path -LiteralPath $DockerExe)) {
            Write-Fail "Docker Desktop is not installed at $DockerExe"
            exit 1
        }
        Clear-StaleDockerSockets
        Start-Process -FilePath $DockerExe
        Write-Host '   starting Docker Desktop (usually 30-90 seconds)...'
    } else {
        Write-Host '   Docker Desktop is open but its engine is not ready yet - waiting...'
    }

    $deadline = (Get-Date).AddMinutes(4)
    while (-not (Test-DockerEngine)) {
        if ((Get-Date) -gt $deadline) {
            Write-Fail 'the Docker engine did not come up within 4 minutes.'
            Write-Host '          If Docker showed "An unexpected error occurred", click Quit (never'
            Write-Host '          "Reset to factory defaults") and run this script again.'
            exit 1
        }
        Start-Sleep -Seconds 5
    }
    Write-Ok 'Docker engine is running'
}

<# ------------------------------------------------------------ 2. Judge0 #>

Write-Step 'Judge0 (Java, C, C++ sandbox)'
if (-not (Test-Path -LiteralPath $Judge0Conf)) {
    Write-Fail 'ops\judge0\judge0.conf is missing. Create it from judge0.conf.example (docs/RUNNING-JAVA-C-CPP.md, step A2).'
    exit 1
}
cmd /c "docker compose -f `"$ComposeFile`" up -d >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Fail "docker compose up failed. See: docker compose -f ops\judge0\docker-compose.yml logs --tail=50"
    exit 1
}
$deadline = (Get-Date).AddMinutes(3)
$code = Get-HttpCode -Url 'http://127.0.0.1:2358/about'
while ($code -eq '000') {
    if ((Get-Date) -gt $deadline) {
        Write-Fail 'Judge0 did not answer on 127.0.0.1:2358 within 3 minutes.'
        Write-Host '          See: docker compose -f ops\judge0\docker-compose.yml logs --tail=50 server'
        exit 1
    }
    Start-Sleep -Seconds 3
    $code = Get-HttpCode -Url 'http://127.0.0.1:2358/about'
}
# 401 is the judge working: every request needs its AUTHN_TOKEN.
Write-Ok "answering on 127.0.0.1:2358 (HTTP $code)"

<# ----------------------------------------------------- 3. API + tunnel #>

Write-Step 'API server and ngrok tunnel'
& (Join-Path $PSScriptRoot 'start.ps1')

Write-Host "   waiting for the API on port $port (the first start after a code change also rebuilds the site)..."
$deadline = (Get-Date).AddMinutes(5)
while ((Get-HttpCode -Url "http://localhost:$port/api/health") -ne '200') {
    if ((Get-Date) -gt $deadline) {
        Write-Fail "the API did not answer on port $port within 5 minutes. See ops\logs\server.err.log"
        exit 1
    }
    Start-Sleep -Seconds 3
}
Write-Ok "API answering on http://localhost:$port"

<# ------------------------------------------------------------ 4. Checks #>

Write-Step 'End to end'
$failed = $false
if ($null -ne $config -and $config.domain) {
    $public = "https://$($config.domain)/api/health"
    $health = $null
    $deadline = (Get-Date).AddMinutes(2)
    while ($null -eq $health) {
        try {
            $health = Invoke-RestMethod -Uri $public -Headers @{ 'ngrok-skip-browser-warning' = '1' } -TimeoutSec 10
        } catch {
            if ((Get-Date) -gt $deadline) { break }
            Start-Sleep -Seconds 5
        }
    }
    if ($null -eq $health) {
        Write-Fail "the public tunnel does not reach the API yet: $public"
        Write-Host '          See ops\logs\tunnel.err.log, or run ops\status.ps1'
        $failed = $true
    } else {
        Write-Ok "public tunnel reaches this API ($($config.domain))"
        if ($health.judge0 -and $health.judge0.configured) {
            Write-Ok 'the API sees Judge0 - Java, C and C++ are available'
        } else {
            Write-Fail 'the API does not see Judge0: check JUDGE0_API_URL / JUDGE0_AUTH_TOKEN in .env'
            $failed = $true
        }
    }
} else {
    Write-Fail 'ops\tunnel.config.json is missing - cannot check the public URL.'
    $failed = $true
}

Write-Host ''
if ($failed) {
    Write-Host 'Started, but something above needs a look. ops\status.ps1 gives the full picture.'
    exit 1
}
Write-Host 'Everything is up. The Vercel site can run JavaScript, Python, HTML/CSS/JS, Java, C and C++.'
Write-Host 'Stop it all with:  powershell -ExecutionPolicy Bypass -File ops\down.ps1'
Write-Host ''
