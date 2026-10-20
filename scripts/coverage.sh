#!/usr/bin/env bash
# Regenerates coverage/lcov.info (referenced by sonar-project.properties), enforcing the 100% thresholds.
# Used by the pre-push hook and scripts/sonar-scan.sh --coverage.
set -euo pipefail
cd "$(dirname "$0")/.."

# Keep npm cache and temp files inside the repo (both are gitignored).
mkdir -p .npm-cache .tmp
export npm_config_cache="$PWD/.npm-cache"
export TMPDIR="$PWD/.tmp"

echo "coverage: vitest..."
npm run test:coverage

scripts/fix-lcov-paths.sh
