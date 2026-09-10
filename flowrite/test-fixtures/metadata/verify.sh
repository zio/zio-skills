#!/usr/bin/env bash
#
# verify.sh — the metadata backfiller's acceptance test, against five pages whose correct outcome is
# known in advance.
#
# Usage: bash test-fixtures/metadata/verify.sh
#
# Four of the five pages test RESTRAINT, and that is the design. Filling an empty field is the easy
# half; the failure that matters is an agent that rewrites a page nobody asked it to touch. So the
# question this run answers is not "did it write a description" but "did it write exactly two fields
# on exactly the pages that needed them, and leave everything else byte-for-byte alone".
#
# ---------------------------------------------------------------------------------------------
# The five pages:
#
#   both-missing.md      `id` + `title` only. MUST gain a description (50-150 chars) and 3-6
#                        block-list keywords. The one page where doing nothing is a failure.
#   keywords-missing.md  already has a description. MUST gain keywords ONLY; the existing
#                        description line must come back byte-identical, even though a different
#                        model might phrase it better.
#   complete.md          has both. MUST be byte-identical, and the driver must report `skip` — its
#                        grep should never have invoked the agent at all.
#   no-frontmatter.md    no frontmatter block, and decoy `description:` / `keywords:` lines in the
#                        body. The driver WILL invoke the agent (there is no frontmatter to grep),
#                        so `ok` is the expected driver line — but the file must be byte-identical,
#                        because inventing an `id` and `title` is not this agent's call.
#   code-heavy.md        `id` + `title` only, and a body full of the things an editor trips over:
#                        three fenced blocks, a three-column table, and a `---` line INSIDE a yaml
#                        fence. Frontmatter filled, body byte-identical. That last fence is the
#                        input most likely to fool a "split on the closing ---" parser, in the agent
#                        and in this script.
#
# PASS = every body byte-identical; complete.md and no-frontmatter.md untouched in full; the three
# fillable pages carry a well-formed description and keywords; no pre-existing frontmatter key
# moved, changed or disappeared; the four pages already committed under fixtures/tinyproject/docs
# untouched.
#
# An empty diff everywhere is NOT a pass — check the driver's skip grep before concluding anything
# about the agent.
# ---------------------------------------------------------------------------------------------
#
# Requires .env.testing with a working ANTHROPIC_API_KEY. The backfiller is now the
# `backfill-metadata` gate skill on `src/agent.ts`, so it runs under the gate's own tier
# (`TIERS.writer`, Sonnet/high) rather than a dedicated `METADATA_WRITER_MODEL`.
#
# The fixture is a from-scratch baseline and must never keep these pages, so they are planted in a
# SUBDIRECTORY of its docs tree and the trap removes the whole directory. The four pages committed
# under fixtures/tinyproject/docs are deliberately out of the walk: pointing the driver at `docs/`
# would rewrite tracked files, which flowrite/CLAUDE.md forbids outright.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
fixture="$root/fixtures/tinyproject"
planted_dir="$fixture/docs/backfill"
before="$(mktemp -d)"
after="$(mktemp -d)"

pages=(both-missing keywords-missing complete no-frontmatter code-heavy)

if [ ! -f "$root/.env.testing" ]; then
  echo "missing $root/.env.testing — copy .env.testing.example and fill in ANTHROPIC_API_KEY" >&2
  exit 1
fi

# Trap rather than a trailing line: an interrupted run would otherwise leave edited pages inside a
# fixture that the next run assumes is at baseline.
cleanup() {
  rm -rf "$planted_dir"
  echo "fixture reset (removed docs/backfill/)"
}
trap cleanup EXIT INT TERM

mkdir -p "$planted_dir"
for page in "${pages[@]}"; do
  cp "$here/$page.md" "$planted_dir/$page.md"
  cp "$here/$page.md" "$before/$page.md"
done

# Recorded before the run so the "committed pages untouched" check cannot be fooled by a stale index.
# Filtered exactly as the after-state is: the planted directory is itself untracked, so git reports
# it here too, and comparing a filtered list against an unfiltered one fails on every run.
tracked_docs_state() {
  git -C "$root" status --porcelain -- fixtures/tinyproject/docs | grep -v 'docs/backfill/' || true
}
committed_before="$(tracked_docs_state)"

driver_log="$(mktemp)"
echo "driver output: $driver_log"
echo ""
bash "$root/scripts/backfill-metadata.sh" "$planted_dir" --env .env.testing 2>&1 | tee "$driver_log"
status=${PIPESTATUS[0]}

# Copied out before the trap fires: the fixture cannot keep these pages, but the checks below need
# the edited text to still exist somewhere.
for page in "${pages[@]}"; do
  cp "$planted_dir/$page.md" "$after/$page.md" 2>/dev/null || true
done

echo ""
echo "=== the diff (what it actually did) ==="
for page in "${pages[@]}"; do
  diff -u "$before/$page.md" "$after/$page.md" || true
done

# --- helpers ---------------------------------------------------------------------------------
#
# Everything below compares TEXT, never line numbers: adding two frontmatter lines shifts every line
# below them, so a numbered comparison would report every successful run as a failure. This is the
# lesson test-fixtures/redundancy/verify.sh already paid for.

# Everything after the frontmatter's CLOSING delimiter — which is the first `---` after line 1, not
# the last one in the file. A page with no frontmatter block is returned whole.
body() {
  awk '
    NR == 1 && $0 == "---" { state = 1; next }
    NR == 1 { state = 2 }
    state == 1 && /^---[[:space:]]*$/ { state = 2; next }
    state == 1 { next }
    { print }
  ' "$1"
}

# The frontmatter block only.
frontmatter() {
  awk '
    NR == 1 && $0 != "---" { exit }
    NR == 1 { next }
    /^---[[:space:]]*$/ { exit }
    { print }
  ' "$1"
}

# Top-level frontmatter keys, in order.
fmkeys() {
  frontmatter "$1" | sed -n 's/^\([A-Za-z_][A-Za-z0-9_-]*\):.*/\1/p'
}

pass=0
fail=0
check() {
  if [ "$1" = ok ]; then
    printf '  \033[32mPASS\033[0m %s\n' "$2"
    pass=$((pass + 1))
  else
    printf '  \033[31mFAIL\033[0m %s\n' "$2"
    fail=$((fail + 1))
  fi
}

echo ""
echo "=== 1. the body is out of bounds, on every page ==="
for page in "${pages[@]}"; do
  if diff -q <(body "$before/$page.md") <(body "$after/$page.md") >/dev/null 2>&1; then
    check ok "$page.md body unchanged"
  else
    check no "$page.md BODY CHANGED — this is the kill criterion"
  fi
done

echo ""
echo "=== 2. the two pages that must not be touched at all ==="
for page in complete no-frontmatter; do
  if diff -q "$before/$page.md" "$after/$page.md" >/dev/null 2>&1; then
    check ok "$page.md byte-identical"
  else
    check no "$page.md WAS EDITED — it had nothing to fill"
  fi
done
if grep -qE "^skip .*complete\.md" "$driver_log"; then
  check ok "the driver skipped complete.md without invoking the agent"
else
  check no "the driver did NOT skip complete.md — its frontmatter grep is wrong"
fi

echo ""
echo "=== 3. the three fillable pages carry well-formed fields ==="
for page in both-missing keywords-missing code-heavy; do
  fm="$(frontmatter "$after/$page.md")"

  desc="$(printf '%s\n' "$fm" | sed -n 's/^description: *"\(.*\)"[[:space:]]*$/\1/p')"
  if [ -z "$desc" ]; then
    check no "$page.md has no quoted single-line description"
  elif [ "${#desc}" -lt 50 ] || [ "${#desc}" -gt 150 ]; then
    check no "$page.md description is ${#desc} chars, outside 50-150"
  else
    check ok "$page.md description is ${#desc} chars"
  fi

  if printf '%s\n' "$fm" | grep -qE '^keywords: *\['; then
    check no "$page.md used the inline [a, b] keywords form, which Docusaurus does not read"
  else
    n="$(printf '%s\n' "$fm" | grep -cE '^[[:space:]]+- +".*"[[:space:]]*$')"
    if [ "$n" -ge 3 ] && [ "$n" -le 6 ]; then
      check ok "$page.md has $n block-list keywords"
    else
      check no "$page.md has $n block-list keywords, outside 3-6"
    fi
  fi
done

echo ""
echo "=== 4. nothing that was already in the frontmatter moved or changed ==="
for page in both-missing keywords-missing complete code-heavy; do
  b="$(fmkeys "$before/$page.md" | grep -vE '^(description|keywords)$')"
  a="$(fmkeys "$after/$page.md" | grep -vE '^(description|keywords)$')"
  if [ "$b" = "$a" ]; then
    check ok "$page.md pre-existing keys intact and in order"
  else
    check no "$page.md pre-existing keys changed: [$b] became [$a]"
  fi
done
b_desc="$(frontmatter "$before/keywords-missing.md" | grep '^description:')"
a_desc="$(frontmatter "$after/keywords-missing.md" | grep '^description:')"
if [ "$b_desc" = "$a_desc" ]; then
  check ok "keywords-missing.md kept its own description, byte for byte"
else
  check no "keywords-missing.md description was REWRITTEN — a populated field is not an empty one"
fi

echo ""
echo "=== 5. the fixture's committed pages are untouched ==="
committed_after="$(tracked_docs_state)"
if [ "$committed_before" = "$committed_after" ]; then
  check ok "fixtures/tinyproject/docs unchanged outside docs/backfill/"
else
  check no "tracked fixture pages were modified: $committed_after"
fi

echo ""
echo "before: $before"
echo "after:  $after"
echo ""
echo "$pass passed, $fail failed"
echo ""
echo "A changed body or an edited complete.md is a KILL, not a tuning knob: this agent writes to"
echo "pages somebody else already finished, and only git stands between a bad edit and a commit."
echo "It is also the evidence that would earn the per-page check scripts/backfill-metadata.sh"
echo "deliberately does not have — see that file's header."

[ "$fail" -eq 0 ] || exit 1
exit "$status"
