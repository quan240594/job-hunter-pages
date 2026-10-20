#!/usr/bin/env bash
# Vitest writes `SF:` paths relative to the repo root (src/...), which is what Sonar expects, so this is normally a
# no-op. It still normalises absolute paths (some vitest/CI setups emit them) to repo-relative ones and fails when the
# report is missing. Idempotent. Used by scripts/coverage.sh and CI.
set -euo pipefail
cd "$(dirname "$0")/.."

report="coverage/lcov.info"
[ -f "$report" ] || { echo "fix-lcov-paths: $report not found" >&2; exit 1; }
ROOT="$PWD/" perl -pi -e 'BEGIN { $r = $ENV{ROOT} } s|^SF:\Q$r\E|SF:|' "$report"
