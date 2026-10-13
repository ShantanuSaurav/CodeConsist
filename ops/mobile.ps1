<#
  Show the addresses the native CodeConsist app can use to reach this PC.
  Read-only by default. -TestCompilers submits tiny programs to the API;
  it does not create accounts, alter progress or change firewall settings.

  powershell -ExecutionPolicy Bypass -File ops\mobile.ps1
  powershell -ExecutionPolicy Bypass -File ops\mobile.ps1 -TestCompilers
#>
[CmdletBinding()]
param(
    [ValidateRange(0, 65535)][int]$Port = 0,
    [switch]$TestCompilers,
    [switch]$AsJson
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')
if ($Port -eq 0) { $Port = Get-ApiPort }
$config = Get-TunnelConfig
$base = "https://$($config.domain)"
$headers = @{ 'ngrok-skip-browser-warning' = 'true' }
$addresses = @()
try {
    $addresses = @([System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | Where-Object {
        $_.OperationalStatus -eq 'Up' -and $_.GetIPProperties().GatewayAddresses.Count -gt 0
    } | ForEach-Object {
        $adapterName = $_.Name
        foreach ($ip in $_.GetIPProperties().UnicastAddresses) {
            $address = $ip.Address.ToString()
            if ($address -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)') {
                [pscustomobject]@{ Adapter = $adapterName; Url = "http://${address}:$Port" }
            }
        }
    })
} catch {
    # Diagnostics still work when this Windows networking command is unavailable.
}

$health = $null
$connectionError = $null
try {
    $health = Invoke-RestMethod -Uri "$base/api/health" -Headers $headers -TimeoutSec 20
    if (-not $health.ok) { $connectionError = 'The API did not report a healthy status.' }
} catch {
    $connectionError = 'The public API is not reachable. Start the existing PC server and tunnel with ops\up.ps1.'
}

$checks = @()
if ($health -and $TestCompilers) {
    $programs = @(
        @{ Language = 'javascript'; Code = 'console.log("mobile-ok")'; Input = '' },
        @{ Language = 'typescript'; Code = 'const message: string = "mobile-ok"; console.log(message)'; Input = '' },
        @{ Language = 'sql'; Code = "SELECT 'mobile-ok' AS result;"; Input = '' },
        @{ Language = 'python'; Code = 'print(input())'; Input = "mobile-ok`n" },
        @{ Language = 'c'; Code = "#include <stdio.h>`nint main(void){puts(`"mobile-ok`");return 0;}"; Input = '' },
        @{ Language = 'cpp'; Code = "#include <iostream>`nint main(){std::cout << `"mobile-ok`";}"; Input = '' },
        @{ Language = 'java'; Code = 'public class Main { public static void main(String[] args) { System.out.println("mobile-ok"); } }'; Input = '' },
        @{ Language = 'go'; Code = "package main`nimport `"fmt`"`nfunc main(){fmt.Println(`"mobile-ok`")}"; Input = '' }
    )
    foreach ($program in $programs) {
        try {
            $payload = @{ language = $program.Language; code = $program.Code; stdin = $program.Input; workflow = 'playground'; profile = 'standard' } | ConvertTo-Json
            $run = Invoke-RestMethod -Uri "$base/api/execute" -Headers $headers -Method Post -ContentType 'application/json' -Body $payload -TimeoutSec 60
            # Successful responses may omit stderr/stdout. StrictMode must not turn
            # an absent optional field into a false compiler failure.
            $stdout = if ($run.PSObject.Properties['stdout']) { $run.stdout } else { '' }
            $stderr = if ($run.PSObject.Properties['stderr']) { $run.stderr } else { '' }
            $checks += [pscustomobject]@{ Language = $program.Language; Status = $run.status; Output = $stdout; Error = $stderr }
        } catch {
            $checks += [pscustomobject]@{ Language = $program.Language; Status = 'unavailable'; Output = ''; Error = 'The API could not run this language. Check its compiler setup and retry.' }
        }
    }
}

$report = [pscustomobject]@{
    ApiReachable = [bool]($health -and -not $connectionError)
    Error = $connectionError
    AppServerUrl = $base
    PhoneAddresses = $addresses
    HasMobileCapabilities = [bool]($health -and $health.PSObject.Properties['serverRuntimes'])
    CompilerChecks = $checks
}
if ($AsJson) { $report | ConvertTo-Json -Depth 6; return }

Write-Host ''
Write-Host 'CodeConsist mobile connection' -ForegroundColor Cyan
if ($report.ApiReachable) { Write-Host 'PC API: running' -ForegroundColor Green }
else { Write-Host $connectionError -ForegroundColor Yellow }
Write-Host "App server (configured automatically): $base"
Write-Host 'The app works over Wi-Fi or mobile data. Keep the PC and ngrok tunnel running.'
if ($health -and -not $report.HasMobileCapabilities) {
    Write-Host 'Restart the existing API once to load the mobile Python fallback and server capability report.' -ForegroundColor Yellow
}
if ($checks.Count -gt 0) { $checks | Format-Table Language, Status, Output, Error -Wrap }
Write-Host ''
Write-Host 'No phone address setup, shared Wi-Fi, or firewall changes are required for the tunnel.'
