<#
  Start the server, safely.

  Why this exists instead of a bare Start-ScheduledTask: running that against
  a task that is ALREADY running does not politely do nothing - it ends the
  instance that was happily serving. That is how a healthy server got taken
  down once. So: look first, and only start what is actually stopped.

     powershell -ExecutionPolicy Bypass -File ops\start.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')

$port = Get-ApiPort

foreach ($name in @('CodeConsist Server', 'CodeConsist Tunnel')) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($null -eq $task) {
        Write-Host "  $name is not installed - run ops\install.ps1 first."
        continue
    }
    if ($task.State -eq 'Running') {
        Write-Host "  $name is already running - left alone."
        continue
    }
    Start-ScheduledTask -TaskName $name
    Write-Host "  $name started."
    # The tunnel waits for the API anyway, but starting them together makes
    # its first health check fail for no reason.
    if ($name -eq 'CodeConsist Server') { Start-Sleep -Seconds 5 }
}

Write-Host ''
Write-Host 'Waiting for the API to answer...'
$up = $false
for ($i = 1; $i -le 40; $i++) {
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:$port/api/health" -TimeoutSec 3 -ErrorAction Stop
        if ($health.ok) {
            Write-Host "  up - $($health.challenges) challenges, $($health.users) users."
            $up = $true
            break
        }
    } catch { }
    Start-Sleep -Seconds 3
}
if (-not $up) {
    Write-Host '  the API has not answered yet. It may still be building (first start takes ~40s).'
    Write-Host '  Look at ops\logs\server-supervisor.log, then run ops\status.ps1.'
}
Write-Host ''
