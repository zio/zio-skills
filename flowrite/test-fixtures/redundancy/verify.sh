#!/usr/bin/env bash
#
# verify.sh — the redundancy editor's acceptance test, against a page whose every repetition is known.
#
# Why a hand-planted page: the question this run answers is not "did it cut something" but "did it cut
# the right things and leave the rest alone", and neither half is decidable on a page whose redundancy
# nobody planted. Here the answer is arithmetic — 7 seeded redundancies, 5 planted decoys — and the
# second number is the one that matters. An editor that cuts meaning from a correct page is worse than
# no editor, because the page it damages already passed review.
#
# Usage: bash test-fixtures/redundancy/verify.sh
#
# It plants seeded-page.md in the tinyproject fixture, runs ONLY the redundancy editor (no write flow,
# no sbt, no mdoc), diffs the result against what it planted, and removes the page again. The fixture
# is left at baseline either way — including on interrupt, which is why cleanup runs from a trap.
#
# Requires .env.testing with a working ANTHROPIC_API_KEY. The redundancy editor is now the
# `reduce-redundancy` gate skill on `src/agent.ts`, so it runs under the gate's own tier
# (`TIERS.writer`, Sonnet/high) rather than a dedicated `REDUNDANCY_EDITOR_MODEL` — testing it on a
# weaker model than it ships on proves nothing.
#
# ---------------------------------------------------------------------------------------------
# The 7 seeded redundancies:
#
#   SEM-1  the definition of Ledger ("append-only count of named events", "immutable case class",
#          "running tally per event name") stated THREE times: the opening, "Working with Tallies",
#          and "Core Operations". The first stays; the other two go, or become a link.
#   SEM-2  the merge motivation ("because a ledger never loses a tally, partial results from several
#          workers can be merged…") argued verbatim in the opening AND under "Absorbing".
#   LEX-1  "a running tally per event name" — three occurrences, one per copy of SEM-1.
#   LEX-2  "It returns back a new ledger" — pleonasm, in the opening paragraph.
#   STR-1  "Furthermore," opening a sentence in "Working with Tallies".
#   STR-2  "As mentioned above, recording the same name twice adds to its tally rather than replacing
#          it." — a whole sentence restating the paragraph three lines above it.
#   STR-3  "In addition," under "Absorbing".
#
# The 5 decoys that MUST survive:
#
#   DEC-1  two `scala mdoc` blocks under "Working with Tallies" and one under "Absorbing" that look
#          alike and are not. Code blocks are out of bounds outright — see the guide's Bounds.
#   DEC-2  "because `getOrElse` supplies the default" — causation, not decoration.
#   DEC-3  "first … then" in "First record what happened, then read the totals back out" — sequence.
#   DEC-4  "Its count parameter is a `Long`, not an `Int`, so a literal needs the `L` suffix." The
#          only place that fact appears. It sits in a section that reads repetitive, which is the
#          point: a cut here removes information, and information is not redundancy.
#   DEC-5  the word "tally" throughout. A term recurring across distant sections is a reader finding
#          their place, not repetition.
#
# PASS = every seed gone, every decoy intact, no code-block line in the diff, headings untouched.
# ---------------------------------------------------------------------------------------------
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
fixture="$root/fixtures/tinyproject"
page="$fixture/docs/reference/ledger.md"
log="$(mktemp)"
planted="$(mktemp)"
edited="$(mktemp)"

if [ ! -f "$root/.env.testing" ]; then
  echo "missing $root/.env.testing — copy .env.testing.example and fill in ANTHROPIC_API_KEY" >&2
  exit 1
fi

# The fixture is a from-scratch baseline and must never keep this page. Trap rather than a trailing
# line: an interrupted run would otherwise leave an edited page behind, and the next run would then be
# editing a page it did not plant.
cleanup() {
  rm -f "$page"
  echo "fixture reset (removed docs/reference/ledger.md)"
}
trap cleanup EXIT INT TERM

cp "$here/seeded-page.md" "$page"
cp "$here/seeded-page.md" "$planted"

request='Reduce redundancy in docs/reference/ledger.md.'
data="$(jq -nc --arg p "$fixture" '{projectPath:$p}')"

echo "log: $log"
(cd "$root" && env NODE_USE_ENV_PROXY=1 no_proxy=localhost,127.0.0.1 \
  ./node_modules/.bin/flue run src/agent.ts \
  --env .env.testing -m "$request" --data "$data") > "$log" 2>&1
status=$?

# Copied out before the trap fires: the fixture cannot keep this page, but the mechanical checks below
# need the edited text to still exist somewhere.
cp "$page" "$edited" 2>/dev/null || true

echo ""
echo "=== the diff (what it actually did) ==="
diff -u "$planted" "$page" || true

echo ""
echo "=== the receipt (what it says it did) ==="
grep -E "^(cut|left) |reduce-redundancy" "$log" \
  || echo "(nothing — read $log in full; the run may have failed before editing)"

echo ""
echo "=== the two things this test exists for ==="
echo "  1. every seed gone:   SEM-1 SEM-2 LEX-1 LEX-2 STR-1 STR-2 STR-3   (see the header)"
echo "  2. every decoy intact: DEC-1 DEC-2 DEC-3 DEC-4 DEC-5"
echo ""
echo "planted: $planted"
echo "edited:  $edited"
echo ""
echo "=== mechanical checks (the ones a diff is easy to misread on) ==="
check() { printf '  %-34s %s\n' "$1" "$2"; }

# Fence and heading TEXT, never line numbers: removing a prose line shifts every number below it, so a
# numbered comparison reports every successful run as a failure.
fences() { awk '/^```/ { inb = !inb; print; next } inb { print }' "$1"; }
if diff -q <(fences "$planted") <(fences "$edited") >/dev/null 2>&1; then
  check "code blocks" "byte-identical — DEC-1 holds"
else
  check "code blocks" "CHANGED — KILL: a code block was touched"
fi
if diff -q <(grep '^#' "$planted") <(grep '^#' "$edited") >/dev/null 2>&1; then
  check "headings" "unchanged"
else
  check "headings" "CHANGED — KILL: structure is not this agent's to edit"
fi
for pattern in 'Long`, not an `Int:DEC-4' 'because `getOrElse`:DEC-2' 'First record what happened, then:DEC-3'; do
  needle="${pattern%%:*}"
  name="${pattern##*:}"
  if grep -qF "$needle" "$edited" 2>/dev/null; then
    check "$name" "survived"
  else
    check "$name" "GONE — KILL: a decoy was cut"
  fi
done
echo ""
echo "A cut decoy is a KILL, not a tuning knob: this agent edits a page that already passed review,"
echo "and nothing downstream re-checks it."
exit "$status"
