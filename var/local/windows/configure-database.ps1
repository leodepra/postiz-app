# Run interactively. Does not connect to Supabase or change a database password.
param([string]$DatabaseHost = '')
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$secretDirectory = Join-Path $workspace 'local-data/secrets'
$configurationFile = Join-Path $secretDirectory 'windows-config.json'
if (Test-Path -LiteralPath $configurationFile) { throw 'Configuration exists. Refusing to replace credentials or encryption keys.' }
foreach ($relative in @('local-data', 'local-data/secrets')) {
    $candidate = Join-Path $workspace $relative
    if ((Test-Path -LiteralPath $candidate) -and ((Get-Item -LiteralPath $candidate -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Refusing a redirected configuration directory.'
    }
}
if (-not $databaseHost) {
    $databaseHost = Read-Host 'Host from Supabase Connect (direct or Session pooler, port 5432)'
}
$databaseHost = $databaseHost.Trim()
if ($databaseHost -notmatch '^(db\.[a-z0-9]+\.supabase\.co|aws-[a-z0-9-]+\.pooler\.supabase\.com)$') { throw 'Unsupported Supabase hostname.' }
$projectReference = 'thsrbqsthuklrxwobcrv'
if ($databaseHost.StartsWith('db.') -and $databaseHost -ne "db.$projectReference.supabase.co") { throw 'The hostname does not match the approved Clips-Imagens project.' }
$databaseUser = if ($databaseHost.EndsWith('.pooler.supabase.com')) { "postiz_app.$projectReference" } else { 'postiz_app' }
Write-Host "Database host: $databaseHost | User: $databaseUser"
$securePassword = Read-Host 'Password configured for postiz_app (not the postgres administrator password)' -AsSecureString
if ($securePassword.Length -lt 24) { throw 'Use a unique password with at least 24 characters.' }

[IO.Directory]::CreateDirectory($secretDirectory) | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$systemIdentity = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$acl = Get-Acl -LiteralPath $secretDirectory
$acl.SetAccessRuleProtection($true, $false)
foreach ($existingRule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($existingRule) }
foreach ($principal in @($identity, $systemIdentity)) {
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($principal, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $secretDirectory -AclObject $acl
$verifiedAcl = Get-Acl -LiteralPath $secretDirectory
if (-not $verifiedAcl.AreAccessRulesProtected) { throw 'Could not protect secret directory.' }
foreach ($rule in $verifiedAcl.Access) {
    $ruleSid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if ($rule.AccessControlType -eq 'Allow' -and $ruleSid -notin @($identity.Value, $systemIdentity.Value)) { throw 'Unexpected secret directory access.' }
}
function New-LocalKey {
    $bytes = [byte[]]::new(32)
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $encodedPassword = [Uri]::EscapeDataString([Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer))
    $configuration = @{
        POSTIZ_DATABASE_HOST = $databaseHost
        DATABASE_URL = "postgresql://${databaseUser}:${encodedPassword}@${databaseHost}:5432/postgres?schema=postiz&sslmode=require&sslaccept=strict&connection_limit=3"
        JWT_SECRET = New-LocalKey
        LOCAL_INTERNAL_SECRET = New-LocalKey
        LOCAL_TOKEN_KEY = New-LocalKey
    }
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($configuration | ConvertTo-Json))
    $stream = [IO.File]::Open($configurationFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose(); [Array]::Clear($bytes, 0, $bytes.Length) }
    $frontendFile = Join-Path $secretDirectory 'frontend-config.json'
    $frontendBytes = [Text.UTF8Encoding]::new($false).GetBytes((@{ LOCAL_INTERNAL_SECRET = $configuration.LOCAL_INTERNAL_SECRET } | ConvertTo-Json))
    $frontendStream = [IO.File]::Open($frontendFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $frontendStream.Write($frontendBytes, 0, $frontendBytes.Length) } finally { $frontendStream.Dispose(); [Array]::Clear($frontendBytes, 0, $frontendBytes.Length) }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    $securePassword.Dispose()
    $encodedPassword = $null
    $configuration = $null
}
Write-Host 'Configuration saved with restricted ACLs. No connection tested and no service started.'
Write-Host $configurationFile
