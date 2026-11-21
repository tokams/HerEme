param(
    [string]$HostName = '46.251.249.110',
    [string]$UserName = 'dongjel',
    [string]$IdentityFile = "$env:USERPROFILE\.ssh\dongjel_relay",
    [string]$RemoteDirectory = '/home/dongjel/services/hereme',
    [string]$Domain = 'hereme.46.251.249.110.nip.io'
)
$ErrorActionPreference = 'Stop'
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
grep -Fx "HEREME_DOMAIN=$domain" "$staged/deploy/docker/.env" >/dev/null
docker image tag hereme-local-forum:latest "$rollback_image"
docker run --rm --user 0 -v docker_hereme-data:/var/lib/hereme:ro -v "$backup_root":/backup "$rollback_image" node scripts/snapshot-data.js /var/lib/hereme "/backup/$stamp"
# SQLite may need to create a transient -shm file even with a read-only connection.
docker run --rm --user 0 -v "$backup_root":/backup "$rollback_image" node scripts/verify-backup.js "/backup/$stamp"
docker run --rm --user 0 -v docker_hereme-data:/data:ro -v "$backup_root":/backup "$rollback_image" sh -ec 'if [ -d /data/chat ]; then find /data/chat -maxdepth 1 -type f -printf "%f\n"; fi > /backup/'"$stamp"'/chat-files.txt'
(cd "$staged" && docker compose -p docker -f "$compose" build app)
deployed=0
rollback() {
  trap - ERR
  if [ "$deployed" -eq 1 ]; then return; fi
  echo 'Deployment failed; restoring previous release and verified data snapshot.' >&2
  (cd "$target" && docker compose -p docker -f "$compose" down) || true
  if [ -d "$previous" ]; then
    if [ -d "$target" ]; then mv "$target" "$staged.failed"; fi
    mv "$previous" "$target"
  fi
  docker image tag "$rollback_image" hereme-local-forum:latest
  docker run --rm --user 0 -v docker_hereme-data:/data -v "$backup_root":/backup:ro "$rollback_image" sh -ec 'rm -f /data/hereme.sqlite /data/hereme.sqlite-wal /data/hereme.sqlite-shm; rm -rf /data/uploads /data/media /data/tmp; cp /backup/'"$stamp"'/hereme.sqlite /data/hereme.sqlite; cp -a /backup/'"$stamp"'/uploads /backup/'"$stamp"'/media /data/; mkdir /data/tmp; for file in /data/chat/*; do [ -f "$file" ] || continue; name=${file##*/}; if ! grep -Fxq "$name" /backup/'"$stamp"'/chat-files.txt; then rm "$file"; fi; done; chown -R node:node /data'
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
    & ssh @sshOptions $connection "bash '$upload.sh' '$stamp' '$revision' '$RemoteDirectory' '$Domain' '$upload'"
    if ($LASTEXITCODE -ne 0) { throw 'Remote deployment failed. Review remote output and retained backup before retrying.' }
} finally {
    Remove-Item -LiteralPath $scratch -Recurse -Force
}
