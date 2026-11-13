#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null || { echo 'Install Node.js 20.19+ from https://nodejs.org'; exit 1; }
command -v npm >/dev/null || { echo 'npm is required'; exit 1; }
if [ ! -f node_modules/electron/package.json ]; then npm install --no-audit --no-fund; fi
npm run build
npm run desktop
