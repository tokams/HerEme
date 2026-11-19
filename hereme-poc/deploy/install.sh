#!/bin/sh
set -eu
test "$(id -u)" -eq 0 || { echo "Run as root" >&2; exit 1; }
command -v node >/dev/null
major=$(node -p "process.versions.node.split('.')[0]")
test "$major" -ge 24 || { echo "Node 24+ required" >&2; exit 1; }
id hereme >/dev/null 2>&1 || useradd --system --home /var/lib/hereme --shell /usr/sbin/nologin hereme
install -d -o hereme -g hereme -m 0750 /var/lib/hereme /var/lib/hereme/uploads /var/lib/hereme/media /var/lib/hereme/tmp /var/log/hereme
install -d -o root -g hereme -m 0750 /etc/hereme /opt/hereme/releases
test -f /etc/hereme/hereme.env || install -o root -g hereme -m 0640 deploy/hereme.env.example /etc/hereme/hereme.env
install -o root -g root -m 0644 deploy/hereme.service /etc/systemd/system/hereme.service
install -o root -g root -m 0644 deploy/hereme-worker.service /etc/systemd/system/hereme-worker.service
systemctl daemon-reload
echo "Install a release under /opt/hereme/releases, validate /etc/hereme/hereme.env, then use scripts/deploy.sh."
