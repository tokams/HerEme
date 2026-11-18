#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
node -e "if (+process.versions.node.split('.')[0]<24) { console.error('Node.js 24+ required'); process.exit(1); }"
if [ ! -f .hereme-deps-ready ]; then npm ci --no-audit --no-fund && touch .hereme-deps-ready; fi
exec node server/index.js
