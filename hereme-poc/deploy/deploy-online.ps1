param(
    [string]$HostName = '46.251.249.110',
    [string]$UserName = 'dongjel',
    [string]$IdentityFile = "$env:USERPROFILE\.ssh\dongjel_relay",
    [string]$RemoteDirectory = '/home/dongjel/services/hereme',
    [string]$Domain = 'hereme.no',
    [string]$ExpectedPreviousDomain = '',
    [switch]$Plan
)
$ErrorActionPreference = 'Stop'
if ($Domain -ne 'hereme.no') { throw 'The canonical deployment domain must be hereme.no.' }
if ($ExpectedPreviousDomain -and $ExpectedPreviousDomain -ne 'hereme.46.251.249.110.nip.io') { throw 'Unexpected previous domain.' }
foreach ($name in @($Domain, 'www.hereme.no')) {
    $records = @(Resolve-DnsName $name -Server 1.1.1.1 -ErrorAction Stop)
    $addresses = @($records | Where-Object { $_.Type -eq 'A' } | ForEach-Object { $_.IPAddress })
    if (-not $addresses -or @($addresses | Where-Object { $_ -ne $HostName }).Count) { throw "DNS for $name does not point exclusively to the deployment server." }
    $ipv6 = @(Resolve-DnsName $name -Type AAAA -Server 1.1.1.1 -ErrorAction SilentlyContinue | Where-Object { $_.Type -eq 'AAAA' })
    if ($ipv6.Count) { throw "Unexpected IPv6 DNS for $name; review before cutover." }
}
if ($Plan) { Write-Output "Plan: deploy to https://$Domain; preserve docker project/volumes, VAPID and private environment; require expected previous domain for cutover; retain old release for data-preserving rollback."; return }
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$identity = (Resolve-Path $IdentityFile).Path
foreach ($command in @('git', 'ssh', 'scp')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Required command is missing: $command" }
}
$dirty = & git -C $repo status --porcelain --untracked-files=all
if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Commit the reviewed changes before deployment; the worktree must be clean.' }
$revision = (& git -C $repo rev-parse --short=12 HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot determine the release revision.' }
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$upload = "/home/$UserName/services/hereme-upload-$stamp"
$scratch = Join-Path ([IO.Path]::GetTempPath()) ("hereme-deploy-$stamp")
New-Item -ItemType Directory -Path $scratch | Out-Null
$archive = Join-Path $scratch 'release.tar.gz'
$remoteScript = Join-Path $scratch 'release.sh'
$script = @'
#!/usr/bin/env bash
set -Eeuo pipefail
stamp=$1
revision=$2
target=$3
domain=$4
upload=$5
expected=$6
backup_root="$(dirname "$target")/hereme-backups"
backup="$backup_root/$stamp"
previous="$(dirname "$target")/hereme-previous-$stamp"
staged="$(dirname "$target")/hereme-staged-$stamp"
rollback_image="hereme-local-forum:rollback-$stamp"
compose='deploy/docker/compose.yaml'
for command in docker tar curl; do command -v "$command" >/dev/null; done
docker compose version >/dev/null
test -f "$target/$compose"
test -f "$target/deploy/docker/.env"
test -f "$upload.tar.gz"
mkdir -p "$backup_root" "$staged"
tar -xzf "$upload.tar.gz" -C "$staged"
cp -p "$target/deploy/docker/.env" "$staged/deploy/docker/.env"
docker image tag hereme-local-forum:latest "$rollback_image"
docker run --rm --user 0 -v docker_hereme-data:/var/lib/hereme:ro -v "$backup_root":/backup "$rollback_image" node scripts/snapshot-data.js /var/lib/hereme "/backup/$stamp"
# SQLite may need to create a transient -shm file even with a read-only connection.
docker run --rm --user 0 -v "$backup_root":/backup "$rollback_image" node scripts/verify-backup.js "/backup/$stamp"
docker run --rm --user 0 -v docker_hereme-data:/data:ro -v "$backup_root":/backup "$rollback_image" sh -ec 'if [ -d /data/chat ]; then find /data/chat -maxdepth 1 -type f -printf "%f\n"; fi > /backup/'"$stamp"'/chat-files.txt'
(cd "$staged" && docker compose -p docker -f "$compose" build app)
cp -p "$target/deploy/docker/.env" "$backup/production.env"
chmod 600 "$backup/production.env"
docker run --rm --user "$(id -u):$(id -g)" -v "$staged/deploy/docker:/config" hereme-local-forum:latest node scripts/configure-domain.js /config/.env "$domain" "$expected"
chmod 600 "$staged/deploy/docker/.env"
(cd "$staged" && docker compose -p docker -f "$compose" run --rm --no-deps proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile)
deployed=0
rollback() {
  trap - ERR
  if [ "$deployed" -eq 1 ]; then return; fi
  echo 'Deployment failed; restoring previous release and environment while preserving live data.' >&2
  (cd "$target" && docker compose -p docker -f "$compose" down) || true
  if [ -d "$previous" ]; then
    if [ -d "$target" ]; then mv "$target" "$staged.failed"; fi
    mv "$previous" "$target"
  fi
  docker image tag "$rollback_image" hereme-local-forum:latest
  (cd "$target" && docker compose -p docker -f "$compose" up -d --no-build --force-recreate --wait) || true
}
trap rollback ERR
mv "$target" "$previous"
mv "$staged" "$target"
(cd "$target" && docker compose -p docker -f "$compose" up -d --no-build --force-recreate --wait)
curl --fail --silent --show-error --max-time 15 "https://$domain/api/ready" >/dev/null
deployed=1
trap - ERR
rm -f "$upload.tar.gz" "$upload.sh"
echo "Deployed $revision to https://$domain/; backup: $backup; previous code: $previous"
'@
try {
    [IO.File]::WriteAllText($remoteScript, $script.Replace("`r`n", "`n"), (New-Object Text.UTF8Encoding $false))
    & git -C $repo archive --format=tar.gz "--output=$archive" 'HEAD:hereme-poc'
    if ($LASTEXITCODE -ne 0) { throw 'Could not package the committed release.' }
    $connection = "$UserName@$HostName"
    $sshOptions = @('-i', $identity, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes')
    & scp @sshOptions $archive "${connection}:$upload.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw 'Could not upload the release archive.' }
    & scp @sshOptions $remoteScript "${connection}:$upload.sh"
    if ($LASTEXITCODE -ne 0) { throw 'Could not upload the deploy procedure.' }
    & ssh @sshOptions $connection "bash '$upload.sh' '$stamp' '$revision' '$RemoteDirectory' '$Domain' '$upload' '$ExpectedPreviousDomain'"
    if ($LASTEXITCODE -ne 0) { throw 'Remote deployment failed. Review remote output and retained backup before retrying.' }
} finally {
    Remove-Item -LiteralPath $scratch -Recurse -Force
}
