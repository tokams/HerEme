[CmdletBinding()]
param(
    [string]$HostName = '46.251.249.110',
    [string]$UserName = 'dongjel',
    [string]$IdentityFile = "$env:USERPROFILE\.ssh\dongjel_relay",
    [string]$RemoteDirectory = '/home/dongjel/services/hereme',
    [switch]$Plan,
    [switch]$CredentialsOnly
)
$ErrorActionPreference = 'Stop'
if ($HostName -notmatch '^\d{1,3}(\.\d{1,3}){3}$' -or $UserName -notmatch '^[a-z][a-z0-9_-]*$' -or
    $RemoteDirectory -notmatch '^(/[A-Za-z0-9_-]+)+$') { throw 'Invalid SSH address, account or legacy deployment path.' }
$platform = "$RemoteDirectory-platform"
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ($Plan) {
    Write-Output "Deploy the committed release to hereme.no, tanteulrikkesvei.hereme.no and admin.hereme.no. Preserve the main site's data, Git and certificate volumes. Retain backups under $platform and verify the deployed sites over HTTPS."
    return
}
$connection = "$UserName@$HostName"
$identity = (Resolve-Path $IdentityFile).Path
$options = @('-i',$identity,'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no')
$runId = [Guid]::NewGuid().ToString('N')
if (-not $CredentialsOnly) {
    & ssh @options $connection "test -s '$platform/state/legal.json'"
    if ($LASTEXITCODE -ne 0) {
        throw "Reviewed legal settings are missing at $platform/state/legal.json. Fill both instance entries using deploy/platform/legal.example.json after the contact mailbox and processor details are verified. The existing deployment was not changed."
    }
    $dirty = & git -C $repo status --porcelain --untracked-files=all
    if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Commit the reviewed changes before deploying. The release is built from a clean Git HEAD.' }
    $revision = (& git -C $repo rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $revision -notmatch '^[0-9a-f]{40}$') { throw 'Cannot determine the committed revision.' }
    $release = "$platform/releases/$revision-$runId"
    $archive = Join-Path ([IO.Path]::GetTempPath()) "hereme-$runId.tar.gz"
    try {
        & git -C $repo archive --format=tar.gz "--output=$archive" 'HEAD:hereme-poc'
        if ($LASTEXITCODE -ne 0) { throw 'Could not package the committed release.' }
        & ssh @options $connection "umask 077 && mkdir -p '$platform/releases' && mkdir '$release'"
        if ($LASTEXITCODE -ne 0) { throw 'Could not create a new private release directory.' }
        & scp @options $archive "${connection}:$release/source.tar.gz"
        if ($LASTEXITCODE -ne 0) { throw 'Could not transfer the release archive.' }
        $checksum = (Get-FileHash -Algorithm SHA256 $archive).Hash.ToLowerInvariant()
        & ssh @options $connection "set -eu; umask 077; cd '$release'; echo '$checksum  source.tar.gz' | sha256sum -c -; (umask 022 && tar xzf source.tar.gz); rm source.tar.gz; python3 deploy/platform/release.py '$RemoteDirectory' '$platform' '$revision'"
        if ($LASTEXITCODE -ne 0) { throw "Cutover failed. See the first remote error and $platform/backups before retrying." }
    } finally {
        if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive }
    }
}
$secrets = Join-Path $repo 'secrets'
[IO.Directory]::CreateDirectory($secrets) | Out-Null
$private = Join-Path $secrets ".download-$runId"
[IO.Directory]::CreateDirectory($private) | Out-Null
try {
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls $private /inheritance:r /grant:r "*${sid}:(OI)(CI)F" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not protect the credential download directory.' }
    foreach ($name in @('platform-operator.txt','tanteulrikkesvei-staff-credentials.txt')) {
        $dest = Join-Path $secrets $name
        $newFile = Join-Path $private $name
        & scp @options "${connection}:$platform/state/secrets/$name" $newFile
        if ($LASTEXITCODE -ne 0) { throw 'Credential download failed. Retry with -CredentialsOnly.' }
        if (Test-Path -LiteralPath $dest) {
            if ((Get-FileHash $dest).Hash -ne (Get-FileHash $newFile).Hash) { throw "Credential conflict at $dest. Review the existing file before retrying with -CredentialsOnly." }
        } else {
            & icacls $newFile /inheritance:r /grant:r "*${sid}:F" | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Could not protect the downloaded credential file $name." }
            [IO.File]::Move($newFile,$dest)
        }
    }
} finally {
    foreach ($name in @('platform-operator.txt','tanteulrikkesvei-staff-credentials.txt')) {
        $tempFile = Join-Path $private $name
        if (Test-Path -LiteralPath $tempFile) { Remove-Item -LiteralPath $tempFile }
    }
    [IO.Directory]::Delete($private)
}
Write-Output "Operator and new community credentials are available in $secrets."
if (-not $CredentialsOnly) {
    foreach ($site in @('hereme.no','tanteulrikkesvei.hereme.no')) {
        $meta = Invoke-RestMethod "https://$site/api/meta" -TimeoutSec 15
        $ready = Invoke-RestMethod "https://$site/api/ready" -TimeoutSec 15
        if (-not $ready.ok -or $meta.public_origin -ne "https://$site" -or $meta.release -ne $revision) {
            throw "Public verification failed for $site. Check the gateway, release and certificate."
        }
    }
    if ((Invoke-RestMethod 'https://admin.hereme.no/live' -TimeoutSec 15).service -ne 'hereme-platform') {
        throw 'The public platform panel failed its identity check.'
    }
    Write-Output "Verified both public communities and the platform panel at release $revision."
}
