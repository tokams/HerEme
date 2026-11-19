#!/bin/sh
set -eu
release=${1:?usage: scripts/deploy.sh /absolute/release-directory}
case "$release" in /*) ;; *) echo "Release path must be absolute" >&2; exit 1;; esac
test -f "$release/server/index.js"
set -a
. /etc/hereme/hereme.env
set +a
node "$release/scripts/validate-config.js"
previous=$(readlink -f /opt/hereme/current 2>/dev/null || true)
ln -sfn "$release" /opt/hereme/current.next
mv -Tf /opt/hereme/current.next /opt/hereme/current
if ! systemctl restart hereme || { test "${HEREME_ENABLE_VIDEO:-0}" = 1 && ! systemctl restart hereme-worker; }; then
  test -n "$previous" && ln -sfn "$previous" /opt/hereme/current
  systemctl restart hereme
  exit 1
fi
for ignored in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent "http://127.0.0.1:${PORT:-3000}/api/ready" >/dev/null; then exit 0; fi
  sleep 1
done
test -n "$previous" && ln -sfn "$previous" /opt/hereme/current
systemctl restart hereme
echo "Readiness failed; rolled back release symlink" >&2
exit 1
