<#
  ngrok's live status screen - Session Status, Forwarding, the
  "Connections  ttl opn rt1 rt5 p50 p90" counters and the latest HTTP
  requests - for the tunnel the "CodeConsist Tunnel" task runs.

     powershell -ExecutionPolicy Bypass -File ops\tunnel-status.ps1
     powershell -ExecutionPolicy Bypass -File ops\tunnel-status.ps1 -Once

  ngrok only draws that screen in a visible terminal, and the task runs it
  hidden with its output going to ops\logs, so this reads the same numbers
  from ngrok's local agent API (http://127.0.0.1:4040/api) and draws them the
  same way. Read-only: Ctrl+C closes this window, the tunnel keeps running.

    ttl  connections since ngrok started     rt1  connections/second, last 1 minute
    opn  connections open right now          rt5  connections/second, last 5 minutes
    p50  median connection length (seconds)  p90  90th percentile (seconds)
#>
[CmdletBinding()]
param(
    [int]$RefreshSeconds = 1,
    [int]$Requests = 10,
    # Print one frame and exit, instead of refreshing.
    [switch]$Once
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')

$Api = 'http://127.0.0.1:4040/api'
$config = Get-TunnelConfig

# The version of the ngrok that is actually running, read once.
$version = ''
$running = Get-Process -Name 'ngrok' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $running -and $running.Path) {
    try { $version = ((& $running.Path version) -replace '^ngrok version\s*', '').Trim() } catch { }
}

function Format-Row {
    param([string]$Label, [string]$Value)
    '{0,-30}{1}' -f $Label, $Value
}

<# One screen, as lines of text. #>
function Get-Frame {
    'ngrok  (CodeConsist Tunnel)                         Ctrl+C to close - the tunnel keeps running'
    ''

    $tunnels = $null
    try { $tunnels = @((Invoke-RestMethod -Uri "$Api/tunnels" -TimeoutSec 3).tunnels) } catch { }
    if ($null -eq $tunnels -or $tunnels.Count -eq 0) {
        Format-Row 'Session Status' 'offline'
        ''
        'The tunnel is not running. Start everything with:'
        '  powershell -ExecutionPolicy Bypass -File ops\up.ps1'
        return
    }

    $tunnel = $tunnels | Where-Object { $config -and $_.public_url -like "*$($config.domain)*" } | Select-Object -First 1
    if ($null -eq $tunnel) { $tunnel = $tunnels[0] }
    $conns = $tunnel.metrics.conns

    Format-Row 'Session Status' 'online'
    if ($version) { Format-Row 'Version' $version }
    Format-Row 'Web Interface' 'http://127.0.0.1:4040'
    Format-Row 'Forwarding' "$($tunnel.public_url) -> $($tunnel.config.addr)"
    ''
    '{0,-30}{1,-8}{2,-8}{3,-8}{4,-8}{5,-8}{6}' -f 'Connections', 'ttl', 'opn', 'rt1', 'rt5', 'p50', 'p90'
    '{0,-30}{1,-8}{2,-8}{3,-8}{4,-8}{5,-8}{6}' -f '',
        $conns.count,
        $conns.gauge,
        ('{0:0.00}' -f [double]$conns.rate1),
        ('{0:0.00}' -f [double]$conns.rate5),
        ('{0:0.00}' -f ([double]$conns.p50 / 1e9)),
        ('{0:0.00}' -f ([double]$conns.p90 / 1e9))
    ''
    'HTTP Requests'
    '-------------'
    $recent = @()
    try { $recent = @((Invoke-RestMethod -Uri "$Api/requests/http?limit=$Requests" -TimeoutSec 3).requests) } catch { }
    if ($recent.Count -eq 0) {
        '(not recorded - ngrok runs with --inspect=false so request bodies, including'
        ' passwords, are never kept. See ops\logs.ps1 for the requests the API answered.)'
    }
    foreach ($r in $recent) {
        $when = ''
        try { $when = ([datetime]::Parse($r.start)).ToString('HH:mm:ss') } catch { $when = [string]$r.start }
        $uri = [string]$r.request.uri
        if ($uri.Length -gt 50) { $uri = $uri.Substring(0, 47) + '...' }
        $status = if ($r.response) { [string]$r.response.status } else { '(no response yet)' }
        '{0}  {1,-7}{2,-52}{3}' -f $when, $r.request.method, $uri, $status
    }
}

if ($Once) {
    Get-Frame | ForEach-Object { Write-Host $_ }
    return
}

<#
  Redraw in place rather than clearing the screen every second, which
  flickers. Lines are padded to the window width so a shorter frame fully
  overwrites a longer one.
#>
$script:lastCount = 0
Clear-Host
try { [Console]::CursorVisible = $false } catch { }
try {
    while ($true) {
        $lines = @(Get-Frame)
        $width = 119
        try { $width = [Console]::WindowWidth - 1 } catch { }
        try { [Console]::SetCursorPosition(0, 0) } catch { Clear-Host }
        foreach ($line in $lines) {
            $text = [string]$line
            if ($text.Length -gt $width) { $text = $text.Substring(0, $width) } else { $text = $text.PadRight($width) }
            [Console]::Out.WriteLine($text)
        }
        for ($i = $lines.Count; $i -lt $script:lastCount; $i++) { [Console]::Out.WriteLine(' ' * $width) }
        $script:lastCount = $lines.Count
        Start-Sleep -Seconds $RefreshSeconds
    }
} finally {
    try { [Console]::CursorVisible = $true } catch { }
}
