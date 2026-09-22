<#
  Is the server actually up? Read-only - safe to run any time, changes nothing.

     powershell -ExecutionPolicy Bypass -File ops\status.ps1

  Checks it end to end: the tasks exist and last ran cleanly, something is
  listening locally, the API answers, the tunnel is alive, and the public
  domain reaches THIS machine's API. The last check is the one that matters -
  everything else can look fine while the hosted site still has no backend.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'lib.ps1')

function Write-Heading { param([string]$Text) Write-Host ''; Write-Host $Text; Write-Host ('-' * $Text.Length) }
function Write-Good { param([string]$Text) Write-Host "  [ok]   $Text" }
function Write-Bad { param([string]$Text) Write-Host "  [DOWN] $Text" }
function Write-Note { param([string]$Text) Write-Host "         $Text" }

$port = Get-ApiPort
$config = Get-TunnelConfig

Write-Heading 'Scheduled tasks'
# Server and Tunnel are supervisors - they should BE running. Backup is a
# scheduled one-shot, so "Ready" is its healthy state, not a fault.
$supervisors = @('CodeConsist Server', 'CodeConsist Tunnel')
foreach ($name in @('CodeConsist Server', 'CodeConsist Tunnel', 'CodeConsist Backup')) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($null -eq $task) {
        Write-Bad "$name - not installed (run ops\install.ps1)"
        continue
    }
    $info = Get-ScheduledTaskInfo -TaskName $name -ErrorAction SilentlyContinue
    $last = 'never'
    $result = ''
    if ($null -ne $info) {
        if ($info.LastRunTime -and $info.LastRunTime.Year -gt 1999) { $last = $info.LastRunTime.ToString('yyyy-MM-dd HH:mm') }
        # 0 = fine, 267009 = currently running.
        if ($info.LastTaskResult -eq 0 -or $info.LastTaskResult -eq 267009) { $result = 'ok' } else { $result = "last result $($info.LastTaskResult)" }
    }
    if ($task.State -eq 'Running') {
        Write-Good "$name - running (last start $last)"
    } elseif ($supervisors -notcontains $name -and $task.State -eq 'Ready') {
        Write-Good "$name - scheduled, waiting for its next run (last start $last)"
    } else {
        Write-Bad "$name - $($task.State) (last start $last, $result)"
    }
}

Write-Heading "API on port $port"
$owner = Get-PortOwnerPid -Port $port
if ($null -eq $owner) {
    Write-Bad "nothing is listening on $port"
} else {
    $proc = Get-Process -Id $owner -ErrorAction SilentlyContinue
    $name = 'unknown'
    if ($null -ne $proc) { $name = $proc.ProcessName }
    Write-Good "listening - $name (PID $owner)"
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:$port/api/health" -TimeoutSec 5 -ErrorAction Stop
        $up = [TimeSpan]::FromSeconds($health.uptimeSeconds)
        Write-Good ("health: {0} challenges, {1} stages, {2} users, up {3}" -f $health.challenges, $health.stages, $health.users, $up.ToString('d\d\ hh\:mm\:ss'))
    } catch {
        Write-Bad "the port is open but /api/health did not answer: $($_.Exception.Message)"
    }
}

Write-Heading 'Tunnel'
if ($null -eq $config) {
    Write-Bad 'ops\tunnel.config.json is missing or invalid'
} else {
    $ngrokProcs = Get-Process ngrok -ErrorAction SilentlyContinue
    if ($null -eq $ngrokProcs) {
        Write-Bad 'ngrok is not running'
    } else {
        Write-Good "ngrok is running (PID $(($ngrokProcs | Select-Object -First 1).Id))"
    }
    # curl.exe, not Invoke-RestMethod: ngrok's edge asks to renegotiate TLS
    # mid-request, which .NET's client in PowerShell 5.1 answers with
    # "the underlying connection was closed" even though the tunnel is fine.
    # curl.exe ships with Windows 10+ and handles it.
    # Three tries, because this hop really is intermittent: the same request
    # can fail and then succeed seconds later while the API never moves. One
    # failure is not evidence of an outage; three in a row is worth looking at.
    $url = "https://$($config.domain)/api/health"
    $curl = Get-Command 'curl.exe' -ErrorAction SilentlyContinue
    $public = $null
    $attempts = 0
    for ($try = 1; $try -le 3; $try++) {
        $attempts = $try
        $body = $null
        if ($null -ne $curl) {
            $body = & $curl.Source -s -m 20 -H 'ngrok-skip-browser-warning: true' $url 2>$null
        } else {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            try { $body = Invoke-WebRequest -Uri $url -TimeoutSec 20 -UseBasicParsing -Headers @{ 'ngrok-skip-browser-warning' = 'true' } -ErrorAction Stop | Select-Object -ExpandProperty Content } catch { $body = $null }
        }
        if ($body) { try { $public = $body | ConvertFrom-Json } catch { $public = $null } }
        if ($null -ne $public -and $public.ok) { break }
        if ($try -lt 3) { Start-Sleep -Seconds 3 }
    }

    if ($null -ne $public -and $public.ok) {
        $note = ''
        if ($attempts -gt 1) { $note = " (took $attempts tries - this hop is flaky)" }
        Write-Good "https://$($config.domain) reaches this machine ($($public.users) users, up $([int]$public.uptimeSeconds)s)$note"
    } else {
        Write-Bad "https://$($config.domain)/api/health did not answer in 3 tries"
        Write-Note 'Check ops\logs\server-supervisor.log first - a restarting API looks exactly like this.'
        Write-Note 'If the API is steady, restart the tunnel: Stop-ScheduledTask -TaskName "CodeConsist Tunnel"; Start-ScheduledTask -TaskName "CodeConsist Tunnel"'
    }
}

Write-Heading 'Database backups'
$backupDir = Join-Path $script:OpsDir 'backups'
$backups = @(Get-ChildItem -LiteralPath $backupDir -Filter 'db-*.json' -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending)
if ($backups.Count -eq 0) {
    Write-Bad "none yet in ops\backups"
} else {
    $newest = $backups[0]
    $age = (Get-Date) - $newest.LastWriteTime
    $line = "{0} - {1:N0} bytes, {2:N1} hours old ({3} kept)" -f $newest.Name, $newest.Length, $age.TotalHours, $backups.Count
    if ($age.TotalHours -le 48) { Write-Good $line } else { Write-Bad "$line - older than two days" }
}

Write-Heading 'Recent log lines'
foreach ($logName in @('server.log', 'server-supervisor.log', 'server.err.log', 'tunnel-supervisor.log', 'backup.log')) {
    $path = Join-Path $script:LogDir $logName
    Write-Host "  ${logName}:"
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Host '    (no log yet)'
        continue
    }
    $tail = Get-Content -LiteralPath $path -Tail 5 -ErrorAction SilentlyContinue
    foreach ($line in $tail) {
        # Log lines can quote a URL with a token in it; never print one raw.
        Write-Host "    $(Hide-Secrets -Text $line)"
    }
}

Write-Host ''
