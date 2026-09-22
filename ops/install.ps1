<#
  The only script here that changes this machine.

  It registers three scheduled tasks and relaxes the sleep settings WHILE ON
  MAINS ONLY. Battery settings are left exactly as they are on purpose: a
  laptop that never sleeps on battery is a laptop that cooks itself in a bag.

  Safe to run twice - existing tasks are replaced, and the original power
  values are only recorded the first time, so a second run cannot overwrite
  the record with values this script already changed.

  Run it from an ordinary PowerShell window:
     powershell -ExecutionPolicy Bypass -File ops\install.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')
Initialize-OpsDirs

$TaskServer = 'CodeConsist Server'
$TaskTunnel = 'CodeConsist Tunnel'
$TaskBackup = 'CodeConsist Backup'
$PowerBackup = Join-Path $script:OpsDir 'power-backup.txt'

$me = "$env:USERDOMAIN\$env:USERNAME"
Write-Host ''
Write-Host "Installing the CodeConsist server tasks for $me"
Write-Host "Repo: $script:RepoRoot"
Write-Host ''

function New-SupervisedTask {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Script,
        [Parameter(Mandatory = $true)][string]$Description,
        # The API window is meant to be SEEN - it is where the request log
        # scrolls past, the way `npm run dev` used to. The tunnel has nothing
        # worth watching, so it stays out of the way.
        [switch]$Hidden
    )
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $style = 'Normal'
    if ($Hidden) { $style = 'Hidden' }
    $action = New-ScheduledTaskAction -Execute $ps `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle $style -File `"$Script`"" `
        -WorkingDirectory $script:RepoRoot

    # Logon only, deliberately. An -AtStartup trigger needs an elevated
    # install, and would buy nothing here: these tasks run AS this user, so
    # they cannot do anything before this user is logged in anyway.
    $triggers = @( New-ScheduledTaskTrigger -AtLogOn -User $me )

    # ExecutionTimeLimit 0 = never kill it. The default is three days, which is
    # exactly the kind of thing that "mysteriously" stops a server mid-week.
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew `
        -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero)

    Register-ScheduledTask -TaskName $Name -Action $action -Trigger $triggers `
        -Settings $settings -Description $Description -Force | Out-Null
    Write-Host "  registered: $Name"
}

New-SupervisedTask -Name $TaskServer -Script (Join-Path $script:OpsDir 'server.ps1') `
    -Description 'Keeps the CodeConsist API running (ops\server.ps1).'
New-SupervisedTask -Name $TaskTunnel -Script (Join-Path $script:OpsDir 'tunnel.ps1') -Hidden `
    -Description 'Keeps the ngrok tunnel to the CodeConsist API up (ops\tunnel.ps1).'

# The backup runs daily and again at logon, so a laptop that is off at 03:00
# still gets a copy when it comes back.
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$backupAction = New-ScheduledTaskAction -Execute $ps `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $script:OpsDir 'backup-db.ps1')`"" `
    -WorkingDirectory $script:RepoRoot
$backupTriggers = @(
    (New-ScheduledTaskTrigger -Daily -At '3:00AM'),
    (New-ScheduledTaskTrigger -AtLogOn -User $me)
)
# Same reason as above: no -AtStartup, so this installs without elevation.
$backupSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskBackup -Action $backupAction -Trigger $backupTriggers `
    -Settings $backupSettings -Description 'Backs up server\data\db.json (ops\backup-db.ps1).' -Force | Out-Null
Write-Host "  registered: $TaskBackup"

Write-Host ''
Write-Host 'Power settings (mains only - battery behaviour is left alone):'

# GUIDs: SUB_BUTTONS \ LIDACTION.
$SUB_BUTTONS = '4f971e89-eebd-4455-a8de-9e59040e7347'
$LIDACTION = '5ca83367-6e45-459f-a27b-476b1d01c936'

<#
  Read one AC setting as hex, or $null when this machine does not expose it.
  Lid behaviour in particular is hidden on some laptops, and a missing setting
  must not take the whole install down after the tasks are already registered.
#>
function Get-AcSettingIndex {
    param([string]$SubGroup, [string]$Setting)
    $raw = powercfg /query SCHEME_CURRENT $SubGroup $Setting 2>&1
    $match = $raw | Select-String 'Current AC Power Setting Index'
    if ($null -eq $match) { return $null }
    return $match.ToString().Split(':')[-1].Trim()
}

if (-not (Test-Path -LiteralPath $PowerBackup)) {
    # Record the CURRENT values once, before anything is changed, so uninstall
    # can put them back. Running install again must not re-record the values
    # this script itself set.
    $before = @()
    $before += "# Recorded by ops\install.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    $before += "# Restore with ops\uninstall.ps1"
    foreach ($s in @(
        @{ key = 'standby-timeout-ac';   sub = 'SUB_SLEEP'; name = 'STANDBYIDLE' },
        @{ key = 'monitor-timeout-ac';   sub = 'SUB_VIDEO'; name = 'VIDEOIDLE' },
        @{ key = 'hibernate-timeout-ac'; sub = 'SUB_SLEEP'; name = 'HIBERNATEIDLE' },
        @{ key = 'lidaction-ac';         sub = $SUB_BUTTONS; name = $LIDACTION }
    )) {
        $value = Get-AcSettingIndex -SubGroup $s.sub -Setting $s.name
        if ($null -eq $value) {
            Write-Host "  (this machine does not expose $($s.key) - leaving it alone)"
        } else {
            $before += "$($s.key)=$value"
        }
    }
    Set-Content -LiteralPath $PowerBackup -Value $before -Encoding UTF8
    Write-Host '  previous values saved to ops\power-backup.txt'
} else {
    Write-Host '  ops\power-backup.txt already exists - keeping the original values recorded there.'
}

powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change disk-timeout-ac 0
powercfg /change monitor-timeout-ac 15
# Only touch the lid if this machine actually has the setting.
if ($null -ne (Get-AcSettingIndex -SubGroup $SUB_BUTTONS -Setting $LIDACTION)) {
    powercfg /setacvalueindex SCHEME_CURRENT $SUB_BUTTONS $LIDACTION 0
    Write-Host '  on mains: never sleeps or hibernates, and closing the lid does nothing'
} else {
    Write-Host '  on mains: never sleeps or hibernates. Lid behaviour is not exposed here -'
    Write-Host '            set "Closing the lid: Do nothing (plugged in)" in Control Panel > Power Options if it sleeps on close.'
}
powercfg /setactive SCHEME_CURRENT

Write-Host ''
Write-Host 'Done. What happens now:'
Write-Host '  - The API starts when you log in, in its own window, with the request log scrolling.'
Write-Host '  - The tunnel starts alongside it, quietly. Both restart themselves if they crash.'
Write-Host '  - The database is backed up daily and at logon, into ops\backups.'
Write-Host ''
Write-Host 'Still yours to do:'
Write-Host '  1. Stop any "npm run dev" you have running - the task serves the built app on the same port.'
Write-Host '  2. Start them now without rebooting:'
Write-Host '       Start-ScheduledTask -TaskName "CodeConsist Server"'
Write-Host '       Start-ScheduledTask -TaskName "CodeConsist Tunnel"'
Write-Host '  3. Check it:  powershell -ExecutionPolicy Bypass -File ops\status.ps1'
Write-Host ''
Write-Host 'The laptop must stay logged in for these tasks to run. Undo everything with ops\uninstall.ps1.'
Write-Host ''
