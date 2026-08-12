#!/usr/bin/env bash
#
# run-module-ref.sh — run write-module-ref against this fixture, then archive
# whatever it produced (docs/examples/build changes) plus the full flue log, and
# reset the fixture back to baseline. One command for local testing; archives
# even on a failed or interrupted run so the log is never lost. Mirrors
# run-tutorial.sh.
#
# Usage: bash scripts/run-module-ref.sh "<module-name>" [layout] [skip-phase1,skip-phase2,...]
#   layout (optional): flat | hierarchical — omit to let the design phase decide
#     via the auto-rule. Pass "" to skip it while still giving skip-phases.
#   Skip phases: research, design, write, write-examples, integrate, review — e.g.
#   bash scripts/run-module-ref.sh "optics" hierarchical research,design
set -uo pipefail

cd "$(dirname "$0")/.."
fixture_root="$(pwd)"
flowrite_root="$(cd ../.. && pwd)"

module_name="${1:?usage: run-module-ref.sh <module-name> [layout] [skip-phase1,...]}"
layout="${2:-}"
skip_phases="${3:-}"
log="$(mktemp)"
echo "flue log: $log"

skip_phases_json="[]"
if [ -n "$skip_phases" ]; then
  skip_phases_json="$(printf '%s' "$skip_phases" | tr ',' '\n' | jq -R . | jq -s .)"
fi

# The module name and the kind of document now come from the MESSAGE — see run-data-type-ref.sh.
# `layout` stays in creation data: it is a developer override with no sentence form, and it is
# optional in the schema, so only include the key when given.
if [ -n "$layout" ]; then
  input="$(jq -n --arg projectPath "$fixture_root" --arg layout "$layout" --argjson skipPhases "$skip_phases_json" \
    '{projectPath: $projectPath, layout: $layout, skipPhases: $skipPhases}')"
else
  input="$(jq -n --arg projectPath "$fixture_root" --argjson skipPhases "$skip_phases_json" \
    '{projectPath: $projectPath, skipPhases: $skipPhases}')"
fi

request="Please write module reference documentation for the $module_name module."

# `exec` replaces this subshell with flue itself, so $! below is flue's real PID.
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
  # Fire TERM and KILL back-to-back and archive immediately — see run-tutorial.sh
  # for why there's no grace period here.
  kill -TERM "$flue_pid" 2>/dev/null
  kill -KILL "$flue_pid" 2>/dev/null
  # flue spawns sbt/java as its own children — kill them too.
  pkill -9 -f "flue.mjs run src/agents/docs-writer.ts" 2>/dev/null
  pkill -9 -f "sbt-launch" 2>/dev/null
  bash scripts/archive-docs.sh "$log" write-module-ref
  rm -f "$log"
  exit 130
}
trap cleanup INT TERM

wait "$flue_pid"
status=$?
kill "$tail_pid" 2>/dev/null
wait "$tail_pid" 2>/dev/null

bash scripts/archive-docs.sh "$log" write-module-ref
rm -f "$log"
exit "$status"
