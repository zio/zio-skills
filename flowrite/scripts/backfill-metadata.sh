#!/usr/bin/env bash
#
# backfill-metadata.sh — fill the missing `description` and `keywords` frontmatter on every page under
# a docs directory, one `flue run` per page.
#
# Usage: bash scripts/backfill-metadata.sh <docs-dir> [--all] [--env <file>]
#
#   <docs-dir>     the directory to walk. Every .md/.mdx under it is a candidate.
#   --all          re-write description and keywords even where they already have values.
#                  THIS OVERWRITES TEXT A HUMAN MAY HAVE WRITTEN. Default fills only what is empty.
#   --env <file>   env file for the run, relative to the flowrite root (default `.env.testing`, which
#                  is what every other run script here passes). A backfill against a real library
#                  checkout probably wants `--env .env.production`.
#
# RUN THIS ON A CLEAN GIT WORKING TREE, AND READ `git diff` BEFORE YOU COMMIT.
#
# That is not politeness — it is the design's only safety net, and the reason this script does no
# checking of its own. See "Why the script does not check the result" below.
#
# ---------------------------------------------------------------------------------------------
# Why the loop is here and not inside an agent
#
# One process per page, so the "have I already done this page?" test reads the FILE — does it have
# both fields yet — rather than a cursor a model maintains. A cursor is written by the same model that
# decided it was finished, so a run that stopped at page twelve records twelve and reports success. A
# grep over the file cannot disagree with reality, which makes a re-run both safe and resumable, and
# gives every page a fresh context instead of re-sending pages 1-59 while working on page 60.
#
# Why the script does not check the result
#
# An earlier design had this script copy each page first, then assert the body was untouched and the
# new fields well-formed, and restore the copy if not. Dropped, on CLAUDE.md's rule: "Instruct first,
# run it, wrap only what you WATCHED fail." Nobody has watched this agent damage a page, and this repo
# has deleted every tool it wrote against an imagined problem. The `reduce-redundancy` gate skill edits finished pages
# with nothing re-checking it either, and the answer there was to record the risk (BACKLOG.md finding
# 9), not to invent a guard.
#
# What stands in its place is louder and free: a clean tree makes any unwanted edit a diff nobody
# asked for, and `git checkout -- <path>` undoes it. The mechanical assertions live in
# test-fixtures/metadata/verify.sh, which is where the evidence would come from. If that fixture shows
# the agent touching page bodies, the check has been earned and belongs here.
# ---------------------------------------------------------------------------------------------
set -uo pipefail

docs_dir="${1:?usage: backfill-metadata.sh <docs-dir> [--all] [--env <file>]}"
shift

all=0
env_file=".env.testing"
while [ $# -gt 0 ]; do
  case "$1" in
    --all) all=1; shift ;;
    --env) env_file="${2:?--env needs a file}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

flowrite_root="$(cd "$(dirname "$0")/.." && pwd)"

# Checked before the walk, not per page: a missing env file would otherwise print `fail` for every
# page in the tree and bury the one line that says why.
if [ ! -f "$flowrite_root/$env_file" ]; then
  echo "missing $flowrite_root/$env_file — pass --env with one that exists" >&2
  echo "available:" >&2
  (cd "$flowrite_root" && ls -a | grep -E '^\.env' | sed 's/^/  /') >&2
  exit 1
fi

if [ ! -d "$docs_dir" ]; then
  echo "not a directory: $docs_dir" >&2
  exit 1
fi
docs_dir="$(cd "$docs_dir" && pwd)"

# The agent's sandbox is bound to this root and the message names the page relative to it, so the two
# have to agree. The checkout is the natural root; a docs directory outside any repo falls back to its
# parent, which also means `git diff` is unavailable and the warning below says so.
project_root="$(git -C "$docs_dir" rev-parse --show-toplevel 2>/dev/null || dirname "$docs_dir")"

if git -C "$docs_dir" rev-parse --git-dir >/dev/null 2>&1; then
  dirty="$(git -C "$project_root" status --porcelain -- "$docs_dir")"
  if [ -n "$dirty" ]; then
    echo "WARNING: uncommitted changes already exist under $docs_dir:" >&2
    printf '%s\n' "$dirty" >&2
    echo "         this run's edits will be mixed in with them in git diff." >&2
  fi
else
  echo "WARNING: $docs_dir is not in a git repository — there is no diff to review and no undo." >&2
fi

if [ "$all" = 1 ]; then
  echo "--all: existing description and keywords WILL be overwritten."
fi
# Every run's output appended to one file, with a header per page. Each page's `flue` output is
# hundreds of lines of tool activity, so it does not belong on the terminal — but a `fail` line with
# no way to find out why is not a report.
log="$(mktemp)"
echo "root:  $project_root"
echo "docs:  $docs_dir"
echo "log:   $log"
echo ""

# The frontmatter block only, so a `description:` line inside the page body cannot make a page look
# done. Prints nothing when the file does not open with `---`.
frontmatter() {
  awk 'NR == 1 && $0 != "---" { exit } NR == 1 { next } /^---[[:space:]]*$/ { exit } { print }' "$1"
}

while IFS= read -r page; do
  rel="${page#"$project_root"/}"

  if [ "$all" = 0 ]; then
    fm="$(frontmatter "$page")"
    if printf '%s\n' "$fm" | grep -q '^description:' &&
      printf '%s\n' "$fm" | grep -q '^keywords:'; then
      echo "skip $rel"
      continue
    fi
  fi

  printf '\n===== %s =====\n' "$rel" >>"$log"
  # NODE_USE_ENV_PROXY/no_proxy are required on this host; without them flue dies with a bare
  # "Connection error" and 0 tokens (see fixtures/tinyproject/scripts/run-data-type-ref.sh).
  if (cd "$flowrite_root" && env \
    NODE_USE_ENV_PROXY=1 no_proxy=localhost,127.0.0.1 \
    ./node_modules/.bin/flue run src/agent.ts \
    --env "$env_file" \
    -m "Backfill frontmatter metadata in $rel" \
    --data "$(jq -nc --arg p "$project_root" '{projectPath:$p}')") >>"$log" 2>&1; then
    echo "ok   $rel"
  else
    echo "fail $rel  (see $log)"
  fi
done < <(find "$docs_dir" \
  \( -name node_modules -o -name build -o -name .docusaurus \) -prune -o \
  \( -name '*.md' -o -name '*.mdx' \) -print | sort)

echo ""
echo "Now read the diff: git -C $project_root diff -- $docs_dir"
echo "Anything that touched a page BODY is a bug in the agent, not a style choice."
echo "Undo one page with: git -C $project_root checkout -- <path>"
