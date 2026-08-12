#!/usr/bin/env bash
#
# archive-docs.sh — snapshot everything a write-* run generated in this fixture,
# then reset the fixture to its committed baseline (git-stash semantics).
#
# Captures ALL changes vs committed HEAD (docs, src/main/scala/examples/*,
# build.sbt, project/plugins.sbt, sidebars.js, EXAMPLES_SUMMARY.md, ...) as one
# patch under ../tinyoptics-archive/<workflow>-turn<N>/changes.patch, AND
# writes two full, standalone, runnable project copies alongside it:
#   tinyoptics-base/  — committed HEAD, unmodified (what the run started from)
#   tinyoptics-final/ — HEAD + this run's changes merged (what the run produced)
# Both are complete trees (tracked + untracked, .gitignore-respecting) — cd
# into either and run sbt directly. A diff-only copy would be missing
# unchanged baseline files like project/plugins.sbt and can't build.
# Then restores the working tree. Ignored paths (website/ node_modules &
# .docusaurus, .remember/) are left untouched.
#
# Usage: bash scripts/archive-docs.sh [flue-run-log-file] [workflow-label]
#   workflow-label defaults to write-tutorial (back-compat) and selects both the
#   archive turn directory name (<workflow>-turn<N>) and the log-line prefixes
#   parsed for usage/insights — every write-* workflow logs its own label, e.g.
#   "write-module-ref token consumption:". Pass the label matching the run.
#   If a log file path is given (and exists), it's copied into the archived
#   turn as flue.log — even on a failed/partial run with no file changes.
#   Also parses that log's "<workflow> token consumption" and "<workflow>
#   component usage" lines into token-usage.json, and its "<workflow> run
#   insights" line into insights.json, its "<workflow> run verdict" line into
#   verdict.json, and its "<workflow> run report" line into run-report.json (render
#   that with `node scripts/run-report.mjs <turn>`) — flue's CLI printer only ever renders the
#   log message text, never the structured second argument passed to log.info,
#   so this is a regex extraction of the human-readable line, not a re-read of
#   the original object.
set -euo pipefail

log_file="${1:-}"
workflow_label="${2:-write-tutorial}"

# Fixture root = parent of this script's directory.
cd "$(dirname "$0")/.."

# Archive lives one level up, alongside the fixture (not inside it).
archive_root="../tinyoptics-archive"
mkdir -p "$archive_root"

# Next turn number.
n=1
while [ -e "$archive_root/$workflow_label-turn$n" ]; do
  n=$((n + 1))
done
dest="$archive_root/$workflow_label-turn$n"
mkdir -p "$dest"

if [ -n "$log_file" ] && [ -f "$log_file" ]; then
  cp "$log_file" "$dest/flue.log"

  token_line="$(grep "$workflow_label token consumption:" "$dest/flue.log" | tail -1 || true)"
  components_line="$(grep "$workflow_label component usage:" "$dest/flue.log" | tail -1 || true)"

  if [ -n "$token_line" ]; then
    total="$(grep -oP '(?<=consumption: )[0-9]+' <<<"$token_line" || echo 0)"
    in_tok="$(grep -oP '(?<=\(in )[0-9]+' <<<"$token_line" || echo 0)"
    out_tok="$(grep -oP '(?<=out )[0-9]+' <<<"$token_line" || echo 0)"
    cache_read="$(grep -oP '(?<=cacheRead )[0-9]+' <<<"$token_line" || echo 0)"
    cache_write="$(grep -oP '(?<=cacheWrite )[0-9]+' <<<"$token_line" || echo 0)"
    turns="$(grep -oP '(?<=across )[0-9]+(?= turns)' <<<"$token_line" || echo 0)"
    cost="$(grep -oP '(?<=cost \$)[0-9.]+' <<<"$token_line" || echo 0)"
    components="${components_line#*component usage: }"
    [ -z "$components" ] && components='[]'

    jq -n \
      --argjson totalTokens "$total" \
      --argjson input "$in_tok" \
      --argjson output "$out_tok" \
      --argjson cacheRead "$cache_read" \
      --argjson cacheWrite "$cache_write" \
      --argjson turns "$turns" \
      --argjson cost "$cost" \
      --argjson components "$components" \
      '{totalTokens: $totalTokens, input: $input, output: $output, cacheRead: $cacheRead, cacheWrite: $cacheWrite, turns: $turns, cost: $cost, components: $components}' \
      > "$dest/token-usage.json"
  fi

  # The run report: cost per phase (own vs delegate), cost per role, activity counts, the review
  # verdict, and computed flags. Render it with `node scripts/run-report.mjs <turn>`.
  report_line="$(grep "$workflow_label run report:" "$dest/flue.log" | tail -1 || true)"
  run_report="${report_line#*run report: }"
  if [ -n "$run_report" ] && jq -e . >/dev/null 2>&1 <<<"$run_report"; then
    jq . <<<"$run_report" > "$dest/run-report.json"
  fi

  # The agent's self-authored run retrospective (obstacles + fixes) — mine
  # these across turns to spot recurring friction worth an instruction change.
  insights_line="$(grep "$workflow_label run insights:" "$dest/flue.log" | tail -1 || true)"
  insights="${insights_line#*run insights: }"
  if [ -n "$insights" ] && jq -e . >/dev/null 2>&1 <<<"$insights"; then
    jq . <<<"$insights" > "$dest/insights.json"
  fi

  # The review's own pass/fail, emitted by report_run_result from the recorded review rather than
  # from the model's summary prose. Kept as its own file so "did this run actually pass?" is a
  # lookup, not a reading-comprehension exercise over a sentence the model wrote about its own work
  # (two runs described a failing page as complete before the verdict became data).
  verdict_line="$(grep "$workflow_label run verdict:" "$dest/flue.log" | tail -1 || true)"
  verdict="${verdict_line#*run verdict: }"
  if [ -n "$verdict" ] && jq -e . >/dev/null 2>&1 <<<"$verdict"; then
    jq . <<<"$verdict" > "$dest/verdict.json"
  fi
fi

# 1. Whole-fixture patch vs HEAD. `add -N` makes untracked files show in the diff;
#    .gitignore keeps node_modules/.docusaurus/.remember out.
git add -N -- .
git diff HEAD -- . > "$dest/changes.patch"
git reset -q -- .

if [ ! -s "$dest/changes.patch" ]; then
  rm -f "$dest/changes.patch"
  if [ -e "$dest/flue.log" ]; then
    usage_note=""
    [ -e "$dest/token-usage.json" ] && usage_note="$usage_note, usage saved to $dest/token-usage.json"
    [ -e "$dest/insights.json" ] && usage_note="$usage_note, insights saved to $dest/insights.json"
    [ -e "$dest/verdict.json" ] && usage_note="$usage_note, verdict saved to $dest/verdict.json"
    [ -e "$dest/run-report.json" ] && usage_note="$usage_note, run report saved to $dest/run-report.json"
    echo "no file changes; log saved to $dest/flue.log$usage_note"
  else
    rm -rf "$dest"
    echo "no changes to archive; fixture already at baseline"
  fi
  exit 0
fi

# Copy every file in the current working tree (tracked + untracked,
# .gitignore-respecting) into $2, mirroring the fixture tree.
copy_tree() {
  local into="$1"
  local count=0
  local list
  list="$(mktemp)"
  {
    git ls-files -- .                              # tracked files
    git ls-files --others --exclude-standard -- .  # untracked files
  } | sort -u > "$list"
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    mkdir -p "$into/$(dirname "$f")"
    cp "$f" "$into/$f"
    count=$((count + 1))
  done < "$list"
  rm -f "$list"
  echo "$count"
}

# 2. Copy the final tree (baseline + this run's changes still merged in) before
#    resetting anything.
final_count="$(copy_tree "$dest/tinyoptics-final")"

# 3. Reset the fixture to committed baseline (stash-like), then copy that
#    clean baseline tree too, for side-by-side comparison and a from-scratch
#    runnable project.
git reset -q -- .
git checkout -- .
git clean -fdq -- .
# git ignores these (`.gitignore`: *.log), so `git clean` without -x leaves them behind — and a stale
# mdoc-<subject>.log from an earlier run reads to the next agent as evidence that mdoc already passed
# for that page. Deliberately not `git clean -fdx`: target/ and .flowrite/cache hold sbt and research
# caches worth keeping, and wiping them slows every following run for no measurement benefit.
rm -f mdoc-*.log
# Dead state: review no longer edits pages, so there is nothing to diff a pre-review snapshot against.
rm -rf .flowrite/pre-review
base_count="$(copy_tree "$dest/tinyoptics-base")"

changed="$(grep -c '^diff --git' "$dest/changes.patch" || true)"
log_note=""
[ -e "$dest/flue.log" ] && log_note=", log saved to $dest/flue.log"
[ -e "$dest/token-usage.json" ] && log_note="$log_note, usage saved to $dest/token-usage.json"
[ -e "$dest/insights.json" ] && log_note="$log_note, insights saved to $dest/insights.json"
[ -e "$dest/verdict.json" ] && log_note="$log_note, verdict saved to $dest/verdict.json"
[ -e "$dest/run-report.json" ] && log_note="$log_note, run report saved to $dest/run-report.json"
echo "archived turn $n: $changed file(s) changed. $base_count file(s) in $dest/tinyoptics-base/, $final_count file(s) in $dest/tinyoptics-final/$log_note"
echo "fixture reset to HEAD. Both copies are standalone runnable projects (cd in, run sbt). Or replay the diff onto this fixture: git apply $dest/changes.patch"
