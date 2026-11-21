#!/bin/sh
set -eu
test "$(id -u)" -eq 0 || { echo "Run as root" >&2; exit 1; }
command -v node >/dev/null
major=$(node -p "process.versions.node.split('.')[0]")
test "$major" -ge 24 || { echo "Node 24+ required" >&2; exit 1; }
id hereme >/dev/null 2>&1 || useradd --system --home /var/lib/hereme --shell /usr/sbin/nologin hereme
install -d -o hereme -g hereme -m 0750 /var/lib/hereme /var/lib/hereme/uploads /var/lib/hereme/media /var/lib/hereme/tmp /var/log/hereme /var/backups/hereme
install -d -o root -g hereme -m 0750 /etc/hereme /opt/hereme/releases
test -f /etc/hereme/hereme.env || install -o root -g hereme -m 0640 deploy/hereme.env.example /etc/hereme/hereme.env
test -f /etc/hereme/hereme-push.env || install -o root -g root -m 0600 deploy/hereme-push.env.example /etc/hereme/hereme-push.env
chown root:root /etc/hereme/hereme-push.env
chmod 0600 /etc/hereme/hereme-push.env
install -o root -g root -m 0644 deploy/hereme.service /etc/systemd/system/hereme.service
install -o root -g root -m 0644 deploy/hereme-worker.service /etc/systemd/system/hereme-worker.service
install -o root -g root -m 0644 deploy/hereme-push-worker.service /etc/systemd/system/hereme-push-worker.service
install -o root -g root -m 0644 deploy/hereme-backup.service /etc/systemd/system/hereme-backup.service
install -o root -g root -m 0644 deploy/hereme-backup.timer /etc/systemd/system/hereme-backup.timer
systemctl daemon-reload
systemctl enable hereme-push-worker.service
systemctl enable --now hereme-backup.timer
echo "Install a release under /opt/hereme/releases, validate /etc/hereme/hereme.env, then use scripts/deploy.sh."
