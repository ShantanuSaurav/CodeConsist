<#
  Watch the server's logs as they happen - the equivalent of leaving a
  terminal open on `npm run dev`, except the server is running as a task.

     powershell -ExecutionPolicy Bypass -File ops\logs.ps1            # requests, live
     powershell -ExecutionPolicy Bypass -File ops\logs.ps1 -Which all # everything, live
     powershell -ExecutionPolicy Bypass -File ops\logs.ps1 -Tail 100  # last 100 lines, then follow

  Ctrl+C stops watching. It never touches the server.

  Which file is which:
    server.log             every request the API answered
    server-supervisor.log  starts, builds, crashes, restarts
    server.err.log         anything the API wrote to stderr
    tunnel-supervisor.log  the tunnel, including the watchdog's verdicts
    backup.log             database backups
#>
[CmdletBinding()]
param(
    [ValidateSet('requests', 'server', 'tunnel', 'backup', 'errors', 'all')]
    [string]$Which = 'requests',
    [int]$Tail = 20,
    # Print what is there and exit, instead of following.
    [switch]$NoFollow
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')

$map = @{
    requests = @('server.log')
    server   = @('server-supervisor.log', 'server.err.log')
    tunnel   = @('tunnel-supervisor.log')
    backup   = @('backup.log')
    errors   = @('server.err.log', 'tunnel.err.log', 'build.err.log')
    all      = @('server.log', 'server-supervisor.log', 'server.err.log', 'tunnel-supervisor.log', 'backup.log')
}

$files = @()
foreach ($name in $map[$Which]) {
    $path = Join-Path $script:LogDir $name
    if (Test-Path -LiteralPath $path) { $files += $path }
}

if ($files.Count -eq 0) {
    Write-Host "No logs yet for '$Which'. Has the server run? Try ops\status.ps1."
    exit 0
}

<#
  Get-Content -Wait follows ONE file. For several, poll instead and print only
  what is new, tagging each line with its file so the streams stay readable.
#>
if ($files.Count -eq 1 -and -not $NoFollow) {
    $file = $files[0]
    Write-Host "Watching $(Split-Path -Leaf $file) - Ctrl+C to stop."
    Write-Host ''
    Get-Content -LiteralPath $file -Tail $Tail -Wait | ForEach-Object { Hide-Secrets -Text $_ }
    exit 0
}

$positions = @{}
foreach ($file in $files) {
    $lines = @(Get-Content -LiteralPath $file -ErrorAction SilentlyContinue)
    $label = [System.IO.Path]::GetFileNameWithoutExtension($file)
    $start = [Math]::Max(0, $lines.Count - $Tail)
    for ($i = $start; $i -lt $lines.Count; $i++) {
        Write-Host ("[{0}] {1}" -f $label, (Hide-Secrets -Text $lines[$i]))
    }
    $positions[$file] = $lines.Count
}

if ($NoFollow) { exit 0 }

Write-Host ''
Write-Host 'Watching for new lines - Ctrl+C to stop.'
while ($true) {
    Start-Sleep -Seconds 2
    foreach ($file in $files) {
        $lines = @(Get-Content -LiteralPath $file -ErrorAction SilentlyContinue)
        $seen = $positions[$file]
        # A rotated (or truncated) file starts over rather than replaying nothing.
        if ($lines.Count -lt $seen) { $seen = 0 }
        if ($lines.Count -gt $seen) {
            $label = [System.IO.Path]::GetFileNameWithoutExtension($file)
            for ($i = $seen; $i -lt $lines.Count; $i++) {
                Write-Host ("[{0}] {1}" -f $label, (Hide-Secrets -Text $lines[$i]))
            }
            $positions[$file] = $lines.Count
        }
    }
}
