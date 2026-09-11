#!/usr/bin/env bash
#
# scan-undocumented.sh — Scans a ZIO library project for documentation gaps.
#
# Invoked by the `find-gaps` skill mounted on `src/agent.ts`'s gate phase, the same way
# `backfill-metadata.sh` drives the `backfill-metadata` gate skill in a loop: a standalone bash
# utility the agent runs directly by absolute path, not a Flue tool, because its output is a Markdown
# report for the model to read and enrich — not structured data a gate consumes.

usage() {
  cat <<'EOF'
Usage: scan-undocumented.sh [project-root]

Scans a ZIO library project for documentation gaps. Compares public Scala
types found in main source roots against existing pages under docs/, and
prints a Markdown report to stdout listing types that appear undocumented.

The report can be redirected to docs/undocumented-report.md (the scanner
excludes its own output file from the corpus, so re-runs are idempotent).

Arguments:
  [project-root]   Project root to scan. Defaults to the current git
                   top-level (or the working directory if not in a git repo).
                   Useful for scanning a sub-module by passing its path.

Options:
  -h, --help       Print this help message and exit.

Exit codes:
  0  Scan completed; report written to stdout. The exit code does NOT reflect
     whether undocumented types were found — inspect the report instead.
  2  Invocation error (extra arguments, project root not found,
     missing docs/ directory).

Examples:
  scan-undocumented.sh                                   # scan current project
  scan-undocumented.sh /home/me/zio-blocks               # scan a specific repo
  scan-undocumented.sh > docs/undocumented-report.md     # save report
EOF
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
esac

if [[ $# -gt 1 ]]; then
  echo "Error: expected at most one argument, got $#" >&2
  usage >&2
  exit 2
fi

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

if [[ ! -d "$ROOT" ]]; then
  echo "Error: project root not found: $ROOT" >&2
  exit 2
fi
if [[ ! -d "$ROOT/docs" ]]; then
  echo "Error: docs/ directory not found under $ROOT" >&2
  exit 2
fi

DOCS_DIR="$ROOT/docs"
REF_DIR="$DOCS_DIR/reference"
GUIDES_DIR="$DOCS_DIR/guides"

# Map of source directory -> sbt module name, e.g. "optics" -> "tinyproject-optics", read from
# `lazy val x = (project in file("DIR")) .settings(..., name := "NAME")`. A module whose sbt
# definition never overrides `name :=` (or has none at all) falls back to its directory, same as
# before this map existed — this only replaces the directory label where a real one is declared.
declare -A MODULE_NAMES
if [[ -f "$ROOT/build.sbt" ]]; then
  curdir=""
  while IFS= read -r line; do
    if echo "$line" | grep -qE 'project in file\("[^"]+"\)'; then
      curdir=$(echo "$line" | sed -E 's/.*project in file\("([^"]+)"\).*/\1/')
    fi
    if [[ -n "$curdir" ]] && echo "$line" | grep -qE 'name[[:space:]]*:=[[:space:]]*"[^"]+"'; then
      MODULE_NAMES["$curdir"]=$(echo "$line" | sed -E 's/.*name[[:space:]]*:=[[:space:]]*"([^"]+)".*/\1/')
      curdir=""
    fi
  done < "$ROOT/build.sbt"
fi

# Temp files
DOCS_WORDS_FILE=$(mktemp -t scan-words.XXXXXX)
TYPES_FILE=$(mktemp -t scan-types.XXXXXX)
UNDOC_FILE=$(mktemp -t scan-undoc.XXXXXX)
DOC_FILE_TMP=$(mktemp -t scan-doc.XXXXXX)
USAGE_FILE=$(mktemp -t scan-usage.XXXXXX)
cleanup() { rm -f "$DOCS_WORDS_FILE" "$TYPES_FILE" "$UNDOC_FILE" "$DOC_FILE_TMP" "$USAGE_FILE"; }
trap cleanup EXIT

# ─── 1. Collect existing documentation ────────────────────────────────────────

# Exclude generated tracking docs from the corpus so the scan is idempotent
EXCLUDE_PATTERN='undocumented-report'

# Newline-separated list of doc files (still used by later stages for streaming
# read with `read -r`; stages 2+ tolerate filenames with spaces because they
# never word-split this list).
DOC_FILES_LIST=$(find "$DOCS_DIR" -name '*.md' -type f | grep -v "$EXCLUDE_PATTERN" | sort)

# Build a word-frequency file from all docs (one pass over all doc content).
# Use -print0 / xargs -0 so filenames with spaces or special chars are handled
# correctly. Replicates the EXCLUDE_PATTERN filter inside the find expression.
find "$DOCS_DIR" -name '*.md' -type f -not -path "*${EXCLUDE_PATTERN}*" -print0 \
  | xargs -0 cat 2>/dev/null \
  | grep -oE '\b[A-Z][A-Za-z0-9]+\b' \
  | sort | uniq -c | sort -rn > "$DOCS_WORDS_FILE"

# Map of existing doc IDs (kebab-case filenames without .md). Guides get the same dedicated-page
# recognition as reference pages — a type documented only by a guide (e.g. `docs/guides/lens.md` for
# `Lens`) was previously invisible to Check 1 below, since only reference/top-level pages were in
# ALL_DOC_IDS, and fell through to the much weaker mention-count heuristic instead.
REF_IDS=$(find "$REF_DIR" -name '*.md' -type f 2>/dev/null | grep -v "$EXCLUDE_PATTERN" | while read -r f; do basename "$f" .md; done | sort)
GUIDE_IDS=$(find "$GUIDES_DIR" -name '*.md' -type f 2>/dev/null | grep -v "$EXCLUDE_PATTERN" | while read -r f; do basename "$f" .md; done | sort)
OTHER_IDS=$(find "$DOCS_DIR" -maxdepth 1 -name '*.md' -type f 2>/dev/null | grep -v "$EXCLUDE_PATTERN" | while read -r f; do basename "$f" .md; done | sort)
ALL_DOC_IDS=$(printf '%s\n%s\n%s\n' "$REF_IDS" "$GUIDE_IDS" "$OTHER_IDS" | sort -u)

# ─── 2. Extract public types from source code ────────────────────────────────

# Find all main Scala source files across all source roots
# (scala/, scala-2/, scala-3/, scala-3.5+/, etc.)
find "$ROOT" -name '*.scala' -regex '.*/src/main/scala[^/]*/.*' \
  -not -path '*/test/*' \
  -not -path '*benchmarks*' \
  -not -path '*examples*' \
  -not -path '*scope-examples*' \
  | sort | while read -r file; do

  rel_path="${file#$ROOT/}"
  module_dir=$(echo "$rel_path" | cut -d/ -f1)
  module="${MODULE_NAMES[$module_dir]:-$module_dir}"
  package=$(grep -m1 '^package ' "$file" 2>/dev/null | sed 's/^package //' | tr -d '\r' || echo "unknown")

  # Extract type declarations, skip private/protected
  grep -E '^\s*(sealed\s+|abstract\s+|final\s+|case\s+)*(class|trait|object|enum)\s+[A-Z]' "$file" 2>/dev/null \
    | grep -v -E '(private|protected)\s+(class|trait|object|enum)' \
    | while read -r line; do
        kind=$(echo "$line" | grep -oE '\b(class|trait|object|enum)\b' | head -1)
        name=$(echo "$line" | sed -E 's/.*\b(class|trait|object|enum)\s+([A-Za-z0-9_]+).*/\2/')
        if [ -n "$name" ] && [ -n "$kind" ]; then
          echo "${module}|${package}|${kind}|${name}|${rel_path}"
        fi
      done
done | sort -t'|' -k1,1 -k4,4 -u > "$TYPES_FILE"

# ─── 3. Classify each type as documented or not ──────────────────────────────

while IFS='|' read -r module package kind name file; do
  [ -z "$name" ] && continue

  # Convert CamelCase to kebab-case
  name_kebab=$(echo "$name" | sed -E 's/([a-z])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]')

  # Check 1: dedicated doc page exists?
  if echo "$ALL_DOC_IDS" | grep -qx "$name_kebab" 2>/dev/null; then
    echo "${module}|${package}|${kind}|${name}|${file}" >> "$DOC_FILE_TMP"
    continue
  fi

  # Check 2: mentioned >=3 times in docs?
  mention_count=$(grep -w "$name" "$DOCS_WORDS_FILE" 2>/dev/null | head -1 | awk '{print $1}')
  mention_count=${mention_count:-0}
  if [ "$mention_count" -ge 3 ] 2>/dev/null; then
    echo "${module}|${package}|${kind}|${name}|${file}" >> "$DOC_FILE_TMP"
    continue
  fi

  echo "${module}|${package}|${kind}|${name}|${file}" >> "$UNDOC_FILE"
done < "$TYPES_FILE"

# ─── 4. Count usage of undocumented types ─────────────────────────────────────

awk -F'|' '{print $4}' "$UNDOC_FILE" | sort -u | while read -r tname; do
  [ -z "$tname" ] && continue
  usage=$(grep -rlw "$tname" "$ROOT" --include='*.scala' 2>/dev/null \
    | grep -v -E '(test|benchmarks|examples)' | wc -l)
  echo "${tname}|${usage}"
done > "$USAGE_FILE"

# ─── 5. Generate the report ──────────────────────────────────────────────────

total_types=$(wc -l < "$TYPES_FILE" | tr -d ' ')
documented_count=$(wc -l < "$DOC_FILE_TMP" | tr -d ' ')
undocumented_count=$(wc -l < "$UNDOC_FILE" | tr -d ' ')
total_types=${total_types:-0}
documented_count=${documented_count:-0}
undocumented_count=${undocumented_count:-0}

if [ "$total_types" -gt 0 ]; then
  coverage=$(( documented_count * 100 / total_types ))
else
  coverage=0
fi

cat <<HEADER
---
id: undocumented-report
title: "Documentation Coverage Report"
---

# Documentation Coverage Report

Auto-generated report of documentation gaps.

## Summary

| Metric | Count |
|--------|-------|
| Total public types found | $total_types |
| Types with documentation | $documented_count |
| Types lacking documentation | $undocumented_count |
| Documentation coverage | ${coverage}% |

## Existing Reference Pages

HEADER

echo "$REF_IDS" | while read -r doc_id; do
  [ -z "$doc_id" ] && continue
  echo "- [${doc_id}](./reference/${doc_id}.md)"
done

echo ""
echo "## Undocumented Types by Module"
echo ""

# Group undocumented types by module
prev_module=""
sort -t'|' -k1,1 -k4,4 "$UNDOC_FILE" | while IFS='|' read -r module package kind name file; do
  [ -z "$name" ] && continue
  if [ "$module" != "$prev_module" ]; then
    if [ -n "$prev_module" ]; then
      echo ""
    fi
    echo "### Module: \`$module\`"
    echo ""
    echo "| Kind | Type Name | Package | Source File |"
    echo "|------|-----------|---------|-------------|"
    prev_module="$module"
  fi
  echo "| $kind | \`$name\` | \`$package\` | \`$file\` |"
done

echo ""
echo "## Documentation Quality Checks"
echo ""

# ─── Broken internal links ────────────────────────────────────────────────────

echo "### Broken Internal Links"
echo ""
broken_links=0
echo "$DOC_FILES_LIST" | while read -r doc_file; do
  [ -z "$doc_file" ] && continue
  grep -oE '\]\(\./[^)]+\.md\)' "$doc_file" 2>/dev/null | while read -r link; do
    target=$(echo "$link" | sed 's/](\.\///' | sed 's/)//')
    doc_dir=$(dirname "$doc_file")
    if [ ! -f "$doc_dir/$target" ]; then
      rel_doc="${doc_file#$DOCS_DIR/}"
      echo "- **$rel_doc**: broken link to \`$target\`"
    fi
  done
done
# Check if anything was printed
broken_output=$(echo "$DOC_FILES_LIST" | while read -r doc_file; do
  [ -z "$doc_file" ] && continue
  grep -oE '\]\(\./[^)]+\.md\)' "$doc_file" 2>/dev/null | while read -r link; do
    target=$(echo "$link" | sed 's/](\.\///' | sed 's/)//')
    doc_dir=$(dirname "$doc_file")
    if [ ! -f "$doc_dir/$target" ]; then
      echo "broken"
    fi
  done
done)
if [ -z "$broken_output" ]; then
  echo "No broken internal links found."
fi

echo ""

# ─── Stub pages ──────────────────────────────────────────────────────────────

echo "### Stub or Minimal Pages (< 20 lines)"
echo ""
echo "$DOC_FILES_LIST" | while read -r doc_file; do
  [ -z "$doc_file" ] && continue
  line_count=$(wc -l < "$doc_file" | tr -d ' ')
  if [ "$line_count" -lt 20 ]; then
    rel_doc="${doc_file#$DOCS_DIR/}"
    echo "- \`$rel_doc\` ($line_count lines)"
  fi
done
stub_output=$(echo "$DOC_FILES_LIST" | while read -r doc_file; do
  [ -z "$doc_file" ] && continue
  line_count=$(wc -l < "$doc_file" | tr -d ' ')
  if [ "$line_count" -lt 20 ]; then echo "stub"; fi
done)
if [ -z "$stub_output" ]; then
  echo "No stub pages found."
fi

echo ""

# ─── Packages without any documentation ──────────────────────────────────────

echo "### Packages Without Any Documentation"
echo ""

undoc_packages=$(awk -F'|' '{print $2}' "$UNDOC_FILE" 2>/dev/null | sort -u)
doc_packages=$(awk -F'|' '{print $2}' "$DOC_FILE_TMP" 2>/dev/null | sort -u)
undoc_only_packages=$(comm -23 <(echo "$undoc_packages") <(echo "$doc_packages") 2>/dev/null || true)

if [ -z "$undoc_only_packages" ]; then
  echo "All packages have at least some documentation."
else
  echo "$undoc_only_packages" | while read -r pkg; do
    { [ -z "$pkg" ] || [ "$pkg" = "unknown" ]; } && continue
    echo "- \`$pkg\`"
  done
fi

echo ""

# ─── High-priority suggestions ────────────────────────────────────────────────

echo "## Suggested Actions"
echo ""
echo "### High Priority"
echo ""
echo "Undocumented types referenced in 3+ source files:"
echo ""

sort -t'|' -k2 -rn "$USAGE_FILE" | while IFS='|' read -r tname usage; do
  [ -z "$tname" ] && continue
  if [ "$usage" -ge 3 ] 2>/dev/null; then
    info=$(grep "|${tname}|" "$UNDOC_FILE" | head -1)
    module=$(echo "$info" | cut -d'|' -f1)
    kind=$(echo "$info" | cut -d'|' -f3)
    package=$(echo "$info" | cut -d'|' -f2)
    echo "- [ ] \`$tname\` ($kind in \`$package\`, module \`$module\`) — referenced in $usage source files"
  fi
done

echo ""
echo "### Medium Priority"
echo ""
echo "Public types in non-internal packages (excluding companion objects):"
echo ""

sort -t'|' -k1,1 -k4,4 "$UNDOC_FILE" | while IFS='|' read -r module package kind name file; do
  [ -z "$name" ] && continue
  # Skip internal packages
  echo "$package" | grep -qE '(internal|impl|private)' && continue
  # Skip companion objects
  [ "$kind" = "object" ] && continue
  echo "- [ ] \`$name\` ($kind) in \`$module\` — source: \`$file\`"
done | head -40

echo ""
echo "---"
echo ""
echo "*Report generated on $(date -u '+%Y-%m-%d %H:%M:%S UTC')*"
