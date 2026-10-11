$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$configPath = Join-Path $projectRoot 'local-data/secrets/windows-config.json'
if (!(Test-Path -LiteralPath $configPath)) { throw 'Configure the database first.' }
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$clientId = (Read-Host 'Google OAuth Client ID (Web application)').Trim()
if ($clientId -notmatch '^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$') { throw 'Invalid Google client ID.' }
$secureSecret = Read-Host 'Google OAuth Client Secret (hidden)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
$temporaryPath = Join-Path (Split-Path $configPath) ('oauth-' + [Guid]::NewGuid().ToString('N') + '.tmp')
try {
    $clientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($clientSecret.Length -lt 16 -or $clientSecret -match '\s') { throw 'Invalid Google client secret.' }
    $config | Add-Member -NotePropertyName YOUTUBE_CLIENT_ID -NotePropertyValue $clientId -Force
    $config | Add-Member -NotePropertyName YOUTUBE_CLIENT_SECRET -NotePropertyValue $clientSecret -Force
    [IO.File]::WriteAllText($temporaryPath, ($config | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
    Set-Acl -LiteralPath $temporaryPath -AclObject (Get-Acl -LiteralPath $configPath)
    [IO.File]::Replace($temporaryPath, $configPath, $null)
    Write-Host 'YouTube credentials saved locally. Database credentials and encryption keys preserved.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secureSecret.Dispose()
    $clientSecret = $null
    if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath }
}
