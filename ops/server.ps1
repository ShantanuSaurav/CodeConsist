<#
  Keeps the CodeConsist API running.

  Production, not `npm run dev`: one plain `node server/index.js` with no
  --watch. The dev watcher restarts the process whenever a watched file
  changes and leaves the old one retrying its listen(), which is how five
  orphaned servers ended up on this machine. A permanent server runs exactly
  one process and this script restarts it only when it actually exits.

  Started by the "CodeConsist Server" scheduled task (ops\install.ps1), or by
  hand for a look:  powershell -ExecutionPolicy Bypass -File ops\server.ps1
#>
[CmdletBinding()]
param(
    # Stop after this many restarts - only used by the tests/by hand; 0 means never stop.
    [int]$MaxRestarts = 0
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')
Initialize-OpsDirs

# Three separate files on purpose: the child process holds an open handle to
# its stdout and stderr, and a second writer to the same path fails on Windows.
$SupLog = Join-Path $script:LogDir 'server-supervisor.log'
$OutLog = Join-Path $script:LogDir 'server.log'
$ErrLog = Join-Path $script:LogDir 'server.err.log'
$Port = Get-ApiPort

Write-OpsLog -LogFile $SupLog -Message "--- supervisor starting (repo: $script:RepoRoot, port: $Port) ---"

<#
  Refuse to be the second server.

  server/index.js retries listen() on EADDRINUSE forever, so a second copy
  does not crash - it sits there spinning. Better to notice and stop.
#>
$owner = Get-PortOwnerPid -Port $Port
if ($null -ne $owner) {
    $ownerProc = Get-Process -Id $owner -ErrorAction SilentlyContinue
    $who = 'unknown process'
    if ($null -ne $ownerProc) { $who = "$($ownerProc.ProcessName) (PID $owner)" }
    Write-OpsLog -LogFile $SupLog -Level 'warn' -Message "Port $Port is already served by $who - this supervisor is not needed. Stop that process first if you meant to take over."
    exit 0
}

<# Is dist/ newer than the sources it was built from? #>
function Test-BuildFresh {
    $index = Join-Path $script:RepoRoot 'dist\index.html'
    if (-not (Test-Path -LiteralPath $index)) { return $false }
    $builtAt = (Get-Item -LiteralPath $index).LastWriteTimeUtc
    $srcDir = Join-Path $script:RepoRoot 'src'
    if (-not (Test-Path -LiteralPath $srcDir)) { return $true }
    $newest = Get-ChildItem -LiteralPath $srcDir -Recurse -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($null -eq $newest) { return $true }
    return ($builtAt -ge $newest.LastWriteTimeUtc)
}

<#
  Build if the sources moved on. A failed build is logged and then ignored:
  the previous dist keeps being served, and the API - which is what Vercel
  actually calls - starts either way. Serving nothing would be worse.
#>
function Invoke-BuildIfStale {
    if (Test-BuildFresh) {
        Write-OpsLog -LogFile $SupLog -Message 'Build is current.'
        return
    }
    Write-OpsLog -LogFile $SupLog -Message 'Sources are newer than dist - building...'
    $buildOut = Join-Path $script:LogDir 'build.log'
    $buildErr = Join-Path $script:LogDir 'build.err.log'
    Invoke-LogRotation -Path $buildOut
    Invoke-LogRotation -Path $buildErr
    try {
        $npm = Join-Path $env:ProgramFiles 'nodejs\npm.cmd'
        if (-not (Test-Path -LiteralPath $npm)) { $npm = 'npm.cmd' }
        $p = Start-Process -FilePath $npm -ArgumentList 'run', 'build' `
            -WorkingDirectory $script:RepoRoot -NoNewWindow -PassThru -Wait `
            -RedirectStandardOutput $buildOut -RedirectStandardError $buildErr
        if ($p.ExitCode -eq 0) {
            Write-OpsLog -LogFile $SupLog -Message 'Build finished.'
        } else {
            Write-OpsLog -LogFile $SupLog -Level 'warn' -Message "Build failed (exit $($p.ExitCode)); serving the previous dist. See logs\build.err.log."
        }
    } catch {
        Write-OpsLog -LogFile $SupLog -Level 'warn' -Message "Build could not be started: $($_.Exception.Message)"
    }
}

Invoke-BuildIfStale

$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
if (-not (Test-Path -LiteralPath $node)) { $node = 'node.exe' }
$entry = Join-Path $script:RepoRoot 'server\index.js'

$delay = 2
$restarts = 0

<#
  node now runs in the foreground (see the loop below), so when this script is
  stopped - Ctrl+C, or Stop-ScheduledTask - the console it belongs to takes
  node down with it. There is no separate child handle left to clean up.
#>

while ($true) {
    Invoke-LogRotation -Path $OutLog
    Invoke-LogRotation -Path $ErrLog

    $startedAt = Get-Date
    Write-OpsLog -LogFile $SupLog -Message "Starting the API on port $Port."
    $exitCode = 'unknown'
    try {
        $env:NODE_ENV = 'production'
        Push-Location $script:RepoRoot
        # A tee by hand, NOT Tee-Object: in PowerShell 5.1 that cmdlet writes
        # UTF-16 and has no -Encoding, so the log came out as spaced-apart
        # characters. This sends each line to the console (a visible window
        # then reads like `npm run dev` did) and appends it to the file as
        # UTF-8 for ops\logs.ps1 and status.ps1.
        #
        # The colour codes are kept on screen and stripped from the file:
        # escape sequences are noise in a log somebody greps later.
        #
        # `&` blocks until node exits, which is what the loop wants anyway -
        # and it means Ctrl+C in that window stops the server, as a person
        # watching a console would expect.
        & $node $entry 2>&1 | ForEach-Object {
            $line = [string]$_
            Write-Host $line
            $plain = $line -replace "$([char]27)\[[0-9;]*m", ''
            if ($plain.Trim().Length -gt 0) {
                Add-Content -LiteralPath $OutLog -Value $plain -Encoding UTF8 -ErrorAction SilentlyContinue
            }
        }
        $exitCode = $LASTEXITCODE
        Pop-Location
    } catch {
        Pop-Location -ErrorAction SilentlyContinue
        Write-OpsLog -LogFile $SupLog -Level 'error' -Message "Could not start node: $($_.Exception.Message)"
    }

    $ranFor = [int]((Get-Date) - $startedAt).TotalSeconds
    Write-OpsLog -LogFile $SupLog -Level 'warn' -Message "The API exited with code $exitCode after $ranFor seconds."
    # A process that stayed up is a one-off, not a crash loop: start over at 2 s.
    if ($ranFor -ge 60) { $delay = 2 }

    $restarts = $restarts + 1
    if ($MaxRestarts -gt 0 -and $restarts -ge $MaxRestarts) {
        Write-OpsLog -LogFile $SupLog -Message "Reached the restart limit of $MaxRestarts - stopping."
        break
    }

    Write-OpsLog -LogFile $SupLog -Message "Restarting in $delay seconds."
    Start-Sleep -Seconds $delay
    # Backoff caps at a minute: a server that cannot start must not spin the CPU.
    $delay = [Math]::Min($delay * 2, 60)
}
