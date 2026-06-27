# Writer Assistant

A Flue-based TypeScript agent framework that automates documentation generation, styling, cross-linking, and validation for large-scale projects.

## Overview

The writer-assistant coordinates specialized agents to handle documentation tasks:

- **Crossref** — Analyzes documentation and creates cross-references between pages
- **Write Data Type Reference** — Generates comprehensive API reference documentation from source code
- **Write Tutorial** — Creates learning-oriented guides for newcomers (linear, step-by-step)
- **Write Examples** — Generates companion Scala example sub-modules with compile and lint verification
- **Extract Metadata** — Extracts and populates metadata (title, description, keywords)
- **Fix Writing Style** — Validates and fixes documentation for style compliance
- **Check mdoc** — Compiles and validates mdoc code blocks in individual files or directories (read-only checker)
- **Fix mdoc** — Compiles mdoc code blocks and automatically fixes errors (with fixer loop, max 3 rounds)
- **Check Website** — Verifies the full documentation website builds successfully; optionally runs `sbt docs/mdoc` first (read-only)
- **Fix Website** — Builds the website and automatically fixes errors (with fixer loop, max 3 rounds)
- **Preview Website** — Starts a live documentation dev server (Docusaurus/MkDocs), optionally running `sbt docs/mdoc` first
- **Verify Builds** — Checks documentation builds succeed and auto-fixes failures

## Features

✨ **Safe Link Insertion**

- Protects code fences (` ``` `, `~~~`) and inline code (`` ` `` `)
- Preserves YAML frontmatter untouched
- Case-insensitive phrase matching with exact casing preservation

🔒 **Security Hardened**

- Path traversal protection (symlinks checked via `realpathSync`)
- TOCTOU-safe filesystem operations
- LLM output validated before state persistence
- Comprehensive error handling with graceful fallbacks

📊 **Intelligent Analysis**

- LLM-based section type classification (reference, guide, tutorial, overview)
- Confidence-based suggestion filtering (high/medium/low)
- Automatic deduplication of suggestions
- Token usage tracking and cost estimation

⚙️ **Flexible Operation**

- Four execution modes: reindex, step, autopilot, report
- Incremental processing with persistent state
- Configurable thresholds and exclusion patterns
- Batch processing for efficient LLM usage

## Workflow Overview

The writer-assistant processes documentation through four key stages:

```
┌─────────────────────────────────────────────────────┐
│ 1. INDEXING (reindex mode)                          │
├─────────────────────────────────────────────────────┤
│ - Scan docs directory                               │
│ - Extract: title, summary, keywords, sectionType   │
│ - Build page index                                   │
│ - Load sidebars.js → extract adjacent pages         │
│ → Output: state.index (all pages metadata)          │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│ 2. SUGGESTION GENERATION (step/autopilot mode)      │
├─────────────────────────────────────────────────────┤
│ For each page in batch:                             │
│   a. Load page content from disk                    │
│   b. Create prompt with:                            │
│      - Page index (all pages metadata)              │
│      - Adjacent pages list (from sidebar)           │
│      - Full page content                            │
│   c. Send to page-linker agent (Claude)             │
│   d. Agent analyzes & generates suggestions JSON:   │
│      { suggestions: [                               │
│        { targetId, anchorText, type, confidence }   │
│      ]}                                              │
│   → Output: raw suggestions from LLM                │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│ 3. SUGGESTION ENRICHMENT & DEDUPLICATION            │
├─────────────────────────────────────────────────────┤
│ For each suggestion from agent:                     │
│   - Find target page entry in index                 │
│   - Compute relative path to target                 │
│   - Check if already exists in state.suggestions    │
│   → If already exists: skip (don't re-add)          │
│   → If new: add to state.suggestions array          │
│ → Output: state.suggestions (accumulated)           │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│ 4. SUGGESTION VALIDATION & APPLICATION              │
├─────────────────────────────────────────────────────┤
│ For each high-confidence suggestion:                │
│   - Validate: path resolves, not already linked     │
│   - Try to insert link into page content            │
│   - If successful: mark as "applied" + write to disk│
│   - If failed: mark as "skipped"                    │
│ → Output: Updated page files on disk                │
└─────────────────────────────────────────────────────┘
```

### Key Design Points

- **Persistent State**: Suggestions accumulate in state; deduplication prevents re-adding the same suggestion
- **Incremental Processing**: Process pages one batch at a time, saving state after each batch
- **Adjacent Pages**: Sidebar structure extracted to provide context about related documentation
- **Confidence-Based**: High-confidence suggestions applied immediately; medium/low queued for review

## Quick Start

### Prerequisites

- Node.js 18+
- Flue CLI (`npm install -g @flue/cli`)
- Anthropic API key

### Installation

```bash
cd writer-assistant
npm install
```

### Setup

Create a `.env` file with your Anthropic API key:

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

Optionally create `.crossref-config.json` in the parent of your docs directory:

```json
{
  "excludePatterns": ["node_modules", ".github"],
  "maxLinksPerPage": 5,
  "confidenceThreshold": "high"
}
```

### Run Crossref

```bash
# Build fresh index
npx flue run crossref --target node \
  --input '{"docsDir":"./docs","mode":"reindex"}'

# Process pages one at a time
npx flue run crossref --target node \
  --input '{"docsDir":"./docs","mode":"step","batchSize":1}'

# Process all remaining pages
npx flue run crossref --target node \
  --input '{"docsDir":"./docs","mode":"autopilot"}'

# View coverage report
npx flue run crossref --target node \
  --input '{"docsDir":"./docs","mode":"report"}'
```

### Write Data Type Reference

Generate comprehensive API reference documentation from source code:

```bash
npx flue run write-data-type-ref --target node --input '{
  "projectRoot": "/path/to/zio-repo",
  "outputPath": "docs/reference/fiber.md",
  "dataTypePath": "core/shared/src/main/scala/zio/Fiber.scala"
}'
```

To also generate companion Scala examples (Phase 2.5), add the `examples` field:

```bash
npx flue run write-data-type-ref --target node --input '{
  "projectRoot": "/path/to/zio-repo",
  "outputPath": "docs/reference/fiber.md",
  "dataTypePath": "core/shared/src/main/scala/zio/Fiber.scala",
  "examples": {
    "moduleName": "zio-example-fiber"
  }
}'
```

### Write Tutorial

Create learning-oriented guides for newcomers:

```bash
npx flue run write-tutorial --target node --input '{
  "projectRoot": "/path/to/zio-repo",
  "outputPath": "docs/guides/getting-started-with-fibers.md",
  "topic": "Getting Started with ZIO Fibers"
}'
```

To also generate companion Scala examples (Phase 2.5), add the `examples` field:

```bash
npx flue run write-tutorial --target node --input '{
  "projectRoot": "/path/to/zio-repo",
  "outputPath": "docs/guides/getting-started-with-fibers.md",
  "topic": "Getting Started with ZIO Fibers",
  "examples": {
    "moduleName": "zio-example-fibers"
  }
}'
```

To re-run only specific phases (e.g. debug a build failure without repeating research/write), use `skipPhases`:

```bash
npx flue run write-tutorial --target node --input '{
  "projectRoot": "/path/to/zio-repo",
  "outputPath": "docs/guides/getting-started-with-fibers.md",
  "topic": "Getting Started with ZIO Fibers",
  "skipPhases": ["research", "write", "verify", "integrate", "review", "style"]
}'
```

Valid `skipPhases` values: `"research"`, `"write"`, `"examples"`, `"verify"`, `"integrate"`, `"review"`, `"style"`, `"verifyBuild"`.

Tutorials follow a 7-section structure:

1. Introduction (with learning objectives)
2. Background / Big Picture (optional)
3. Concept sections (3-6 sections, one concept each)
4. Putting It Together (complete runnable example)
5. Running the Examples (git clone + sbt commands)
6. What You've Learned (recap of objectives)
7. Where to Go Next (links to how-to guides)

### Write Examples

Generate companion Scala example sub-modules for documentation. Can be run standalone or triggered automatically via `write-data-type-ref` and `write-tutorial` with the `examples` payload field.

```bash
npx flue run write-examples --target node --input '{
  "projectRoot": "/path/to/zio-repo",
  "moduleName": "zio-http-example-fiber",
  "topic": "ZIO Fiber lifecycle management",
  "docType": "data-type-ref",
  "outputDocPath": "/path/to/zio-repo/docs/reference/fiber.md"
}'
```

**`docType` values and generated file names:**

| `docType`       | Generated files                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `data-type-ref` | `BasicUsage.scala`, `AdvancedPatterns.scala`, `CompleteExample.scala`                                              |
| `tutorial`      | `Concept1Example.scala`, `Concept2Example.scala`, `Concept3Example.scala`, `CompleteExample.scala`                 |
| `how-to-guide`  | `Step1BasicExample.scala`, `Step2IntermediateExample.scala`, `Step3AdvancedExample.scala`, `CompleteExample.scala` |
| `module-ref`    | `MultiTypeComposition.scala`, `CommonPattern1.scala`, `CommonPattern2.scala`, `CompleteExample.scala`              |

**Phases:** Setup (build.sbt + dir) → Generate Scala files → Compile (`sbt <module>/compile`) → **Run** (execute each example, verify output) → Lint (`sbt fmtChanged && sbt check`) → Document (embed in article if `outputDocPath` provided).

**Hierarchical example modules** (`parentModule` payload field): creates a self-contained sbt project hierarchy — each directory has its own `build.sbt` linked via `RootProject(file(...))`, wired into the root project's `.aggregate(...)`.

Returns `{ success, exampleFiles, compileSuccess, runSuccess, lintSuccess, documentationAdded }`.

### Preview Website

Start a live documentation dev server. The server runs in the background — the workflow returns once the port is accepting connections.

```bash
# Start preview immediately (no mdoc recompile)
npx flue run preview-website --target node --input '{
  "projectRoot": "/path/to/zio-repo"
}'

# Recompile mdoc first, then start preview
npx flue run preview-website --target node --input '{
  "projectRoot": "/path/to/zio-repo",
  "runMdoc": true
}'
```

Returns `{ success, url, pid, buildSystem, mdocRan, mdocSuccess }`. Stop the server with `kill <pid>`.

**Auto-detection:** Same build-system detection as `check-website` (Docusaurus `website/`, root `package.json`, MkDocs). Preview commands: `yarn start` (Docusaurus) / `mkdocs serve` (MkDocs).

### Check Website

Verify the full documentation website builds successfully. Read-only.

```bash
# Check website only
npx flue run check-website --target node --input '{
  "projectRoot": "/path/to/zio-repo"
}'

# Run sbt docs/mdoc first, then check website
npx flue run check-website --target node --input '{
  "projectRoot": "/path/to/zio-repo",
  "runMdoc": true
}'
```

Returns `{ success, buildSystem, errorCount, errors, mdocRan, mdocSuccess }`.

### Check mdoc Compilation

Check and validate mdoc code blocks without running a full workflow. Accepts a single file, a list of files, or a directory (recursively expanded). **Read-only:** reports errors but does not fix them.

```bash
# Single file
npx flue run check-mdoc --target node --input '{
  "projectRoot": "/path/to/zio-repo",
  "paths": "docs/reference/fiber.md"
}'

# Multiple files
npx flue run check-mdoc --target node --input '{
  "projectRoot": "/path/to/zio-repo",
  "paths": ["docs/reference/fiber.md", "docs/reference/chunk.md"]
}'

# Entire directory (walks subdirectories)
npx flue run check-mdoc --target node --input '{
  "projectRoot": "/path/to/zio-repo",
  "paths": ["docs/reference/concurrency/"]
}'

# Entire docs project
npx flue run check-mdoc --target node --input '{
  "projectRoot": "/path/to/zio-repo"
}'
```

Returns structured result with `success`, `errorCount`, `errors` (with file and line), and `durationMs`.

### Fix mdoc Compilation

Check and automatically fix mdoc code blocks. Same input as `check-mdoc`, but spawns a writer agent to fix errors with automatic re-checking. Loops up to `maxRounds` (default 3):

```bash
# Fix single file with auto-retry (up to 3 rounds)
npx flue run fix-mdoc --target node --input '{
  "projectRoot": "/path/to/zio-repo",
  "paths": "docs/reference/fiber.md"
}'

# Fix directory with custom max rounds
npx flue run fix-mdoc --target node --input '{
  "projectRoot": "/path/to/zio-repo",
  "paths": ["docs/reference/concurrency/"],
  "maxRounds": 5
}'

# Fix entire docs project
npx flue run fix-mdoc --target node --input '{
  "projectRoot": "/path/to/zio-repo",
  "maxRounds": 3
}'
```

Returns structured result with `success`, `rounds` (iterations used), `errorCount` (remaining after all rounds), and `errors`.

## Development & CI

### Local Setup

Enter the nix development environment:

```bash
nix develop
```

This provides:

- Node.js 20.x and npm
- TypeScript compiler and LSP server
- Code formatting (Prettier) and linting (ESLint)
- All required tools pre-configured

### Local Commands

Within `nix develop`:

```bash
npm install          # Install dependencies (uses package-lock.json)
npm run build        # Compile TypeScript to dist/
npm test             # Run tests with Vitest
npm run test:watch   # Watch mode for development
npx prettier --check . # Check code formatting
npx prettier --write .  # Auto-fix formatting
npx eslint .         # Run linting checks
```

### CI Checks

Run all CI checks locally (reproduces exactly what GitHub Actions runs):

```bash
nix flake check
```

This runs:

- **build**: Compiles TypeScript from a fresh checkout
- **test**: Runs all Vitest tests
- **format**: Checks code formatting with Prettier
- **lint**: Validates code quality with ESLint

### Nix Flake Structure

- `flake.nix` — Entry point for nix build/dev setup
- `nix/devShell.nix` — Development environment configuration
- `nix/packages.nix` — Build package definition
- `nix/checks.nix` — CI checks (build, test, format, lint)
- `.github/workflows/ci.yml` — GitHub Actions workflow

All CI checks are defined declaratively in nix and work identically locally and in CI.

## Usage Modes

### 1. `reindex` — Build Fresh Index

Discovers all documentation files and classifies them by section type.

```bash
flue run workflows/crossref.ts --target node \
  --input '{"docsDir":"./docs","mode":"reindex"}'
```

**Output:**

- Walks entire docs directory (respecting `excludePatterns`)
- Extracts title, summary, keywords from each page
- Uses LLM to classify section type (reference/guide/tutorial/overview/other)
- Resets `processed` array so all pages get analyzed
- Persists state to `.crossref-state/state.json`

### 2. `step` — Process Pages Incrementally

Analyzes unprocessed pages and applies high-confidence links.

```bash
flue run crossref --target node \
  --input '{"docsDir":"./docs","mode":"step","batchSize":1}'
```

**Process next unprocessed page:**

```bash
flue run crossref --target node \
  --input '{"docsDir":"./docs","mode":"step"}'
```

**Process a specific target file:**

```bash
flue run crossref --target node \
  --input '{"docsDir":"./docs","mode":"step","targetFile":"reference/fiber/fiber.md"}'
```

**Process all files in a directory (recursively):**

```bash
flue run crossref --target node \
  --input '{"docsDir":"./docs","mode":"step","targetDir":"reference/fiber/","batchSize":5}'
```

**Output per page:**

- ✓ Processed: [title] (N/total) | Applied: X links | Queued: Y
- Token counts (this run + cumulative)
- Cost estimate

**Behavior:**

- If `targetFile` is provided, finds and processes only that file (regardless of prior processing state)
- If `targetDir` is provided, processes up to `batchSize` files from that directory and all subdirectories
- Otherwise, processes next unprocessed page in discovery order
- Spawns child task per page with page-linker agent
- Parses LLM suggestions with schema validation
- Applies suggestions meeting `confidenceThreshold` immediately
- Queues medium/low-confidence for human review
- Saves state after each page

**targetDir Usage:**

- Accepts relative paths (e.g., `"reference/fiber/"`) or absolute paths
- Recursively finds all `.md` and `.mdx` files in the directory
- Processes up to `batchSize` files per invocation (default `1`)
- Useful for batch-processing documentation sections
- Can be combined with `batchSize` for multi-file processing in one run

### 3. `autopilot` — Process All Pages

Loops `step` mode until complete.

```bash
flue run workflows/crossref.ts --target node \
  --input '{"docsDir":"./docs","mode":"autopilot"}'
```

**Output:**

- Per-page iteration summaries (same as `step`)
- Final completion message with total processed and token spend

### 4. `report` — Coverage Analysis

Shows link density, orphan detection, and suggestion breakdown.

```bash
flue run workflows/crossref.ts --target node \
  --input '{"docsDir":"./docs","mode":"report"}'
```

**Output includes:**

- **Coverage**: total pages, processed %, pending count
- **Suggestions**: applied/skipped/pending (with confidence distribution)
- **Link Density**: average outgoing links per page by section type
- **Orphans**: pages with no incoming links (first 10 listed)
- **Token Spend**: cumulative cost to date

### 5. `verify` — Validate Documentation Build

Verifies that the documentation builds successfully after cross-reference additions.

```bash
flue run workflows/crossref.ts --target node \
  --input '{"docsDir":"./docs","mode":"verify"}'
```

**Purpose:**

- Ensures cross-referenced links don't break the documentation build
- Detects build errors and reports them clearly
- Validates that the project can be built after modifications

**Auto-detection:** Automatically detects the documentation build system:

- **Docusaurus** (via `../website/package.json` or `../package.json`)
- **MkDocs** (via `../mkdocs.yml`)
- **Sphinx** (via `docs/conf.py`)

**Output:**

- **Success**: `✓ docusaurus build passed in 15234ms`
- **Failure**: `✗ docusaurus build failed (exit code 1)` with full build output

**Example CI Usage:**

```bash
# Step 1: Add cross-references
flue run crossref --target node \
  --input '{"docsDir":"./docs","mode":"autopilot"}'

# Step 2: Verify docs still build
flue run crossref --target node \
  --input '{"docsDir":"./docs","mode":"verify"}'
```

The verify mode is particularly useful in CI/CD pipelines to catch broken links and other build issues before merging documentation changes.

### 6. `verify-and-fix` — Auto-Fix Build Failures

Automatically fixes documentation build failures and re-validates until success. The auto-fixer is a general software engineer that can modify any project file to resolve build issues.

```bash
npm exec -- flue run crossref --target node \
  --input '{
    "projectRoot":"/path/to/project",
    "mode":"verify-and-fix",
    "maxRetries":3
  }'
```

**Purpose:**

- Detects build failures (broken links, syntax errors, missing files, compilation errors, etc.)
- Automatically analyzes and fixes errors across the entire project
- Re-runs verification until build passes or max retries reached
- Reduces manual iteration on documentation and build issues

**How it works:**

1. **Verify** → runs documentation build pipeline (sbt mdoc → yarn install → yarn build)
2. **If failed** → extract structured errors (broken link, missing file, syntax error, etc.)
3. **Analyze** → auto-fixer analyzes all errors holistically to find root causes
4. **Fix** → auto-fixer modifies any project files needed: docs, config, dependencies, build scripts
5. **Loop** → re-verify with fixed project state
6. **Repeat** → until success or max retries (default: 3)

**Fixable issues across the project:**

- **Broken links** — Add missing `.md` extension, correct relative paths, fix anchors
- **Syntax errors** — Close unclosed code fences, fix YAML frontmatter, fix markdown syntax
- **Missing files** — Remove broken references, suggest alternatives, update cross-links
- **Dependencies** — Add missing packages to `package.json`
- **Configuration** — Fix `docusaurus.config.js`, build configs, any configuration file
- **Build system** — Fix sbt commands, yarn setup, compilation issues
- **Source code** — Fix imports or compilation issues if needed

**Example workflow:**

```bash
# Step 1: Add cross-references
npm exec -- flue run crossref --target node \
  --input '{"projectRoot":".","mode":"autopilot"}'

# Step 2: Verify and auto-fix any failures
npm exec -- flue run crossref --target node \
  --input '{
    "projectRoot":".",
    "mode":"verify-and-fix",
    "maxRetries":3
  }'
```

**Parameters:**

- `projectRoot` (required): Path to project root directory (e.g., `/home/milad/sources/scala/zio-2.x-new`, `.`)
- `mode` (required): `"verify-and-fix"`
- `maxRetries` (optional): Maximum retry attempts (default: 3). Set higher for complex projects, lower to fail fast

**Output:**

```
[crossref] Verify-and-fix attempt 1/3
[crossref] ✗ docusaurus build failed (exit code 1)
[crossref] Found 9 errors. Dispatching auto-fixer...
[auto-fixer] Analyzing 9 build errors
[auto-fixer] Identified 3 fixable issues
[auto-fixer] Fixed 3 errors: Added .md extension to links, Updated package.json with missing plugin
[crossref] ✓ Build passed! Documentation is ready.
```

## Configuration

### Metadata Extraction

The writer-assistant can be extended with metadata extraction capabilities to enrich your documentation before running cross-reference analysis. This improves link quality by ensuring each page has proper metadata (title, description, keywords).

#### Pre-enrichment (Recommended)

For best results, run metadata extraction once before starting cross-reference processing:

```bash
# Extract metadata for all pages (comprehensive)
flue run extract-metadata --target node \
  --input '{"docsDir":"./docs","mode":"all"}'
```

This pre-enrichment approach:

- Extracts and generates metadata for all pages in one batch
- Populates page frontmatter with title, description, and keywords
- Provides complete context for the writer-assistant to work with
- **Most efficient** for initial documentation setup

**When to use pre-enrichment:**

- Setting up crossref for a new documentation site
- You want all pages to have consistent metadata before linking
- Your docs are missing or have incomplete frontmatter

#### Integration with Crossref

Once metadata is extracted, run the crossref workflow normally:

```bash
# Build index (will use extracted metadata)
flue run workflows/crossref.ts --target node \
  --input '{"docsDir":"./docs","mode":"reindex"}'

# Process pages with rich metadata context
flue run workflows/crossref.ts --target node \
  --input '{"docsDir":"./docs","mode":"autopilot"}'
```

The writer-assistant automatically uses extracted metadata (descriptions, keywords) to make smarter linking decisions.

#### Fallback (On-Demand)

If you skip pre-enrichment, the writer-assistant will extract metadata on-demand for pages as needed:

```bash
# Run without pre-enrichment (metadata extracted per-page)
flue run extract-metadata --target node \
  --input '{"docsDir":"./docs","mode":"missing"}'
```

This fallback approach:

- Extracts metadata only for pages that lack it
- Happens automatically during page processing
- Less efficient but works without additional setup
- Good for incremental documentation updates

**When to use on-demand:**

- Adding crossref to existing documentation
- Only certain pages need metadata
- You want to minimize upfront extraction cost

#### Metadata Mode Reference

| Mode      | Purpose                                          | Use Case                           |
| --------- | ------------------------------------------------ | ---------------------------------- |
| `all`     | Extract for all pages                            | Initial setup, complete refresh    |
| `missing` | Extract for pages without metadata               | Incremental updates, fallback mode |
| `file`    | Extract for single file                          | Testing, specific page updates     |
| `dir`     | Extract for all pages in a directory recursively | Batch updates, section enrichment  |

**Example: Extract single file**

```bash
flue run extract-metadata --target node \
  --input '{"docsDir":"./docs","mode":"file","targetFile":"guides/getting-started.md"}'
```

**Example: Extract entire directory recursively**

```bash
flue run extract-metadata --target node \
  --input '{"docsDir":"./docs","targetDir":"guides/","mode":"all"}'
```

This extracts metadata for all `.md` and `.mdx` files in the `guides/` directory and all subdirectories, without touching other documentation sections.

#### Token Impact

**Pre-enrichment (Recommended):** ~500-1000 tokens per batch

- Single batch classifies all pages
- More efficient than per-page extraction
- Lower overall cost for large documentation

**On-Demand Fallback:** ~100-300 tokens per page (as needed)

- Only pages missing metadata are processed
- Higher cost if many pages need extraction
- Spreads cost across multiple runs

**Recommendation:** Use pre-enrichment for best performance and lowest cost.

### `.crossref-config.json`

Place in the parent directory of your docs to customize behavior:

```json
{
  "excludePatterns": ["node_modules", ".github", "archived"],
  "maxLinksPerPage": 10,
  "maxSeeAlsoSuggestion": 5,
  "confidenceThreshold": "high",
  "clearSuggestionsBeforeRun": false
}
```

**Options:**

| Option                      | Type                        | Default  | Description                                              |
| --------------------------- | --------------------------- | -------- | -------------------------------------------------------- |
| `excludePatterns`           | string[]                    | `[]`     | Path segments to skip (e.g., "archived", "node_modules") |
| `maxLinksPerPage`           | number                      | `10`     | Max suggestions returned per page                        |
| `maxSeeAlsoSuggestion`      | number                      | `5`      | Max "See Also" links per page                            |
| `confidenceThreshold`       | "low" \| "medium" \| "high" | `"high"` | Minimum confidence to auto-apply links                   |
| `clearSuggestionsBeforeRun` | boolean                     | `false`  | Clear old suggestions for re-processed pages             |

### Confidence Levels

- **`high`** — Page title/variant appears directly in prose, or tightly coupled concepts
- **`medium`** — Strong conceptual overlap without direct text match
- **`low`** — Loosely related, tangentially useful

Only suggestions meeting the threshold are auto-applied. Others stay in state for manual review.

### Clearing Suggestions on Re-run

When `clearSuggestionsBeforeRun` is enabled:

```json
{
  "clearSuggestionsBeforeRun": true
}
```

**Behavior:**

- Old suggestions are removed before re-processing pages
- Useful when re-analyzing pages that previously generated incorrect suggestions
- When processing a specific file with `targetFile`, only suggestions **from** that file are cleared
- When enabled globally (via config), suggestions **from or to** re-processed files are cleared

**Use case:** You re-run on a specific page and want fresh suggestions without stale entries from a prior run.

## State Management

State persists in `.crossref-state/state.json`:

```json
{
  "indexBuiltAt": "2026-05-31T...",
  "docsDir": "./docs",
  "index": [
    {
      "id": "getting-started",
      "title": "Getting Started",
      "path": "guides/getting-started.md",
      "absPath": "/full/path/to/getting-started.md",
      "summary": "How to set up...",
      "keywords": ["setup", "install"],
      "sectionType": "guide",
      "existingLinkCount": 2
    }
  ],
  "processed": ["getting-started", "concepts-fiber"],
  "suggestions": [
    {
      "sourceId": "getting-started",
      "targetId": "concepts-fiber",
      "targetTitle": "Fiber Basics",
      "targetRelativePath": "../concepts/fiber.md",
      "anchorText": "Fiber",
      "type": "inline",
      "confidence": "high",
      "reasoning": "Title match in prose",
      "status": "applied"
    }
  ],
  "tokens": {
    "inputTotal": 150000,
    "outputTotal": 50000,
    "runningCost": 0.6
  }
}
```

**States:**

- `pending` — Suggested but not yet applied (awaiting review or threshold)
- `applied` — Successfully inserted into document
- `skipped` — Validation failed (already linked, path unresolvable, etc.)

## Architecture

### Core Modules

**Pure Utilities** (fully tested, no side effects):

- `tools/markdown-parser.ts` — Frontmatter, headings, links, safe zones
- `tools/link-inserter.ts` — Inline links, See Also sections with code-fence safety
- `tools/link-validator.ts` — Path validation, symlink safety, duplicate detection

**Infrastructure**:

- `tools/docs-fs.ts` — Async I/O Flue tools with path-traversal protection
- `tools/config-loader.ts` — Configuration loading with sensible defaults
- `tools/state-store.ts` — Persistent state with error recovery
- `tools/schemas.ts` — Valibot schemas for runtime validation

**Orchestration**:

- `agents/page-linker.ts` — Claude Haiku 4.5 agent for analysis
- `skills/cross-linking/SKILL.md` — LLM instructions
- `workflows/crossref.ts` — Workflow with 4 modes

### Data Flow

```
docs directory
    ↓
walkDocs() → find all .md/.mdx files
    ↓
reindex mode → extract metadata, LLM classify sectionType
    ↓
state: { index, processed: [] }
    ↓
step/autopilot → for each unprocessed page:
    ├─ read content
    ├─ call page-linker LLM agent
    ├─ parse suggestions
    ├─ compute targetRelativePath
    ├─ deduplicate
    ├─ validate (path safety, existence, no duplicates)
    ├─ apply high-confidence to disk
    └─ save state
    ↓
report mode → analyze state, show statistics
```

## Development

### Running Tests

```bash
# All tests
npm test

# Specific test file
npm test -- tests/markdown-parser.test.ts

# Watch mode
npm test:watch
```

**Test Coverage:**

- 19 tests for markdown parsing (frontmatter, headings, links, safe zones)
- 11 tests for link insertion (inline, See Also, code-fence safety)
- 4 tests for validation (paths, symlinks, duplicates)
- 9 end-to-end smoke tests (full workflow with fixture docs)

### Project Structure

```
writer-assistant/
├── tools/
│   ├── schemas.ts              # Valibot schema definitions
│   ├── markdown-parser.ts      # Pure parsing functions
│   ├── link-inserter.ts        # Pure insertion functions
│   ├── link-validator.ts       # Path & safety validation
│   ├── docs-fs.ts             # Async I/O tools
│   ├── config-loader.ts       # Config management
│   └── state-store.ts         # State persistence
├── agents/
│   └── page-linker.ts         # Claude agent profile
├── skills/
│   └── cross-linking/
│       └── SKILL.md           # LLM instructions
├── workflows/
│   └── crossref.ts            # Main orchestration
├── tests/
│   ├── markdown-parser.test.ts
│   ├── link-inserter.test.ts
│   ├── link-validator.test.ts
│   └── workflow-smoke.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .env                       # API key (not in git)
```

## Security Considerations

- **Path Traversal**: All paths resolved with `realpathSync` and checked against docs directory
- **Symlinks**: Followed to real target, then validated within boundary
- **TOCTOU**: Filesystem operations use try-catch on read, not existence checks
- **LLM Safety**: `targetRelativePath` never from LLM (computed deterministically)
- **Error Recovery**: Unreadable files skipped with warnings, state only updated if complete

## Limitations & Future Work

### Current Limitations

- Single batch of pages classified at a time (reindex is atomic)
- Suggestions from LLM cannot be directly overridden (must be accepted/rejected as-is)
- No conflict detection for overlapping link text

### Potential Enhancements

- Incremental reindex (update only changed files)
- Manual suggestion override/editing interface
- Analytics dashboard (link growth over time)
- Integration with documentation platforms (Docusaurus, MkDocs)
- Batch suggestion review UI

## Testing the Agent

Quick validation with fixture docs:

```bash
# Create test directory
mkdir -p /tmp/test-docs/{reference,guides}

# Add sample files
cat > /tmp/test-docs/reference/fiber.md << 'EOF'
---
title: Fiber
---
A Fiber is a lightweight virtual thread managed by the ZIO runtime.
EOF

cat > /tmp/test-docs/guides/getting-started.md << 'EOF'
---
title: Getting Started
---
This guide helps you build concurrent programs.
You will use Fiber to fork lightweight threads.
EOF

# Run workflow
flue run workflows/crossref.ts --target node \
  --input '{"docsDir":"/tmp/test-docs","mode":"reindex"}'

# Process pages
flue run workflows/crossref.ts --target node \
  --input '{"docsDir":"/tmp/test-docs","mode":"autopilot"}'

# View results
cat /tmp/test-docs/guides/getting-started.md
flue run workflows/crossref.ts --target node \
  --input '{"docsDir":"/tmp/test-docs","mode":"report"}'
```

## Performance Notes

- **Reindex**: O(n) walk + single LLM batch classification
- **Step mode**: One page per invocation, ~500ms per page (includes LLM call)
- **Autopilot**: ~30 pages/minute (depends on doc size and network)
- **Token costs**: ~3000 tokens per page (~$0.015 with Claude Haiku 4.5)

## Troubleshooting

**"No index found. Run reindex first."**

- Run `reindex` mode to build initial state

**Links not applying**

- Check `confidenceThreshold` in config (default: "high")
- Use `report` mode to see confidence distribution
- Lower threshold to `"medium"` in `.crossref-config.json`

**Unreadable files warning**

- Normal behavior for files with permission issues
- Check file permissions: `ls -la docs/`

**API key not found**

- Ensure `.env` file exists with `ANTHROPIC_API_KEY=...`
- Check it's not in `.gitignore` globally

## Contributing

This is a production-ready implementation. For improvements:

1. Run tests: `npm test`
2. Check types: `npx tsc --noEmit`
3. Create pull request with spec compliance + quality review

## License

This project is part of the ZIO Skills collection. See LICENSE in the parent directory.

## Support

For issues or questions:

- Check the [Flue documentation](https://flueframework.com/)
- Review the [ZIO Skills project](https://github.com/zio/skills/)
- Open an issue with reproduction steps

---

**Ready to improve your documentation?**

```bash
flue run workflows/crossref.ts --target node \
  --input '{"docsDir":"./docs","mode":"autopilot"}'
```
