# Read-only inventory. A successful inventory is NOT security approval.
$ErrorActionPreference = 'Stop'
$checks = [System.Collections.Generic.List[object]]::new()
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$runtimes = @{
    node = 'local-data/runtime/node-v22.23.3-win-x64/node.exe'
    temporal = 'local-data/runtime/temporal/temporal.exe'
    caddy = 'local-data/runtime/caddy/caddy.exe'
}
foreach ($binary in $runtimes.Keys) {
    $binaryPath = Join-Path $projectRoot $runtimes[$binary]
    $checks.Add([pscustomobject]@{ component = $binary; installed = (Test-Path -LiteralPath $binaryPath); path = $binaryPath })
}
$nodePath = Join-Path $projectRoot $runtimes.node
$nodeVersion = if (Test-Path -LiteralPath $nodePath) { & $nodePath --version } else { $null }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
[pscustomobject]@{
    readyForUse = $false
    runtime = 'Windows native (candidate)'
    database = 'Supabase PostgreSQL; Redis is not required in this profile'
    nodeVersion = $nodeVersion
    node22Required = $true
    elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    components = $checks
    pending = @('Restricted service identity and ACLs', 'OS egress enforcement', 'Media and scheduling end-to-end tests', 'Google OAuth client')
} | ConvertTo-Json -Depth 4
