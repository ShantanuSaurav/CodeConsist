<#
  Copies server\data\db.json aside.

  That one file is every learner account, their progress and saved code, every
  order, every certificate. There is no other copy. A backup is taken only
  when the contents actually changed, so a quiet week does not produce 30
  identical files and push the real history out of the window.

  .env is deliberately NOT backed up: it is secrets, and a copy of it lying
  around is a second place to leak from.
#>
[CmdletBinding()]
param(
    [int]$Keep = 30
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')
Initialize-OpsDirs

$Log = Join-Path $script:LogDir 'backup.log'
Invoke-LogRotation -Path $Log

$source = Join-Path $script:RepoRoot 'server\data\db.json'
$backupDir = Join-Path $script:OpsDir 'backups'
if (-not (Test-Path -LiteralPath $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $source)) {
    Write-OpsLog -LogFile $Log -Level 'warn' -Message "No database at $source - nothing to back up yet."
    exit 0
}

<#
  Refuse to back up a file that is not valid JSON.

  db.json is written atomically (temp file + rename in server/db.js), so a
  torn read should not happen - but a backup is worthless if it is not a
  database, and copying garbage over the rotation window would destroy the
  good copies behind it.
#>
$raw = $null
try {
    $raw = Get-Content -LiteralPath $source -Raw -ErrorAction Stop
} catch {
    Write-OpsLog -LogFile $Log -Level 'error' -Message "Could not read the database: $($_.Exception.Message)"
    exit 1
}

$parsed = $null
try {
    $parsed = $raw | ConvertFrom-Json -ErrorAction Stop
} catch {
    Write-OpsLog -LogFile $Log -Level 'error' -Message 'The database did not parse as JSON - NOT backing it up (the existing backups are the good copies).'
    exit 1
}

# Cheap sanity counts, so a truncated-but-parsable file is obvious in the log.
$users = 0
$orders = 0
$certs = 0
if ($null -ne $parsed.PSObject.Properties['users'] -and $null -ne $parsed.users) { $users = @($parsed.users).Count }
if ($null -ne $parsed.PSObject.Properties['orders'] -and $null -ne $parsed.orders) { $orders = @($parsed.orders.PSObject.Properties).Count }
if ($null -ne $parsed.PSObject.Properties['certificates'] -and $null -ne $parsed.certificates) { $certs = @($parsed.certificates.PSObject.Properties).Count }

$hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
# @() so a single result - or none - still has .Count under Set-StrictMode.
$existing = @(Get-ChildItem -LiteralPath $backupDir -Filter 'db-*.json' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending)

if ($existing.Count -gt 0) {
    $newestHash = (Get-FileHash -LiteralPath $existing[0].FullName -Algorithm SHA256).Hash
    if ($newestHash -eq $hash) {
        Write-OpsLog -LogFile $Log -Message "Unchanged since $($existing[0].Name) - no new backup. (users: $users, orders: $orders, certificates: $certs)"
        exit 0
    }
}

$stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$target = Join-Path $backupDir "db-$stamp.json"
Copy-Item -LiteralPath $source -Destination $target -Force

$size = (Get-Item -LiteralPath $target).Length
Write-OpsLog -LogFile $Log -Message "Backed up to $(Split-Path -Leaf $target) - $size bytes (users: $users, orders: $orders, certificates: $certs)."

# Rotate, newest first, never touching the one just written.
$all = @(Get-ChildItem -LiteralPath $backupDir -Filter 'db-*.json' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending)
if ($all.Count -gt $Keep) {
    foreach ($old in $all[$Keep..($all.Count - 1)]) {
        Remove-Item -LiteralPath $old.FullName -Force -ErrorAction SilentlyContinue
        Write-OpsLog -LogFile $Log -Message "Removed the old backup $($old.Name)."
    }
}
