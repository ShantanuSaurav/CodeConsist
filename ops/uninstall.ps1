<#
  Undoes ops\install.ps1: removes the three tasks, stops what they started,
  and puts the power settings back the way they were.

  Logs and backups are left alone - they are data, and this script is not the
  place to throw data away.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')

$names = @('CodeConsist Server', 'CodeConsist Tunnel', 'CodeConsist Backup')
$PowerBackup = Join-Path $script:OpsDir 'power-backup.txt'

Write-Host ''
Write-Host 'Removing the CodeConsist server tasks.'

foreach ($name in $names) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($null -eq $task) {
        Write-Host "  not installed: $name"
        continue
    }
    try { Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue } catch { }
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Write-Host "  removed: $name"
}

<#
  Stop the processes the supervisors started - and only those.

  Matched by command line against this repo's own paths, never by process
  name: killing every node.exe on the machine would take out unrelated work.
#>
$repoPattern = $script:RepoRoot.Replace('\', '\\')
$ours = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='ngrok.exe' OR Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and (
            $_.CommandLine -like "*$($script:RepoRoot)\server\index.js*" -or
            $_.CommandLine -like "*$($script:RepoRoot)\ops\server.ps1*" -or
            $_.CommandLine -like "*$($script:RepoRoot)\ops\tunnel.ps1*"
        )
    }

foreach ($p in $ours) {
    try {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
        Write-Host "  stopped PID $($p.ProcessId)"
    } catch {
        Write-Host "  could not stop PID $($p.ProcessId): $($_.Exception.Message)"
    }
}

# The tunnel is started by the supervisor but is its own process; match it by
# the reserved domain so an unrelated ngrok is left running.
$config = Get-TunnelConfig
if ($null -ne $config -and $config.domain) {
    $tunnels = Get-CimInstance Win32_Process -Filter "Name='ngrok.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like "*$($config.domain)*" }
    foreach ($t in $tunnels) {
        try {
            Stop-Process -Id $t.ProcessId -Force -ErrorAction Stop
            Write-Host "  stopped the tunnel (PID $($t.ProcessId))"
        } catch {
            Write-Host "  could not stop the tunnel (PID $($t.ProcessId)): $($_.Exception.Message)"
        }
    }
}

Write-Host ''
if (-not (Test-Path -LiteralPath $PowerBackup)) {
    Write-Host 'No ops\power-backup.txt, so the power settings were left as they are.'
    Write-Host 'If you want Windows'' defaults back, set sleep and lid behaviour in Settings > System > Power.'
} else {
    Write-Host 'Restoring the power settings recorded at install time:'
    $SUB_BUTTONS = '4f971e89-eebd-4455-a8de-9e59040e7347'
    $LIDACTION = '5ca83367-6e45-459f-a27b-476b1d01c936'
    foreach ($line in (Get-Content -LiteralPath $PowerBackup)) {
        if ($line -match '^\s*#') { continue }
        if ($line -notmatch '^\s*([a-z\-]+)\s*=\s*(.+)\s*$') { continue }
        $key = $Matches[1]
        $value = $Matches[2].Trim()
        # powercfg reports the index in hex (0x00000e10); /change wants minutes.
        $seconds = 0
        try { $seconds = [Convert]::ToInt32($value, 16) } catch { continue }
        $minutes = [int]($seconds / 60)
        switch ($key) {
            'standby-timeout-ac'   { powercfg /change standby-timeout-ac $minutes;   Write-Host "  standby-timeout-ac -> $minutes min" }
            'monitor-timeout-ac'   { powercfg /change monitor-timeout-ac $minutes;   Write-Host "  monitor-timeout-ac -> $minutes min" }
            'hibernate-timeout-ac' { powercfg /change hibernate-timeout-ac $minutes; Write-Host "  hibernate-timeout-ac -> $minutes min" }
            'lidaction-ac'         { powercfg /setacvalueindex SCHEME_CURRENT $SUB_BUTTONS $LIDACTION $seconds; Write-Host "  lid action on mains -> $seconds" }
        }
    }
    powercfg /setactive SCHEME_CURRENT
}

Write-Host ''
Write-Host 'Done. ops\logs and ops\backups were left where they are.'
Write-Host ''
