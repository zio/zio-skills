#!/usr/bin/env bash
#
# run-data-type-ref.sh — run write-data-type-ref against this fixture, then
# archive whatever it produced (docs/examples/build changes) plus the full flue
# log, and reset the fixture back to baseline. One command for local testing;
# archives even on a failed or interrupted run so the log is never lost.
# Mirrors run-tutorial.sh.
#
# Usage: bash scripts/run-data-type-ref.sh "<TypeName>" [skip-phase1,skip-phase2,...]
#   Skip phases: research, design, write, write-examples, integrate, review — e.g.
#   bash scripts/run-data-type-ref.sh "Lens" research,design,write
set -uo pipefail

cd "$(dirname "$0")/.."
fixture_root="$(pwd)"
flowrite_root="$(cd ../.. && pwd)"

type_name="${1:?usage: run-data-type-ref.sh <TypeName> [skip-phase1,skip-phase2,...]}"
skip_phases="${2:-}"
log="$(mktemp)"
echo "flue log: $log"

skip_phases_json="[]"
if [ -n "$skip_phases" ]; then
  skip_phases_json="$(printf '%s' "$skip_phases" | tr ',' '\n' | jq -R . | jq -s .)"
fi
# The kind of document and its subject now come from the MESSAGE, not from creation data, so
# --data carries only what a sentence cannot express with schema validation.
input="$(jq -n --arg projectPath "$fixture_root" --argjson skipPhases "$skip_phases_json" \
  '{projectPath: $projectPath, skipPhases: $skipPhases}')"

# Unambiguous on purpose: a vague request makes the writer stop and ask which kind is wanted —
# correct behaviour, but it produces no document.
request="Please write reference documentation for the $type_name data type."

# `exec` replaces this subshell with flue itself, so $! below is flue's real PID.
#
# Flue 2 dropped workflows, so the target is the agent module path, not a workflow
# name, and creation data moved from `--input` to `--data` (read by useInitialData()
# in useDocsWriter). `-m` is required even though the run directive comes from
# useInstruction — the message is only a kick-off line.
#
# NODE_USE_ENV_PROXY/no_proxy are required on this host; without them flue dies with
# a bare "Connection error" and 0 tokens. FLUE_VERBOSE_TOOLS logs full tool args and
# results, which is the only way to audit which phase actually wrote a page. The
# review budget is no longer a knob: a repeat review re-checks only what failed, so it
# is cheap by construction and needs no cap.
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
  bash scripts/archive-docs.sh "$log" write-data-type-ref
  rm -f "$log"
  exit 130
}
trap cleanup INT TERM

wait "$flue_pid"
status=$?
kill "$tail_pid" 2>/dev/null
wait "$tail_pid" 2>/dev/null

bash scripts/archive-docs.sh "$log" write-data-type-ref
rm -f "$log"
exit "$status"
