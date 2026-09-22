<#
  Stop the server and the tunnel, leaving the scheduled tasks installed so
  they come back at the next logon (or with ops\start.ps1).

     powershell -ExecutionPolicy Bypass -File ops\stop.ps1

  To remove the tasks entirely, use ops\uninstall.ps1 instead.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')

foreach ($name in @('CodeConsist Tunnel', 'CodeConsist Server')) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($null -eq $task) {
        Write-Host "  $name is not installed."
        continue
    }
    if ($task.State -ne 'Running') {
        Write-Host "  $name was already stopped."
        continue
    }
    Stop-ScheduledTask -TaskName $name
    Write-Host "  $name stopped."
}

<#
  Stopping the task kills the supervisor, but the API or ngrok it spawned can
  outlive it - and a leftover node on port 4000 blocks the next start. Clear
  only the ones belonging to THIS repo; never every node.exe on the machine.
#>
Start-Sleep -Seconds 2
$config = Get-TunnelConfig
$strays = @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='ngrok.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and (
            $_.CommandLine -like "*$($script:RepoRoot)\server\index.js*" -or
            ($null -ne $config -and $config.domain -and $_.CommandLine -like "*$($config.domain)*")
        )
    })

foreach ($p in $strays) {
    try {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
        Write-Host "  cleared leftover PID $($p.ProcessId)."
    } catch {
        Write-Host "  could not clear PID $($p.ProcessId): $($_.Exception.Message)"
    }
}

Write-Host ''
Write-Host 'Stopped. Start it again with ops\start.ps1, or just log out and back in.'
Write-Host ''
