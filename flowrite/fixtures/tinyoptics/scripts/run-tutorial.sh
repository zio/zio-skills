#!/usr/bin/env bash
#
# run-tutorial.sh — run write-tutorial against this fixture, then archive
# whatever it produced (docs/examples/build changes) plus the full flue log,
# and reset the fixture back to baseline. One command for local testing;
# archives even on a failed or interrupted run so the log is never lost.
#
# Usage: bash scripts/run-tutorial.sh "<topic>" [skip-phase1,skip-phase2,...]
#   Skip phases: write-examples, integrate, review — e.g.
#   bash scripts/run-tutorial.sh "Lens" write-examples,integrate,review
set -uo pipefail

cd "$(dirname "$0")/.."
fixture_root="$(pwd)"
flowrite_root="$(cd ../.. && pwd)"

topic="${1:?usage: run-tutorial.sh <topic> [skip-phase1,skip-phase2,...]}"
skip_phases="${2:-}"
log="$(mktemp)"
echo "flue log: $log"

skip_phases_json="[]"
if [ -n "$skip_phases" ]; then
  skip_phases_json="$(printf '%s' "$skip_phases" | tr ',' '\n' | jq -R . | jq -s .)"
fi
# The kind of document and its subject now come from the MESSAGE — see run-data-type-ref.sh.
input="$(jq -n --arg projectPath "$fixture_root" --argjson skipPhases "$skip_phases_json" \
  '{projectPath: $projectPath, skipPhases: $skipPhases}')"

request="Please write a tutorial on $topic."

# `exec` replaces this subshell with flue itself, so $! below is flue's real
# PID (not a wrapper) — kill "$flue_pid" hits the actual node process.
# Flue 2 invocation — see run-data-type-ref.sh for why each flag and env var is here.
(cd "$flowrite_root" && exec env \
  NODE_USE_ENV_PROXY=1 no_proxy=localhost,127.0.0.1 \
  FLUE_VERBOSE_TOOLS=1 \
  ./node_modules/.bin/flue run src/agents/docs-writer.ts \
  --env .env.testing -m "$request" --data "$input") \
  > "$log" 2>&1 &
flue_pid=$!

tail -n +1 -f "$log" &
tail_pid=$!

cleanup() {
  echo ""
  echo "interrupted — killing run and archiving whatever it produced..."
  kill "$tail_pid" 2>/dev/null
  # No sleep/grace-period check here: an outer supervisor (e.g. a harness
  # cancelling this as a background job) may escalate to a hard kill on its
  # own short timeout, and archiving must complete before that hits — every
  # second spent waiting for flue to exit is a second archive-docs.sh doesn't
  # get. Fire TERM and KILL back-to-back (harmless on an already-dead pid) and
  # archive immediately; a mid-write file is still far better than losing the
  # whole run to an unfinished trap.
  kill -TERM "$flue_pid" 2>/dev/null
  kill -KILL "$flue_pid" 2>/dev/null
  # flue spawns sbt/java as its own children, not this script's — a killed
  # flue process does not reliably take them down with it (seen in practice).
  pkill -9 -f "flue.mjs run src/agents/docs-writer.ts" 2>/dev/null
  pkill -9 -f "sbt-launch" 2>/dev/null
  bash scripts/archive-docs.sh "$log" write-tutorial
  rm -f "$log"
  exit 130
}
trap cleanup INT TERM

wait "$flue_pid"
status=$?
kill "$tail_pid" 2>/dev/null
wait "$tail_pid" 2>/dev/null

bash scripts/archive-docs.sh "$log" write-tutorial
rm -f "$log"
exit "$status"
