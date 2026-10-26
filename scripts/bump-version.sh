#!/usr/bin/env bash
# Set the release version in every file that carries it.
# Usage: scripts/bump-version.sh X.Y.Z
set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: $0 X.Y.Z" >&2
  exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."

set_json_version() {
  local file="$1" filter="$2"
  jq "$filter" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

for f in plugins/*/.claude-plugin/plugin.json gemini-extension.json; do
  set_json_version "$f" ".version = \"$version\""
done
set_json_version .claude-plugin/marketplace.json ".plugins[].version = \"$version\""

# sed, not jq: jq would reformat the one-line keywords array.
sed -i -E "s/^(  \"version\": )\"[^\"]+\"/\1\"$version\"/" package.json

echo "Bumped to $version"
