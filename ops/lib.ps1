<#
  Shared helpers for the ops scripts. Dot-sourced, never run on its own.

  Windows PowerShell 5.1 only: no &&, no ternary, no ?? - this machine has no
  pwsh, and a script that needs one fails at parse time, hours after nobody
  was watching.
#>

Set-StrictMode -Version 2.0

$script:RepoRoot = Split-Path -Parent $PSScriptRoot
$script:OpsDir = $PSScriptRoot
$script:LogDir = Join-Path $PSScriptRoot 'logs'

function Initialize-OpsDirs {
    if (-not (Test-Path -LiteralPath $script:LogDir)) {
        New-Item -ItemType Directory -Path $script:LogDir -Force | Out-Null
    }
}

<#
  One log line. Also echoed to the console so running a script by hand shows
  what it is doing; the scheduled task has no console and only the file matters.
#>
function Write-OpsLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [string]$LogFile,
        [ValidateSet('info', 'warn', 'error')][string]$Level = 'info'
    )
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line = "$stamp [$Level] $Message"
    Write-Host $line
    if ($LogFile) {
        try {
            Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 -ErrorAction Stop
        } catch {
            # A log that cannot be written must never take the server down.
            Write-Host "$stamp [warn] could not write to $LogFile"
        }
    }
}

<#
  Roll a log over once it passes $MaxBytes, keeping $Keep older copies.

  Only ever called BEFORE the child process is started: the child holds the
  handle to its stdout file, and renaming a file out from under an open
  handle on Windows fails.
#>
function Invoke-LogRotation {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [int]$MaxBytes = 5242880,
        [int]$Keep = 3
    )
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $item = Get-Item -LiteralPath $Path
    if ($item.Length -lt $MaxBytes) { return }

    $dir = Split-Path -Parent $Path
    $name = [System.IO.Path]::GetFileNameWithoutExtension($Path)
    $ext = [System.IO.Path]::GetExtension($Path)

    $oldest = Join-Path $dir ("$name.$Keep$ext")
    if (Test-Path -LiteralPath $oldest) { Remove-Item -LiteralPath $oldest -Force -ErrorAction SilentlyContinue }
    for ($i = $Keep - 1; $i -ge 1; $i--) {
        $from = Join-Path $dir ("$name.$i$ext")
        $to = Join-Path $dir ("$name.$($i + 1)$ext")
        if (Test-Path -LiteralPath $from) { Move-Item -LiteralPath $from -Destination $to -Force -ErrorAction SilentlyContinue }
    }
    Move-Item -LiteralPath $Path -Destination (Join-Path $dir ("$name.1$ext")) -Force -ErrorAction SilentlyContinue
}

<#
  The API port, read from .env's API_PORT when it is set.

  The regex matches that one key and nothing else, so no other value in .env
  is ever read into a variable, let alone logged.
#>
function Get-ApiPort {
    $envFile = Join-Path $script:RepoRoot '.env'
    $port = 4000
    if (Test-Path -LiteralPath $envFile) {
        foreach ($line in (Get-Content -LiteralPath $envFile -ErrorAction SilentlyContinue)) {
            if ($line -match '^\s*API_PORT\s*=\s*(\d+)\s*$') { $port = [int]$Matches[1] }
        }
    }
    return $port
}

<# The PID listening on a port, or $null. #>
function Get-PortOwnerPid {
    param([Parameter(Mandatory = $true)][int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $conn) { return $null }
    return $conn.OwningProcess
}

<# Tunnel settings live in a file so the domain can change without editing a script. #>
function Get-TunnelConfig {
    $path = Join-Path $script:OpsDir 'tunnel.config.json'
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    try {
        return (Get-Content -LiteralPath $path -Raw -ErrorAction Stop | ConvertFrom-Json)
    } catch {
        return $null
    }
}

<#
  Anything that looks like a credential, blanked.

  status.ps1 prints log tails, and a log line can quote a URL with a token in
  it. Redacting on the way OUT is the belt to the braces of not logging it in
  the first place.
#>
function Hide-Secrets {
    param([string]$Text)
    if (-not $Text) { return $Text }
    $out = $Text
    $out = $out -replace '([?&](?:token|ticket|code|state|authtoken|key|secret)=)[^&\s]*', '$1<redacted>'
    $out = $out -replace '(?i)(bearer\s+)[A-Za-z0-9\._\-]+', '$1<redacted>'
    $out = $out -replace 'eyJ[A-Za-z0-9\._\-]{20,}', '<redacted-token>'
    $out = $out -replace '(?i)(authtoken\s*:\s*)\S+', '$1<redacted>'
    return $out
}
