# Writer Assistant Running Guide

## Quick Start (TL;DR)

To run the agent on a specific file:

```bash
export ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY .env | cut -d= -f2)
npx flue run crossref --target node --input '{"docsDir":"/path/to/docs","mode":"step","targetFile":"reference/resource/scopedref.md","batchSize":1}'
```

## Running in Background

Long-running workflows (autopilot, verify-and-fix) should run in the background to avoid blocking your terminal.

### Using nohup

```bash
nohup npx flue run crossref --target node \
  --input '{"docsDir":"/path/to/docs","mode":"autopilot"}' > crossref.log 2>&1 &
```

Monitor progress:

```bash
tail -f crossref.log
```

### Using screen/tmux

Create a detachable session:

```bash
screen -S writer-agent
npm run build
export ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY .env | cut -d= -f2)
npx flue run crossref --target node \
  --input '{"docsDir":"/path/to/docs","mode":"autopilot"}'

# Detach: Ctrl+A then D
# Reattach: screen -r writer-agent
```

### Using systemd-run (Linux)

```bash
systemd-run --user --scope -p MemoryLimit=2G \
  npx flue run crossref --target node \
  --input '{"docsDir":"/path/to/docs","mode":"autopilot"}'
```

### Checking Background Process Status

```bash
ps aux | grep flue          # Find by process
jobs                        # If backgrounded with &
tail -f nohup.out          # Monitor default log
```

## Prerequisites

✅ Before running the agent, ensure:

- TypeScript is compiled: `npm run build`
- `.env` file exists with `ANTHROPIC_API_KEY=sk-ant-...`
- Node.js 18+ is installed
- Docs directory is accessible at the specified path

## Common Issues & Solutions

### ❌ Error: "flue: command not found"

**Solution:** Use `npx` to run Flue CLI instead of global installation

```bash
npx flue run crossref --target node --input '{...}'
```

### ❌ Error: "Unknown workflow: workflows/crossref.ts"

**Solution:** Workflow name should be just `crossref`, not `workflows/crossref.ts`

```bash
# ❌ Wrong
npx flue run workflows/crossref.ts --target node --input '{...}'

# ✅ Correct
npx flue run crossref --target node --input '{...}'
```

### ❌ Error: "No API key for provider: anthropic"

**Solution:** Export `ANTHROPIC_API_KEY` environment variable before running

```bash
# ✅ Correct way to read from .env and export
export ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY .env | cut -d= -f2)
npx flue run crossref --target node --input '{...}'
```

**Note:** Simply having `.env` file is not enough—Flue requires the environment variable to be exported.

### ❌ Error: "Session is already running prompt" / Parallel session issues

**Note:** These can occur if the agent tries to run tools in parallel that conflict. If this happens:

1. The workflow continues and completes
2. Some metadata extraction may be deferred
3. The workflow will complete successfully

## Running the Agent - Full Command

### Step 1: Build the project

```bash
npm run build
```

### Step 2: Set environment variable

```bash
export ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY .env | cut -d= -f2)
```

### Step 3: Run the agent

**Process a specific file:**

```bash
npx flue run crossref --target node \
  --input '{"docsDir":"/path/to/docs","mode":"step","targetFile":"reference/resource/scopedref.md","batchSize":1}'
```

**Process the next batch (1 page):**

```bash
npx flue run crossref --target node \
  --input '{"docsDir":"/path/to/docs","mode":"step","batchSize":1}'
```

**Process all remaining pages (autopilot):**

```bash
npx flue run crossref --target node \
  --input '{"docsDir":"/path/to/docs","mode":"autopilot"}'
```

**View coverage report:**

```bash
npx flue run crossref --target node \
  --input '{"docsDir":"/path/to/docs","mode":"report"}'
```

**Rebuild index from scratch:**

```bash
npx flue run crossref --target node \
  --input '{"docsDir":"/path/to/docs","mode":"reindex"}'
```

## Payload Parameters Explained

```json
{
  "docsDir": "/path/to/docs", // Required: Path to documentation directory
  "mode": "step", // Required: reindex | step | autopilot | report
  "targetFile": "path/to/file.md", // Optional: Specific file to process
  "targetDir": "path/to/dir/", // Optional: Process all files in directory
  "batchSize": 1 // Optional: Number of pages per batch (default: 5)
}
```

## What Happens During Execution

1. **Build Phase**: Flue compiles TypeScript to JavaScript
   - Output: `/dist/server.mjs`
   - Discovers agents and workflows

2. **Execution Phase**: Workflow runs with specified payload
   - Loads documentation state
   - For each page:
     - Agent analyzes using skill instructions
     - Tools are invoked (search, validate, extract)
     - Suggestions are generated
     - Links are inserted if high-confidence
   - State is saved

3. **Output**: Results printed to console

## Understanding the Output

```
[flue] Running workflow: crossref
[flue] Run ID: workflow:crossref:01KT4WHQ1RW7AM6MPB9Q9YYT34
```

- Workflow is executing
- Unique run ID for tracking

```
[flue] thinking:start
  Agent is reasoning about the page...
[flue] tool:start  search_pages
[flue] tool:done   search_pages  (969 chars)
```

- Agent is using available tools
- Tool outputs are shown with character counts

```
[DEBUG] Output has 9 suggestions
[DEBUG] Adding suggestion to newSuggestions: reference__concurrency__ref (inline, high)
```

- Agent generated 9 suggestions
- Each suggestion includes type (inline/see_also) and confidence (high/medium/low)

```
[DEBUG] Processing suggestion: Ref (inline, high)
[DEBUG]   → Result: inserted=true, reason=none
[DEBUG]   → APPLIED (total applied: 1)
```

- Link insertion attempt results
- Reasons: `inserted=true` (success), `inserted=false reason=no_safe_match` (not found), etc.

```
✓ Processed: ScopedRef: Mutable Reference For Resources (25/293)
  Applied: 1 links  |  Queued: 2
  Tokens this run — in: 66  out: 4,147
  Tokens total    — in: 1,088  out: 256,543  (~$1.03)
```

- Page processed (25 of 293 total)
- Links applied vs queued for review
- Token usage and cost tracking

## Example: Running on scopedref.md

```bash
# Set API key
export ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY .env | cut -d= -f2)

# Run agent on specific file
npx flue run crossref --target node \
  --input '{"docsDir":"/home/milad/sources/scala/zio-2.x-new/docs","mode":"step","targetFile":"reference/resource/scopedref.md","batchSize":1}'
```

**What happens:**

1. Flue builds the project
2. Agent analyzes scopedref.md
3. Agent generates 9 suggestions:
   - 5 inline links (Ref, Scope, ZIO#scoped, forkScoped, uninterruptible)
   - 4 See Also links (resource index, interruption guide, etc.)
4. Workflow attempts to insert high-confidence links
5. 1 link successfully applied ("Using a Scope" anchor)
6. 2 links queued for manual review (medium confidence)
7. Results saved to `.crossref-state/`

## Workflows

### Crossref Agent

Discover and insert cross-references between documentation pages.

#### Modes

- `reindex` — Build fresh index from all pages
- `step` — Process one page batch, apply high-confidence links
- `autopilot` — Loop step mode until all pages processed
- `report` — Analyze coverage, orphans, link density

### Write Data Type Reference

Generate comprehensive API reference documentation from Scala source code.

```bash
npx flue run write-data-type-ref --target node --input '{
  "projectRoot": "/path/to/zio",
  "outputPath": "docs/reference/fiber.md",
  "dataTypePath": "core/shared/src/main/scala/zio/Fiber.scala"
}'
```

**Phases:** Research → Write → Verify → Integrate → Review → Style

### Write Tutorial

Create learning-oriented guides for newcomers.

```bash
npx flue run write-tutorial --target node --input '{
  "projectRoot": "/path/to/zio",
  "outputPath": "docs/guides/getting-started-with-fibers.md",
  "topic": "Getting Started with ZIO Fibers"
}'
```

**Phases:** Research → Write → Verify → Integrate → Review → Style

**Key differences from data-type-ref:**

- Emphasizes 7-section structure (Introduction, Background, Concepts, Putting Together, Running Examples, What Learned, Where Next)
- Linear learning path (no branching)
- Line-by-line code annotations
- Warm, welcoming tone
- 38-item checklist verification in Phase 3

### Organize Types

Group related data types into logical sidebar categories. Two modes: manual (specify types and category) or automatic (scan all types, propose groupings by confidence).

```bash
# Manual mode — group specific types into a named category
npx flue run organize-types --target node --input '{
  "projectRoot": "/path/to/zio-http",
  "types": ["chunk", "list", "vector"],
  "category": "Collections"
}'

# Auto mode — scan all types and apply high-confidence groupings
npx flue run organize-types --target node --input '{
  "projectRoot": "/path/to/zio-http",
  "auto": true,
  "minConfidence": "high"
}'
```

**Phases:** Prepare → Organize → Verify → Build Verify

| Parameter       | Required | Description                                                                                   |
| --------------- | -------- | --------------------------------------------------------------------------------------------- |
| `projectRoot`   | yes      | Absolute path to the ZIO project root                                                         |
| `types`         | manual   | Array of type names, e.g. `["chunk", "list", "vector"]` — must have corresponding .md files   |
| `category`      | manual   | Category label, e.g. `"Collections"` — becomes sidebar label and index.md title               |
| `auto`          | auto     | `true` to trigger automatic scan-and-categorize mode                                          |
| `minConfidence` | no       | Auto mode only: `"high"` (default), `"medium"`, or `"low"` — threshold for applying proposals |
| `skipPhases`    | no       | Array of phase names to skip: `"prepare"`, `"organize"`, `"verify"`, `"verifyBuild"`          |

**Note:** Manual mode and auto mode are mutually exclusive — use `{types, category}` OR `{auto: true}`, never both.

### Report Method Coverage

Cross-check the public members of a Scala data type against a reference documentation page. No LLM — deterministic script execution.

```bash
# With sourceFile: extract members from source, then check coverage
npx flue run report-method-coverage --target node --input '{
  "projectRoot": "/path/to/zio",
  "typeName": "Chunk",
  "docFile": "docs/reference/chunk.md",
  "sourceFile": "core/shared/src/main/scala/zio/Chunk.scala"
}'

# With membersFile: skip extraction, check coverage directly
npx flue run report-method-coverage --target node --input '{
  "projectRoot": "/path/to/zio",
  "typeName": "Chunk",
  "docFile": "docs/reference/chunk.md",
  "membersFile": "tmp/chunk-members.txt"
}'
```

**Steps:** (1) Member extraction via `scala-cli extract-members.scala` → (2) Coverage check via `bash check-method-coverage.sh`

| Parameter     | Required | Description                                                                                          |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `projectRoot` | yes      | Absolute path to the project root — all other paths are relative to this                             |
| `typeName`    | yes      | Scala type name, e.g. `"Chunk"`, `"Reader"`, `"Schema"`                                              |
| `docFile`     | yes      | Path to the reference `.md` doc, relative to `projectRoot`                                           |
| `sourceFile`  | one of   | Path to `.scala` source file relative to `projectRoot` — triggers member extraction with `scala-cli` |
| `membersFile` | one of   | Path to pre-extracted members file relative to `projectRoot` — skips the extraction step             |

**Note:** `sourceFile` and `membersFile` are mutually exclusive — provide exactly one.

### Write How-To Guide

Create goal-oriented guides that help readers accomplish a specific task.

```bash
npx flue run write-how-to-guide --target node --input '{
  "projectRoot": "/path/to/zio",
  "outputPath": "docs/guides/handle-errors-with-zio.md",
  "topic": "How to handle errors with ZIO"
}'
```

**Phases:** Research → Write → Verify → Integrate → Review → Style → Build Verify

**Key differences from write-tutorial:**

- Emphasizes 8-section structure (Introduction, The Problem, Prerequisites, Core Model, Step-by-step sections, Putting Together, Running Examples, Going Further)
- Goal-oriented prose — direct and imperative, not warm/pedagogical
- Problem section mandatory with "before" code example
- How-to guide checklist verification in Phase 3

| Parameter     | Required | Description                                                                                                              |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `projectRoot` | yes      | Absolute path to the ZIO project root                                                                                    |
| `outputPath`  | yes      | Relative path, e.g. `docs/guides/handle-errors-with-zio.md`                                                              |
| `topic`       | yes      | Guide topic description, e.g. `"How to handle errors with ZIO"`                                                          |
| `examples`    | no       | `{ "moduleName": "...", "packageName": "...", "parentModule": "..." }` — companion examples                              |
| `skipPhases`  | no       | Array of phase names to skip: `"research"`, `"write"`, `"verify"`, `"integrate"`, `"review"`, `"style"`, `"verifyBuild"` |

### Write Module Reference

Generate comprehensive reference documentation for a module containing multiple related data types.

```bash
npx flue run write-module-ref --target node --input '{
  "projectRoot": "/path/to/zio",
  "moduleName": "http-model",
  "outputPath": "docs/reference/http-model.md"
}'
```

**Phases:** Research → Write → Verify → Integrate → Review → Style → Build Verify

| Parameter     | Required | Description                                                                                                |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `projectRoot` | yes      | Absolute path to the ZIO project root                                                                      |
| `moduleName`  | yes      | Module identifier, e.g. `http-model`, `resource-management`                                                |
| `outputPath`  | yes      | **Flat:** `docs/reference/<module>.md` — **Hierarchical:** `docs/reference/<module>/` (trailing slash)     |
| `structure`   | no       | `flat` or `hierarchical`; agent decides from skill rule if omitted (≤4 types → flat, ≥5 → hierarchical)    |
| `examples`    | no       | `{ "moduleName": "...", "packageName": "...", "parentModule": "..." }` — generate companion Scala examples |
| `diagram`     | no       | `{ "outputPath": "...", "prompt": "..." }` — generate interactive JSX diagram                              |

**Flat vs hierarchical:**

```bash
# Flat — single file (≤4 core types)
npx flue run write-module-ref --target node --input '{
  "projectRoot": "/path/to/zio-http",
  "moduleName": "http-model",
  "outputPath": "docs/reference/http-model.md"
}'

# Hierarchical — index + per-type pages (≥5 core types)
npx flue run write-module-ref --target node --input '{
  "projectRoot": "/path/to/zio-http",
  "moduleName": "resource-management",
  "outputPath": "docs/reference/resource-management/",
  "structure": "hierarchical"
}'
```

### Fix Writing Style

Validate and fix prose style violations in a documentation file.

```bash
npx flue run fix-writing-style --target node --input '{
  "filePath": "/path/to/docs/reference/fiber.md"
}'
```

**Phases:** Style (mechanical + LLM, max 1 round) → Build Verify

| Parameter  | Required | Description                         |
| ---------- | -------- | ----------------------------------- |
| `filePath` | yes      | Absolute path to the `.md` file     |
| `typeName` | no       | Display name (defaults to filename) |

### Reduce Redundancy

Remove lexical, structural, and semantic redundancy from a documentation file.

```bash
npx flue run reduce-redundancy --target node --input '{
  "filePath": "/path/to/docs/reference/chunk.md"
}'
```

**Phases:** Scan & Fix (max 3 rounds) → Build Verify

| Parameter   | Required | Description                          |
| ----------- | -------- | ------------------------------------ |
| `filePath`  | yes      | Absolute path to the `.md` file      |
| `typeName`  | no       | Display name (defaults to filename)  |
| `maxRounds` | no       | Max scan→fix iterations (default: 3) |

**Redundancy types detected:**

- **Lexical** — repeated words or phrases in adjacent sentences
- **Structural** — decorative transitions (`furthermore`, `moreover`, `as mentioned above`)
- **Semantic** — concepts, definitions, or motivations explained more than once

Each round: fresh scanner agent detects remaining redundancies → fixer agent (shared session) applies fixes. Unresolvable items are tracked and skipped in subsequent rounds.

## Workflow Modes (Crossref)

### `reindex`

- Walks entire docs directory
- Extracts metadata from all pages
- Rebuilds page index from scratch
- **Use:** After major documentation changes

### `step`

- Processes next unprocessed page (or specified page)
- Generates suggestions
- Applies high-confidence links
- **Use:** Incremental processing, manual review workflow

### `autopilot`

- Processes all remaining unprocessed pages
- Continues until all pages are analyzed
- **Use:** Complete first-time run after setup

### `report`

- Generates coverage report
- Shows orphaned pages, link density, etc.
- Doesn't modify files
- **Use:** Analyzing coverage metrics

## Troubleshooting

### "Build failed" - Check TypeScript errors

```bash
npm run build
```

If build fails, fix TypeScript errors before running agent.

### Agent produces no suggestions

- Check that docstring is not empty
- Verify index is built (`.crossref-state/index.json` exists)
- Check `excludePatterns` config not filtering pages

### Links not being inserted

- Most common: anchor text not found exactly as written
- Check safe zones protecting code blocks and frontmatter
- Verify confidence threshold (default: high)

### Slow execution

- Reduce `batchSize` to process fewer pages per run
- Run in `step` mode for single page at a time
- Monitor token usage (shown in output)

## Files Generated/Modified

### State Files

- `.crossref-state/index.json` - Page index (created by reindex)
- `.crossref-state/suggestions.json` - Accumulated suggestions
- `.crossref-state/state.json.backup` - Backup of old state format

### Documentation Files

- Modified markdown files get links inserted
- Original formatting preserved
- Only high-confidence links applied automatically

### Build Output

- `dist/server.mjs` - Compiled workflow executable

## Tips & Best Practices

1. **Always rebuild before running**

   ```bash
   npm run build
   ```

2. **Start with a single page**

   ```bash
   npx flue run crossref --target node \
     --input '{"docsDir":"...","mode":"step","targetFile":"...","batchSize":1}'
   ```

3. **Review suggestions before applying**
   - Check `.crossref-state/suggestions.json` for pending suggestions
   - Manually approve before switching to autopilot mode

4. **Run report to see progress**

   ```bash
   npx flue run crossref --target node \
     --input '{"docsDir":"...","mode":"report"}'
   ```

5. **Save API key securely**
   - Never commit `.env` to version control
   - Use `.env` locally, or set `ANTHROPIC_API_KEY` from CI/CD secrets

## Performance Expectations

- **First run (reindex):** 2-5 minutes per 100 pages
- **Suggestion generation (step):** 30-60 seconds per page
- **Link insertion:** 1-2 seconds per page
- **Full documentation:** ~4-8 hours for 293 pages with batches of 5

Token costs vary by documentation size (typically $0.50-$2.00 per 100 pages).
