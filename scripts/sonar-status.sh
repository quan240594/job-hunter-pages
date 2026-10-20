#!/usr/bin/env bash
# Prints the SonarCloud status of this project (quality gate, key measures, open issues and hotspots)
# and exits non-zero unless: gate OK, 0 unresolved issues, 0 hotspots to review.
# Reads SONAR_TOKEN from .env.sonar.local (never printed). Optional: SONAR_BRANCH=<name> for a non-default branch.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_KEY="quan240594_job-hunter-pages"
ORGANIZATION="quan240594"
API="https://sonarcloud.io/api"

if [ ! -f .env.sonar.local ]; then
  echo "Missing .env.sonar.local - see the setup comment in scripts/sonar-scan.sh." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env.sonar.local
set +a
if [ -z "${SONAR_TOKEN:-}" ]; then
  echo "SONAR_TOKEN is not set in .env.sonar.local" >&2
  exit 1
fi

BRANCH_QUERY=""
if [ -n "${SONAR_BRANCH:-}" ]; then
  BRANCH_QUERY="&branch=${SONAR_BRANCH}"
fi

# The token goes to curl through stdin (--config -) so it never shows up in the process list.
api_get() {
  local url="$1"
  printf 'user = "%s:"\n' "$SONAR_TOKEN" | curl --silent --show-error --fail --max-time 30 --config - "$url" ||
    { echo "sonar-status: request failed: ${url%%\?*}" >&2; return 1; }
}

MEASURES="bugs,vulnerabilities,code_smells,security_hotspots,coverage,duplicated_lines_density,reliability_rating,security_rating,sqale_rating,ncloc"

GATE="$(api_get "$API/qualitygates/project_status?projectKey=$PROJECT_KEY$BRANCH_QUERY")"
MEAS="$(api_get "$API/measures/component?component=$PROJECT_KEY&metricKeys=$MEASURES$BRANCH_QUERY")"
ISSUES="$(api_get "$API/issues/search?componentKeys=$PROJECT_KEY&organization=$ORGANIZATION&resolved=false&facets=severities&ps=1$BRANCH_QUERY")"
HOTSPOTS="$(api_get "$API/hotspots/search?projectKey=$PROJECT_KEY&status=TO_REVIEW&ps=1$BRANCH_QUERY")"

GATE="$GATE" MEAS="$MEAS" ISSUES="$ISSUES" HOTSPOTS="$HOTSPOTS" PROJECT_KEY="$PROJECT_KEY" node --input-type=module -e '
const gate = JSON.parse(process.env.GATE).projectStatus;
const measures = Object.fromEntries(
  JSON.parse(process.env.MEAS).component.measures.map((m) => [m.metric, m.value ?? m.period?.value]),
);
const issues = JSON.parse(process.env.ISSUES);
const hotspotsToReview = JSON.parse(process.env.HOTSPOTS).paging.total;
const rating = (v) => ("ABCDE"[Math.round(Number(v)) - 1] ?? "?");
const severities = Object.fromEntries(
  (issues.facets.find((f) => f.property === "severities")?.values ?? []).map((v) => [v.val, v.count]),
);

const rows = [
  ["Quality gate", gate.status],
  ["Reliability / Security / Maintainability", `${rating(measures.reliability_rating)} / ${rating(measures.security_rating)} / ${rating(measures.sqale_rating)}`],
  ["Bugs", measures.bugs],
  ["Vulnerabilities", measures.vulnerabilities],
  ["Code smells", measures.code_smells],
  ["Security hotspots (total)", measures.security_hotspots],
  ["Coverage %", measures.coverage],
  ["Duplication %", measures.duplicated_lines_density],
  ["Lines of code", measures.ncloc],
  ["Unresolved issues", issues.total],
  ...["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"].map((s) => [`  ${s}`, severities[s] ?? 0]),
  ["Hotspots to review", hotspotsToReview],
];
const width = Math.max(...rows.map(([k]) => k.length));
console.log(`SonarCloud: ${process.env.PROJECT_KEY}`);
for (const [k, v] of rows) console.log(`${k.padEnd(width)}  ${v ?? "n/a"}`);

const ok = gate.status === "OK" && issues.total === 0 && hotspotsToReview === 0;
console.log(ok ? "RESULT: PASS" : "RESULT: FAIL");
process.exit(ok ? 0 : 1);
'
