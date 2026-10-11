$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$secretsPath = Join-Path $repo 'local-data/secrets'
if (Test-Path -LiteralPath $secretsPath) { throw 'Secrets already exist. Refusing to overwrite keys or invalidate data.' }
New-Item -ItemType Directory -Path $secretsPath -Force | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
# Restrict the directory BEFORE generating any credentials.
& icacls $secretsPath /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict secret ACLs; no credentials generated.' }
function New-LocalSecret {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}
$dbPassword = New-LocalSecret
$redisPassword = New-LocalSecret
$configuration = @{
  JWT_SECRET = New-LocalSecret
  LOCAL_INTERNAL_SECRET = New-LocalSecret
  LOCAL_TOKEN_KEY = New-LocalSecret
  DATABASE_URL = "postgresql://postiz:${dbPassword}@172.30.251.11:5432/postiz"
  REDIS_URL = "redis://:${redisPassword}@172.30.251.12:6379"
}
$utf8 = New-Object Text.UTF8Encoding $false
[IO.File]::WriteAllText((Join-Path $secretsPath 'config.json'), ($configuration | ConvertTo-Json), $utf8)
[IO.File]::WriteAllText((Join-Path $secretsPath 'database-password'), $dbPassword, $utf8)
[IO.File]::WriteAllText((Join-Path $secretsPath 'redis.conf'), "bind 0.0.0.0`nprotected-mode yes`nrequirepass $redisPassword`nsave `"`"`nappendonly no`n", $utf8)
Write-Host 'Local secrets created with restricted ACLs. No service started and no account connected.'
