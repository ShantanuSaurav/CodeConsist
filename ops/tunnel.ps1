<#
  Keeps the ngrok tunnel up, so https://<reserved domain> always reaches the
  API on this laptop. Vercel rewrites /api/* to that domain (vercel.json), so
  when this is down the hosted site has no backend.

  The reserved domain and port live in ops\tunnel.config.json.
  The ngrok auth token lives in ngrok's own config
  (%LOCALAPPDATA%\ngrok\ngrok.yml) - this script never reads or prints it.
#>
[CmdletBinding()]
param(
    [int]$MaxRestarts = 0
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')
Initialize-OpsDirs

# Three separate files on purpose: the child process holds an open handle to
# its stdout and stderr, and a second writer to the same path fails on Windows.
$SupLog = Join-Path $script:LogDir 'tunnel-supervisor.log'
$OutLog = Join-Path $script:LogDir 'tunnel.log'
$ErrLog = Join-Path $script:LogDir 'tunnel.err.log'

$config = Get-TunnelConfig
if ($null -eq $config) {
    Write-OpsLog -LogFile $SupLog -Level 'error' -Message 'ops\tunnel.config.json is missing or not valid JSON - cannot start the tunnel.'
    exit 1
}
$domain = $config.domain
$port = $config.port
if (-not $domain -or -not $port) {
    Write-OpsLog -LogFile $SupLog -Level 'error' -Message 'ops\tunnel.config.json needs both "domain" and "port".'
    exit 1
}

Write-OpsLog -LogFile $SupLog -Message "--- tunnel supervisor starting ($domain -> localhost:$port) ---"

<#
  Where ngrok actually is.

  It was installed through npx, so it lives in the npx cache under a hashed
  folder name. That path survives reboots but not an npm cache clean, hence
  the fallbacks - and ops\ngrok-path.txt to pin it by hand if it ever moves.
#>
function Get-NgrokPath {
    $pin = Join-Path $script:OpsDir 'ngrok-path.txt'
    if (Test-Path -LiteralPath $pin) {
        $pinned = (Get-Content -LiteralPath $pin -Raw).Trim()
        if ($pinned -and (Test-Path -LiteralPath $pinned)) { return $pinned }
    }
    $onPath = Get-Command 'ngrok.exe' -ErrorAction SilentlyContinue
    if ($null -ne $onPath) { return $onPath.Source }

    $cache = Join-Path $env:LOCALAPPDATA 'npm-cache\_npx'
    if (Test-Path -LiteralPath $cache) {
        $found = Get-ChildItem -LiteralPath $cache -Recurse -Filter 'ngrok.exe' -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
        if ($null -ne $found) { return $found.FullName }
    }
    return $null
}

$ngrok = Get-NgrokPath
if ($null -eq $ngrok) {
    Write-OpsLog -LogFile $SupLog -Level 'error' -Message 'Could not find ngrok.exe. Put its full path in ops\ngrok-path.txt and start this task again.'
    exit 1
}
Write-OpsLog -LogFile $SupLog -Message "Using ngrok at $ngrok"

<# Pointing a tunnel at a port nobody serves just yields 502s, so wait for the API first. #>
function Wait-ForApi {
    param([int]$Port, [int]$TimeoutSeconds = 60)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($null -ne (Get-PortOwnerPid -Port $Port)) { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

<#
  Does a real request get through to the API?

  The only honest test of a tunnel. curl.exe, not Invoke-RestMethod: ngrok's
  edge renegotiates TLS mid-request and .NET's client in PowerShell 5.1
  reports that as a closed connection even when the tunnel is fine.
#>
function Test-PublicHealth {
    $url = "https://$domain/api/health"
    $curl = Get-Command 'curl.exe' -ErrorAction SilentlyContinue
    if ($null -eq $curl) { return $true }  # No way to check: assume well rather than restart blindly.
    $body = & $curl.Source -s -m 20 -H 'ngrok-skip-browser-warning: true' $url 2>$null
    if (-not $body) { return $false }
    try { return [bool]((($body | ConvertFrom-Json).ok)) } catch { return $false }
}

<#
  Wait for the tunnel process to exit - but do not trust that it exiting is
  the only way it can fail. ngrok can sit there "connected" long after its
  link to the edge has gone, and only a real request notices. After
  watchdogFailures checks in a row fail, the process is killed so the loop
  above starts a fresh one.

  The thresholds are deliberately slack (default: three failures, two minutes
  apart). This hop is genuinely flaky from some networks, and restarting a
  working tunnel because one request lost a race would be worse than the bug.
#>
function Watch-Tunnel {
    param([Parameter(Mandatory = $true)]$Child)

    $everyMinutes = 0
    $allowedFailures = 3
    if ($null -ne $config.PSObject.Properties['watchdogMinutes']) { $everyMinutes = [int]$config.watchdogMinutes }
    if ($null -ne $config.PSObject.Properties['watchdogFailures']) { $allowedFailures = [int]$config.watchdogFailures }

    if ($everyMinutes -le 0) {
        $Child.WaitForExit()
        return
    }

    $failures = 0
    $intervalMs = $everyMinutes * 60 * 1000
    while (-not $Child.WaitForExit($intervalMs)) {
        if (Test-PublicHealth) {
            if ($failures -gt 0) { Write-OpsLog -LogFile $SupLog -Message "The tunnel is answering again after $failures failed check(s)." }
            $failures = 0
            continue
        }
        $failures = $failures + 1
        Write-OpsLog -LogFile $SupLog -Level 'warn' -Message "The tunnel did not answer ($failures of $allowedFailures)."
        if ($failures -ge $allowedFailures) {
            Write-OpsLog -LogFile $SupLog -Level 'warn' -Message 'Still not answering - restarting ngrok (it can stay running long after its link to the edge dies).'
            try { $Child.Kill() } catch { }
            $Child.WaitForExit()
            return
        }
    }
}

$delay = 2
$restarts = 0
$child = $null

$onExit = {
    if ($null -ne $child -and -not $child.HasExited) {
        try { $child.Kill() } catch { }
    }
}
Register-EngineEvent -SourceIdentifier ([System.Management.Automation.PsEngineEvent]::Exiting) -Action $onExit | Out-Null

<#
  Is somebody else already tunnelling this domain?

  The free plan allows one agent session at a time, so a second one exits
  immediately - and without this guard the supervisor would sit in a restart
  loop fighting a tunnel that is, in fact, working perfectly.
#>
function Get-ForeignTunnelPid {
    $mine = $PID
    $procs = @(Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like "*$domain*" -and $_.ParentProcessId -ne $mine })
    if ($procs.Count -eq 0) { return $null }
    return $procs[0].ProcessId
}

$foreign = Get-ForeignTunnelPid
if ($null -ne $foreign) {
    Write-OpsLog -LogFile $SupLog -Message "ngrok is already serving $domain (PID $foreign) - leaving it alone. Stop that process if you want this task to own the tunnel."
    exit 0
}

while ($true) {
    if (-not (Wait-ForApi -Port $port)) {
        Write-OpsLog -LogFile $SupLog -Level 'warn' -Message "Nothing is listening on port $port yet - waiting before starting the tunnel."
        Start-Sleep -Seconds 10
        continue
    }

    Invoke-LogRotation -Path $OutLog
    Invoke-LogRotation -Path $ErrLog

    $startedAt = Get-Date
    Write-OpsLog -LogFile $SupLog -Message "Starting the tunnel."
    try {
        # --inspect=false: ngrok's local inspector (127.0.0.1:4040) otherwise
        # keeps every request body in memory and shows it in plain text - that
        # includes learners' sign-up/login passwords and the admin password.
        # The counters ops\tunnel-status.ps1 reads are unaffected.
        $child = Start-Process -FilePath $ngrok `
            -ArgumentList 'http', "--url=$domain", '--inspect=false', "$port" `
            -WorkingDirectory $script:RepoRoot -NoNewWindow -PassThru `
            -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog
    } catch {
        Write-OpsLog -LogFile $SupLog -Level 'error' -Message "Could not start ngrok: $($_.Exception.Message)"
        $child = $null
    }

    if ($null -ne $child) {
        Watch-Tunnel -Child $child
        $ranFor = [int]((Get-Date) - $startedAt).TotalSeconds
        Write-OpsLog -LogFile $SupLog -Level 'warn' -Message "The tunnel exited with code $($child.ExitCode) after $ranFor seconds."
        if ($ranFor -ge 60) { $delay = 2 }
    }

    $restarts = $restarts + 1
    if ($MaxRestarts -gt 0 -and $restarts -ge $MaxRestarts) {
        Write-OpsLog -LogFile $SupLog -Message "Reached the restart limit of $MaxRestarts - stopping."
        break
    }

    Write-OpsLog -LogFile $SupLog -Message "Restarting the tunnel in $delay seconds."
    Start-Sleep -Seconds $delay
    $delay = [Math]::Min($delay * 2, 60)
}
