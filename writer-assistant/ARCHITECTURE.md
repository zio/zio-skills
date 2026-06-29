# Writer Assistant Architecture

A TypeScript-based documentation workflow framework built on the Flue runtime, designed to automate and enhance documentation generation, styling, cross-linking, and validation for large-scale projects.

## 1. Project Overview

The writer-assistant orchestrates multiple specialized agents and workflows to handle different documentation tasks:

- **Cross-reference linking** — Discover and insert internal links between documentation pages
- **Data type documentation** — Generate comprehensive API reference documentation from source code
- **Metadata enrichment** — Extract and populate metadata (title, description, keywords) for pages
- **Writing style validation** — Check and fix documentation for style compliance
- **Documentation builds** — Verify and auto-fix documentation build failures

```
writer-assistant/
├── agents/                       # Claude agents (Flue-based)
│   ├── page-linker.ts           # Cross-reference analysis
│   ├── docs-writer.ts           # Documentation generation
│   ├── docs-researcher.ts       # Research and gathering
│   ├── metadata-extractor.ts    # Metadata extraction
│   ├── docs-style-checker.ts    # Writing style validation
│   ├── docs-reviewer.ts         # Content review
│   └── coding-agent.ts          # General software engineering
│
├── workflows/                    # Workflow orchestrators
│   ├── crossref.ts              # Cross-reference linking workflow (6 modes)
│   ├── write-data-type-ref.ts   # API reference documentation generation (7-8 phases)
│   ├── write-how-to-guide.ts    # How-to guide documentation generation (7-8 phases)
│   ├── write-module-ref.ts      # Module reference documentation generation (7-8 phases)
│   ├── write-tutorial.ts        # Tutorial documentation generation (7-8 phases)
│   ├── write-examples.ts        # Companion Scala example generation (standalone)
│   ├── extract-metadata.ts      # Metadata extraction workflow
│   ├── fix-writing-style.ts     # Writing style fixing workflow (2 phases)
│   ├── organize-types.ts        # Sidebar categorization workflow — manual or auto (4 phases)
│   ├── report-method-coverage.ts # Method coverage checker — runs extract-members + check-coverage scripts (no agent)
│   ├── check-mdoc.ts            # mdoc compilation checker (no agent, pure execSync, read-only)
│   ├── fix-mdoc.ts              # mdoc compiler + fixer (writer agent fixer loop)
│   ├── check-website.ts         # Full website build checker (no agent, read-only)
│   ├── fix-website.ts           # Website build + fixer loop (writer agent, max 3 rounds)
│   ├── preview-website.ts       # Start detached dev server (Docusaurus/MkDocs); optional mdoc step
│   ├── coding-agent.ts          # Coding task dispatch
│   │
│   ├── phases/                  # Workflow execution phases
│   │   ├── reindex.ts           # Build documentation index
│   │   ├── process.ts           # Process pages, generate suggestions
│   │   ├── research.ts          # Gather information
│   │   ├── review.ts            # Review content
│   │   ├── style.ts             # Apply style fixes
│   │   ├── verify.ts            # Verify build success
│   │   ├── examples.ts          # Generate + compile + lint Scala example files
│   │   └── report.ts            # Generate coverage reports
│   │
│   └── utils/                   # Shared utilities
│       ├── link-inserter.ts     # Insert links into markdown
│       ├── link-validator.ts    # Validate link safety and correctness
│       ├── metadata-utilities.ts # Extract/manage metadata
│       ├── confidence.ts        # Confidence threshold checking
│       ├── cost.ts              # Token cost estimation
│       ├── yaml.ts              # YAML frontmatter manipulation
│       ├── mdoc-runner.ts       # Shared mdoc utilities (expand, resolve, run, parse)
│       └── sidebar-parser.ts    # Docusaurus sidebar parsing
│
├── lib/                         # Core libraries
│   ├── schemas.ts               # Valibot data structures
│   ├── state-store.ts           # Persistent state management
│   ├── config-loader.ts         # Configuration loading
│   ├── markdown-parser.ts       # Markdown parsing and safety
│   ├── title-utils.ts           # Title normalization
│   ├── auto-fixer.ts            # Automated error fixing
│   ├── build-error-extractor.ts # Parse build output for errors
│   ├── scala-source-discovery.ts # Scala source code finding
│   ├── markdown-utils.ts        # Shared markdown file utilities (findRecentlyModifiedMarkdownFiles)
│   └── migrate-state.ts         # State format migration
│
├── tools/                       # Flue tools for agents
│   ├── run_mdoc.ts              # mdoc executable tool
│   └── (additional Flue tools)
│
├── skills/                      # LLM instruction skills
│   ├── cross-linker/
│   │   └── SKILL.md             # Cross-linking strategy
│   ├── docs-data-type-ref/
│   │   └── SKILL.md             # API documentation structure
│   ├── docs-tutorial/
│   │   ├── SKILL.md             # Tutorial writing structure and tone
│   │   └── CHECKLIST.md         # 38-item verification checklist
│   ├── docs-module-ref/
│   │   └── SKILL.md             # Module reference documentation structure
│   ├── docs-research/
│   │   └── SKILL.md             # Research methodology (supports 5 doc types incl. module-ref)
│   ├── docs-writing-style/
│   │   ├── SKILL.md             # Prose style rules
│   │   └── check-docs-style.sh  # Mechanical rule checker
│   ├── docs-mdoc-conventions/
│   │   ├── SKILL.md             # mdoc modifier reference
│   │   └── check-mdoc-conventions.sh # mdoc modifier checker
│   └── metadata-extractor/
│       └── SKILL.md             # Metadata extraction from content
│
├── tests/                       # Vitest test suite
│   ├── markdown-parser.test.ts
│   ├── link-inserter.test.ts
│   ├── link-validator.test.ts
│   ├── migration.test.ts
│   └── workflow-smoke.test.ts
│
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript configuration
├── vitest.config.ts             # Test runner configuration
└── ARCHITECTURE.md              # This file
```

## 2. System Architecture

### 2.1. High-Level Workflow Model

```
User Input (CLI/API)
    ↓
FlueContext with payload
    ↓
Workflow (crossref.ts, write-data-type-ref.ts, etc.)
    ├─ Load configuration
    ├─ Load or initialize state
    ├─ Route to appropriate phase(s)
    ├─ Spawn agents (docs-writer, page-linker, etc.)
    │   └─ Agent makes tool calls
    │   └─ Agent returns structured output
    ├─ Post-process and validate results
    ├─ Update state/files
    └─ Return results
    ↓
Updated Documentation + State
```

### 2.2. Agent Architecture

All agents are built on the Flue framework and use Claude Haiku 4.5 as the base model. Each agent has:

1. **Agent profile** (`agents/*.ts`) — Flue agent configuration with model selection and tool bindings
2. **Skill instructions** (`skills/*/SKILL.md`) — LLM prompts teaching the agent what/how to do its job
3. **Tools** — Access to filesystem, external APIs, or specialized functions via Flue's tool system

**Agent Deployment:**

```
agents/page-linker.ts
    ↓
Flue Agent Profile (Claude Haiku 4.5)
    ↓
Runs with skill: skills/cross-linker/SKILL.md
    ↓
Calls tools: search_pages, validate_anchor, extract_page_structure, etc.
    ↓
Returns JSON: { suggestions: [...] }
```

## 3. Core Workflows

### 3.1. Crossref Workflow (`workflows/crossref.ts`)

**Purpose:** Discover and insert cross-references between documentation pages.

**Modes:**

| Mode             | Purpose                                       | Output                          |
| ---------------- | --------------------------------------------- | ------------------------------- |
| `reindex`        | Build fresh documentation index               | `.crossref-state/index.json`    |
| `step`           | Process one page batch, apply high-conf links | Updated .md files + state       |
| `autopilot`      | Loop `step` until all pages processed         | Complete documentation updated  |
| `report`         | Analyze coverage, orphans, link density       | Coverage report (stdout)        |
| `verify`         | Verify documentation build succeeds           | Build result JSON               |
| `verify-and-fix` | Auto-fix build failures, re-verify            | Fixed docs + build success/fail |

**State Management:**

- **Location:** `.crossref-state/index.json` (pages) and `.crossref-state/suggestions.json` (suggestions)
- **Lifecycle:**
  - `reindex` — Clears processed array, rebuilds index
  - `step` — Marks pages as processed, accumulates suggestions
  - `autopilot` — Loops step mode until completion
  - All modes — Atomic writes with error recovery

**Data Flow (Step Mode):**

```
Find next unprocessed page
    ↓
Load page content from disk
    ↓
Create context: { pageIndex, adjacentPages, content }
    ↓
Call page-linker agent → suggestions JSON
    ↓
Validate & enrich suggestions
    ├─ Compute relative paths
    ├─ Check anchor existence
    ├─ Deduplicate vs prior suggestions
    └─ Filter by confidence threshold
    ↓
Apply high-confidence links to disk
    ↓
Mark page as processed
    ↓
Persist state
```

### 3.2. Write Data Type Reference Workflow (`workflows/write-data-type-ref.ts`)

**Purpose:** Generate comprehensive API reference documentation from Scala source code.

**Phases:**

1. **Research Phase** — Analyze source code, extract type information, gather usage examples
2. **Write Phase** — Generate documentation following API reference structure
3. _(optional)_ **Examples Phase** — Create companion Scala sub-module, compile and lint examples, embed examples using `mdoc:embed` (activated by `examples` payload field)
4. **Verify Phase** — Check method coverage, compile mdoc examples to zero errors
5. **Integrate Phase** — Update sidebars.js, docs/index.md, cross-references
6. **Review Phase** — Critic→fixer loop for content accuracy (max 5 rounds)
7. **Style Phase** — Mechanical + LLM prose style validation and fixing
8. **Build Verification Phase** — Run docs build (Docusaurus/MkDocs/Sphinx); skip gracefully if no build system detected

**Input:**

```json
{
  "projectRoot": "/path/to/project",
  "dataTypePath": "zio/Fiber.scala",
  "outputPath": "docs/reference/fiber.md",
  "examples": { "moduleName": "zio-example-fiber" }
}
```

**Output:** Markdown file with:

- Type signature and constructor
- Method reference documentation
- Usage examples (mdoc-compiled)
- Links to related types
- See Also section
- Full prose style compliance

### 3.3. Write Tutorial Workflow (`workflows/write-tutorial.ts`)

**Purpose:** Create learning-oriented guides for newcomers to ZIO library topics.

**Phases:**

1. **Research Phase** — Gather information about topic from source code, tests, examples
2. **Write Phase** — Generate tutorial following 7-section structure with linear progression
3. _(optional)_ **Examples Phase** — Create companion Scala sub-module, compile and lint examples, append shell-command "Running the Examples" section (activated by `examples` payload field)
4. **Verify Phase** — Check structure compliance, compile mdoc examples to zero errors, run 38-item checklist
5. **Integrate Phase** — Update sidebars.js under "Guides", docs/index.md, cross-references
6. **Review Phase** — Critic→fixer loop for content completeness and accuracy (max 5 rounds)
7. **Style Phase** — Mechanical + LLM prose style validation and fixing
8. **Build Verification Phase** — Run docs build (Docusaurus/MkDocs/Sphinx); on failure, spawns writer agent to fix errors and retries up to 3 rounds; skip gracefully if no build system detected

Any phase can be skipped via `skipPhases: string[]` — useful for re-running only the build phase after a partial failure without repeating expensive earlier phases.

**Input:**

```json
{
  "projectRoot": "/path/to/project",
  "outputPath": "docs/guides/getting-started-with-fibers.md",
  "topic": "Getting Started with ZIO Fibers",
  "examples": { "moduleName": "zio-example-fibers" },
  "skipPhases": ["research", "write", "verify", "integrate", "review", "style"]
}
```

**7-Section Structure:**

1. **Introduction** — Who it's for, learning objectives, section outline
2. **Background** (optional) — Conceptual framing (no code)
3. **Concept sections** (3-6 sections) — One concept per section with annotated code
4. **Putting It Together** — Complete runnable example
5. **Running the Examples** — git clone + sbt runMain commands
6. **What You've Learned** — Recap of learning objectives
7. **Where to Go Next** — Links to how-to guides and reference pages

**Output:** Markdown file with:

- Linear learning path (no branching)
- Warm, welcoming tone ("Welcome", "Let's", "Notice that")
- Line-by-line code annotations
- Intermediate output demonstrations
- Complete runnable example
- Self-contained example files

### 3.4. Write How-To Guide Workflow (`workflows/write-how-to-guide.ts`)

**Purpose:** Create goal-oriented guides that help readers accomplish a specific, concrete task using the library — not tutorials (no learning objectives) and not reference pages (no exhaustive API coverage).

**Phases:**

1. **Research Phase** — Gather information about the topic from source code, tests, examples (focus: `'guide'` — configuration options, decision points, integration patterns)
2. **Write Phase** — Generate how-to guide following the 8-section structure with goal-oriented, imperative prose
3. _(optional)_ **Examples Phase** — Create companion Scala sub-module (activated by `examples` payload field)
4. **Verify Phase** — Check structure compliance, compile mdoc examples to zero errors, verify Problem section has "before" code, run how-to guide CHECKLIST.md
5. **Integrate Phase** — Update sidebars.js under "Guides" category, docs/index.md, cross-references from related reference pages
6. **Review Phase** — Critic→fixer loop for content completeness and accuracy (max 5 rounds)
7. **Style Phase** — Mechanical + LLM prose style validation and fixing
8. **Build Verification Phase** — Run docs build; on failure, spawns writer agent to fix errors and retries up to 3 rounds; skip gracefully if no build system detected

Any phase can be skipped via `skipPhases: string[]`.

**Input:**

```json
{
  "projectRoot": "/path/to/project",
  "outputPath": "docs/guides/handle-errors-with-zio.md",
  "topic": "How to handle errors with ZIO",
  "examples": { "moduleName": "zio-example-error-handling" },
  "skipPhases": ["research", "write"]
}
```

**8-Section Structure:**

1. **Introduction** — 1 paragraph: what the reader will accomplish, why useful, approach
2. **The Problem** — Concrete pain point + why it matters + "before" code showing the problem
3. **Prerequisites** — sbt dependency, base imports, assumed knowledge
4. **The Core Model** — Domain types in `mdoc:silent`, brief rationale
5. **Step-by-step sections** (3-6) — One concept per section: intro → code → result
6. **Putting It Together** — Complete copy-paste runnable example
7. **Running the Examples** — git clone + sbt runMain commands
8. **Going Further** (optional) — Links to reference pages, variations, related guides

**Key differences from `write-tutorial.ts`:**

- `focus: 'guide'` in research phase (maps configuration options and decision points, not beginner patterns)
- Goal-oriented, imperative prose ("Define a Schema", "Create a codec") vs. warm tutorial style
- Problem section is mandatory and must include a "before" code example
- Verify phase checks how-to-guide CHECKLIST.md (not tutorial's 38-item checklist)
- Sidebar placement under "Guides" category; cross-references added from related reference pages

### 3.5. Write Module Reference Workflow (`workflows/write-module-ref.ts`)

**Purpose:** Generate comprehensive reference documentation for a module — a cohesive set of related data types that work together as a system.

**Phases:**

1. **Research Phase** — Map all core and supporting types, their relationships, data flow patterns, and composition examples
2. **Write Phase** — Generate module-level narrative (How They Work Together, Common Patterns, Integration Points) + type-level coverage; agent decides flat vs hierarchical structure based on skill rule unless overridden
3. _(optional)_ **Examples Phase** — Create companion Scala sub-module with multi-type composition examples (activated by `examples` payload field)
4. _(optional)_ **Diagram Phase** — Generate interactive JSX diagram of type relationships (activated by `diagram` payload field)
5. **Verify Phase** — Check method coverage across all core types, compile all mdoc examples to zero errors
6. **Integrate Phase** — Update sidebars.js (flat entry or hierarchical category), docs/index.md, cross-references
7. **Review Phase** — Critic→fixer loop for content accuracy (max 5 rounds)
8. **Style Phase** — Mechanical + LLM prose style validation and fixing
9. **Build Verification Phase** — Run docs build; skip gracefully if no build system detected

**Flat vs Hierarchical:**

| Module shape                                               | Output                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| ≤ 4 core types, or types always used together              | **Flat** — `docs/reference/<module>.md`                                |
| ≥ 5 core types, OR ≥ 3 types with rich self-contained APIs | **Hierarchical** — `docs/reference/<module>/index.md` + per-type pages |

**Input:**

```json
{
  "projectRoot": "/path/to/project",
  "moduleName": "http-model",
  "outputPath": "docs/reference/http-model.md",
  "structure": "flat"
}
```

**Output:** Markdown file(s) with module narrative, type-relationship diagram, per-type API coverage, and integration examples.

### 3.6. Write Examples Workflow (`workflows/write-examples.ts`)

**Purpose:** Generate companion Scala example sub-modules for any documentation article. Runs standalone or is invoked as Phase 2.5 by `write-data-type-ref` and `write-tutorial` when `examples` payload is present.

**Phases:**

1. **Setup** — Add sbt sub-module entry to `build.sbt`, aggregate into root project, create package directory
2. **Generate** — Write 3-5 Scala example files with type-specific naming conventions; `CompleteExample.scala` always last
3. **Compile** — `sbt <moduleName>/compile`; one agent-assisted retry on failure
4. **Run** — Execute each example, verify exit code 0 and no exceptions in output; one re-compile if agent fixes a runtime error
5. **Lint** — `git add` → `sbt fmtChanged` → `sbt check`
6. **Document** _(optional)_ — Embed examples in article: `mdoc:embed` inside `<details>` blocks for all doc types; `tutorial`/`how-to-guide` also include `###` subsections with "Observe X:" sentences and run commands

**Hierarchical modules** (`parentModule` field): creates a `RootProject(file(...))` hierarchy — each directory is a self-contained sbt project with its own `build.sbt`. Root's `.aggregate(...)` is updated to include the new parent module. Compile and run execute from the sub-module directory (not root).

**File naming by `docType`:**

| `docType`       | Files                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `data-type-ref` | `BasicUsage.scala`, `AdvancedPatterns.scala`, `CompleteExample.scala`                                              |
| `tutorial`      | `Concept1Example.scala`, `Concept2Example.scala`, `Concept3Example.scala`, `CompleteExample.scala`                 |
| `how-to-guide`  | `Step1BasicExample.scala`, `Step2IntermediateExample.scala`, `Step3AdvancedExample.scala`, `CompleteExample.scala` |
| `module-ref`    | `MultiTypeComposition.scala`, `CommonPattern1.scala`, `CommonPattern2.scala`, `CompleteExample.scala`              |

**Input:**

```json
{
  "projectRoot": "/path/to/project",
  "moduleName": "zio-http-example-fiber",
  "topic": "ZIO Fiber lifecycle management",
  "docType": "data-type-ref",
  "outputDocPath": "/path/to/docs/reference/fiber.md",
  "packageName": "ziohttpexamplefiber"
}
```

**Output:** `{ success, moduleName, packageDir, exampleFiles, compileSuccess, runSuccess, lintSuccess, documentationAdded, durationMs }`

**Shared Phase:** The core logic lives in `workflows/phases/examples.ts` (`runExamplesPhase`), which accepts an optional `session` parameter. When called from `write-data-type-ref` or `write-tutorial`, the existing writer session is reused — no extra agent spawn.

### 3.7. Check Website Workflow (`workflows/check-website.ts`)

**Purpose:** Verify the full documentation website builds successfully. No agent — pure shell. Read-only; suitable as a standalone CI validation step.

**Input:** `{ projectRoot: string; docsDir?: string }`

**Output:** `{ success, buildSystem, buildCwd, durationMs, errorCount, errors, output }`

Delegates to `lib/build-runner.ts` which auto-detects Docusaurus / MkDocs / Sphinx and for ZIO projects runs the full pipeline (`sbt docs/mdoc → yarn install → yarn build`).

### 3.8. Preview Website Workflow (`workflows/preview-website.ts`)

**Purpose:** Start a live documentation dev server in the background and return once ready.

**Input:** `{ projectRoot: string; docsDir?: string; runMdoc?: boolean }`

**Output:** `{ success, url, pid, buildSystem, previewCwd, mdocRan, mdocSuccess, mdocOutput }`

**Phases:**

1. _(optional)_ **mdoc** — Run `sbt docs/mdoc` from `projectRoot` (only when `runMdoc: true`); abort if it fails
2. **Preview** — Calls `runPreview(docsDir)` from `lib/build-runner.ts`: detects build system, spawns dev server detached (`proc.unref()`), polls TCP port until accepting connections, returns `{ url, pid }`

**Build system → preview command mapping:**

| Build System            | Preview Command | Default URL             |
| ----------------------- | --------------- | ----------------------- |
| Docusaurus (`website/`) | `yarn start`    | `http://localhost:3000` |
| Docusaurus (root)       | `npm run start` | `http://localhost:3000` |
| MkDocs                  | `mkdocs serve`  | `http://localhost:8000` |

The server keeps running after the workflow exits. Stop it with `kill <pid>`.

### 3.9. Fix Website Workflow (`workflows/fix-website.ts`)

**Purpose:** Build the documentation website and automatically fix errors. Mirrors `fix-mdoc` pattern. Uses `docsWriterAgent` session for fixes; loops up to `maxRounds` (default 3).

**Input:** `{ projectRoot: string; docsDir?: string; maxRounds?: number }`

**Output:** `{ success, rounds, errorCount, errors, durationMs, buildSystem, buildCwd }`

**Phases:**

1. **Initial Check** — Run `runBuild(docsDir)`; return early if already passing
2. **Fix Loop** (up to `maxRounds`) — Prompt writer agent with error list → agent reads/fixes files → rebuild → re-check errors

### 3.10. Extract Metadata Workflow (`workflows/extract-metadata.ts`)

**Purpose:** Extract or generate metadata (title, description, keywords) for documentation pages.

**Modes:**

| Mode      | Use Case                                        |
| --------- | ----------------------------------------------- |
| `all`     | Extract metadata for all pages (pre-enrichment) |
| `missing` | Extract only for pages without metadata         |
| `file`    | Extract for single specific file                |
| `dir`     | Extract for all pages in directory recursively  |

**Output:** Page frontmatter updated with:

```yaml
---
title: 'Page Title'
description: 'Natural language summary'
keywords: ['keyword1', 'keyword2']
---
```

### 3.11. Fix Writing Style Workflow (`workflows/fix-writing-style.ts`)

**Purpose:** Validate and fix documentation for style compliance.

**Phases:**

1. **Style Phase** — Two-layer validation: mechanical rules-based checker + LLM judgment checker; fixer loop (max 3 rounds)
2. **Build Verification Phase** — Run docs build; `docsDir` inferred by walking up from `filePath` to the nearest `docs/` ancestor; skip gracefully if no build system detected

**Input:**

```json
{
  "filePath": "/path/to/docs/reference/fiber.md"
}
```

**Output:** Updated .md file with style improvements + build verification result.

### 3.12. Check mdoc Workflow (`workflows/check-mdoc.ts`)

**Purpose:** Compile and validate mdoc code blocks in documentation files. No agent — pure `execSync`. Read-only checker; suitable as a standalone CI validation step.

**Input:**

```json
{
  "projectRoot": "/path/to/project",
  "paths": ["docs/reference/fiber.md", "docs/reference/concurrency/"]
}
```

- `paths` — optional string or string array of relative file paths or directories. Directories are walked recursively; only `.md`/`.mdx` files collected. Omit to build entire docs project (`sbt docs/mdoc`).

**Output:**

```json
{
  "success": true,
  "command": "sbt \"docs/mdoc --in docs/reference/fiber.md --out website/docs/reference/fiber.md\"",
  "errorCount": 0,
  "errors": [],
  "durationMs": 4321,
  "resolvedPaths": ["docs/reference/fiber.md"]
}
```

Each error entry: `{ file, line, message, raw }`.

**Error handling:**

- Missing paths → throws with list of unresolved entries
- Build failure → returns `success: false` with parsed errors (does not throw)

### 3.13. Organize Types Workflow (`workflows/organize-types.ts`)

**Purpose:** Organize related data types into logical sidebar categories in `sidebars.js` — creating `index.md` files per category and updating sidebar entries. Supports two modes: manual (specify types and category) or automatic (scan all types and propose groupings by confidence).

**Modes:**

| Mode   | Input                            | Behavior                                                                        |
| ------ | -------------------------------- | ------------------------------------------------------------------------------- |
| Manual | `{ types, category }`            | Validate types exist, create index.md, update sidebars.js                       |
| Auto   | `{ auto: true, minConfidence? }` | Scan docs/reference/, propose groupings, apply at or above confidence threshold |

**Phases:**

1. **Prepare Phase** — Manual: validate each type has a .md file in docs/reference/, read sidebars.js structure. Auto: scan all docs/reference/ .md files, extract titles/descriptions/cross-references, report relationship map
2. **Organize Phase** — Manual: create `docs/reference/<category-kebab>/index.md` with introduction + type list, update sidebars.js with category entry in alphabetical order. Auto: propose groupings with confidence levels, apply HIGH/MEDIUM/LOW based on `minConfidence`, create index.md per approved category, update sidebars.js, report skipped proposals
3. **Verify Phase** — Run `node -e "require('./sidebars.js')"` to validate JavaScript syntax; if it fails, fix the specific issue and re-verify (max 3 attempts)
4. **Build Verification Phase** — Run docs build; on failure, spawns writer agent to fix broken links/missing sidebar entries and retries up to 3 rounds; skip gracefully if no build system detected

Any phase can be skipped via `skipPhases: string[]`.

**Input:**

```json
{
  "projectRoot": "/path/to/project",
  "types": ["chunk", "list", "vector"],
  "category": "Collections"
}
```

```json
{
  "projectRoot": "/path/to/project",
  "auto": true,
  "minConfidence": "high"
}
```

**Key design:** The skill's interactive "User Confirmation" step (auto mode) is replaced by the `minConfidence` threshold — the agent applies all proposals that meet or exceed the threshold and reports skipped ones. This makes the workflow fully autonomous while remaining controllable.

**Output:** Updated `sidebars.js` + new `docs/reference/<category>/index.md` file(s) per approved category.

### 3.14. Report Method Coverage Workflow (`workflows/report-method-coverage.ts`)

**Purpose:** Cross-check the public members of a Scala data type against a reference documentation page and report any members that are not documented. No LLM session — purely deterministic; runs two shell scripts and returns structured JSON.

**Steps:**

1. _(optional)_ **Member Extraction** — when `sourceFile` is provided, runs `scala-cli` on `extract-members.scala` with `--json` to get companion / publicApi / inherited member lists; writes them to a temp file in the sectioned format expected by the coverage script; skipped when `membersFile` is provided directly
2. **Coverage Check** — runs `bash check-method-coverage.sh --json <typeName> <docFile> <membersFile>`, parses stdout as JSON

**Input:**

```json
{
  "typeName": "Chunk",
  "docFile": "/path/to/docs/reference/chunk.md",
  "sourceFile": "/path/to/zio/Chunk.scala"
}
```

```json
{
  "typeName": "Chunk",
  "docFile": "/path/to/docs/reference/chunk.md",
  "membersFile": "/tmp/chunk-members.txt"
}
```

- Exactly one of `sourceFile` (triggers extraction) or `membersFile` (skips extraction) must be provided.

**Output:**

```json
{
  "typeName": "Chunk",
  "docFile": "/path/to/docs/reference/chunk.md",
  "fullCoverage": false,
  "categories": {
    "companion": { "total": 5, "documented": 4, "missing": ["from"] },
    "publicApi": { "total": 12, "documented": 12, "missing": [] }
  },
  "memberExtraction": {
    "success": true,
    "sourceFile": "/path/to/zio/Chunk.scala",
    "companion": ["apply", "empty", "from", "single", "succeed"],
    "publicApi": [
      "append",
      "drop",
      "filter",
      "flatMap",
      "fold",
      "get",
      "head",
      "isEmpty",
      "map",
      "size",
      "tail",
      "toList"
    ],
    "inherited": []
  },
  "durationMs": 3210
}
```

**Script paths** (resolved via `import.meta.url` at runtime):

- `plugins/documentation/skills/docs-data-type-list-members/extract-members.scala`
- `plugins/documentation/skills/docs-report-method-coverage/check-method-coverage.sh`

**Exit code handling:**

| Script exit code | Meaning                            | Workflow action               |
| ---------------- | ---------------------------------- | ----------------------------- |
| 0                | Full coverage / extraction success | Returns result                |
| 1                | Missing members / no members found | Returns result (not an error) |
| 2                | Invocation error                   | Throws                        |
| null             | Process failed to start            | Throws                        |

### 3.15. Fix mdoc Workflow (`workflows/fix-mdoc.ts`)

**Purpose:** Compile mdoc code blocks, and if errors are found, automatically fix them using the docs-writer agent. Loops up to `maxRounds` (default 3).

**Input:**

```json
{
  "projectRoot": "/path/to/project",
  "paths": ["docs/reference/fiber.md", "docs/reference/concurrency/"],
  "maxRounds": 3
}
```

- Same as `check-mdoc`: accepts file(s), directory(ies), or entire project
- `maxRounds` — maximum fix attempts (default: 3)

**Phases:**

**Phase 1: Initial Check**

- Run mdoc compile command
- If success: return immediately
- If errors: proceed to fix loop

**Phase 2+: Fix loop (up to maxRounds)**

- Spawn `docsWriterAgent` session once, reuse across rounds
- Each round: send fixer prompt with exact error list (file:line:message)
- Agent has `createRunMdoc` tool available for inline verification
- After agent responds: re-run mechanical check
- If zero errors: break early
- Otherwise: next round

**Output:**

```json
{
  "success": true,
  "rounds": 2,
  "errorCount": 0,
  "errors": [],
  "durationMs": 8765,
  "resolvedPaths": ["docs/reference/fiber.md"]
}
```

## 4. Core Components

### 4.1. State Store (`lib/state-store.ts`)

**Responsibilities:**

- Load/save index and suggestions from/to disk
- Migrate old state formats for backwards compatibility
- Atomic writes with error recovery
- Lazy initialization (empty state if not found)

**State Structure:**

```typescript
type CrossrefState = {
  indexBuiltAt: string; // ISO timestamp
  docsDir: string; // Documentation directory path
  index: PageIndexEntry[]; // All discovered pages
  processed: string[]; // IDs of processed pages
  suggestions: LinkSuggestion[]; // All suggestions (accumulated)
  tokens: {
    inputTotal: number;
    outputTotal: number;
    runningCost: number;
  };
};

type PageIndexEntry = {
  id: string; // Unique ID (slug from path)
  title: string;
  path: string; // Relative path from docs
  absPath: string; // Absolute filesystem path
  description?: string; // From frontmatter or extracted
  keywords?: string[]; // From frontmatter or extracted
  contextualTitle?: string; // Alternative title
  sectionType?: string; // "reference" | "guide" | "tutorial" | "overview" | "other"
  existingLinkCount: number;
  adjacentPages?: string[]; // Page IDs in same directory
};

type LinkSuggestion = {
  sourceId: string; // Page being analyzed
  targetId: string; // Target page (from index)
  targetTitle: string;
  targetRelativePath: string; // Computed (never from LLM)
  anchorText: string; // 1-5 word phrase to link
  description?: string; // Why it's related
  type: 'inline' | 'see_also';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  status: 'pending' | 'applied' | 'skipped';
};
```

### 4.2. Markdown Parser (`lib/markdown-parser.ts`)

**Capabilities:**

- Extract YAML frontmatter (preserve untouched)
- Parse headings and build outline
- Identify safe zones: code fences (` ``` `, `~~~`), inline code
- Find existing internal links
- Safe phrase matching with word boundary validation

**Safety Guarantees:**

- Links inserted only in prose (not headings, code, frontmatter)
- Code blocks fully protected
- Inline code protected
- Complete word matching (not substring)

### 4.3. Link Insertion & Validation

**Link Inserter** (`workflows/utils/link-inserter.ts`):

- Insert inline links: `[Text](./path.md)` in prose
- Insert See Also sections at end of page
- Fallback: find partial matches if exact not found

**Link Validator** (`workflows/utils/link-validator.ts`):

- Path safety: symlink resolution, boundary checks
- Duplicate detection: anchor not already linked
- Anchor validation: heading exists in target
- TOCTOU-safe: read then act (not check then act)

### 4.4. Configuration (`lib/config-loader.ts`)

**File:** `.crossref-config.json` (in parent of docs)

**Options:**

```json
{
  "excludePatterns": ["node_modules", ".github"],
  "maxLinksPerPage": 10,
  "maxSeeAlsoSuggestion": 5,
  "confidenceThreshold": "high",
  "clearSuggestionsBeforeRun": false
}
```

### 4.5. Build Verification & Auto-Fixing

**Verify Phase** (`workflows/phases/verify.ts`):

- Auto-detect build system: Docusaurus, MkDocs, Sphinx, Hugo
- Run build command
- Parse output for success/failure

**Auto-Fixer** (`lib/auto-fixer.ts`):

- Extract structured errors from build output
- Analyze errors holistically
- Dispatch `coding-agent` to fix files
- Re-verify and retry

**Fixable Issues:**

- Broken links (missing extensions, wrong paths, bad anchors)
- Syntax errors (unclosed code fences, YAML issues)
- Missing files (remove broken references)
- Configuration problems (docusaurus.config.js, etc.)

## 5. Agent Catalog

### 5.1. Page Linker Agent (`agents/page-linker.ts`)

**Model:** Claude Haiku 4.5  
**Skill:** `skills/cross-linker/SKILL.md`

**Capabilities:**

- Analyzes page content for cross-linking opportunities
- Searches documentation index
- Validates anchor existence
- Returns structured suggestions (confidence levels)

**Tool Availability:**

- `search_pages` — Find pages by query
- `search_page_content` — Search page prose for terms
- `validate_anchor` — Check if heading exists
- `extract_page_structure` — Get full TOC
- `get_adjacent_pages` — Find related pages

### 5.2. Docs Writer Agent (`agents/docs-writer.ts`)

**Model:** Claude Haiku 4.5  
**Skills:**

- `skills/docs-data-type-ref/SKILL.md` — API reference structure
- `skills/docs-module-ref/SKILL.md` — Module reference structure (multi-type)
- `skills/docs-tutorial/SKILL.md` — Tutorial structure and tone
- `skills/docs-writing-style/SKILL.md` — Prose style rules
- `skills/docs-mdoc-conventions/SKILL.md` — mdoc modifier reference

**Capabilities:**

- Generates API reference documentation from code
- Creates learning-oriented tutorials for newcomers
- Structures documentation by type signature, methods, examples
- Applies line-by-line code annotations
- Creates See Also links
- Applies inline examples
- Validates mdoc modifier usage

### 5.3. Docs Researcher Agent (`agents/docs-researcher.ts`)

**Model:** Claude Haiku 4.5  
**Skill:** `skills/docs-research/SKILL.md`

**Capabilities:**

- Gathers information from source code
- Extracts type signatures and method names
- Identifies usage patterns
- Compiles usage examples

### 5.4. Metadata Extractor Agent (`agents/metadata-extractor.ts`)

**Model:** Claude Haiku 4.5  
**Skill:** `skills/metadata-extractor/SKILL.md`

**Capabilities:**

- Extracts or generates metadata from page content
- Infers title from frontmatter or heading
- Generates natural language description
- Identifies relevant keywords

### 5.5. Style Checker Agent (`agents/docs-style-checker.ts`)

**Model:** Claude Haiku 4.5  
**Skill:** `skills/docs-writing-style-judgment/SKILL.md`

**Capabilities:**

- Validates prose clarity and tone
- Checks terminology consistency
- Identifies style issues requiring judgment
- Proposes targeted improvements

### 5.6. Docs Reviewer Agent (`agents/docs-reviewer.ts`)

**Capabilities:**

- Reviews documentation completeness
- Validates examples compile and work
- Checks internal consistency
- Identifies missing documentation

### 5.7. Coding Agent (`agents/coding-agent.ts`)

**Model:** Claude Haiku 4.5

**Capabilities:**

- General-purpose software engineering tasks
- Modifies files to fix errors
- Handles cross-project dependencies
- Used for auto-fixing build failures

## 6. Skill Architecture

Skills are stored as markdown files (`SKILL.md`) in `skills/*/` directories. Each skill:

1. **Defines trigger conditions** — When agents should use this skill
2. **Teaches methodology** — How to approach the task
3. **Provides examples** — Concrete examples of correct output
4. **References code** — Links to real examples in the codebase

**Skill List:**

- **cross-linker** — Identify cross-linking opportunities, select anchor text, determine confidence
- **docs-data-type-ref** — Structure API documentation, organize methods, create examples
- **docs-module-ref** — Structure module reference docs; flat vs hierarchical decision rule; module-level narrative + per-type coverage
- **docs-tutorial** — Structure learning-oriented guides, 7-section template, warm tone, linear progression
- **docs-research** — Gather code information, extract signatures, find usage (supports: data-type-ref, tutorial, guide, explanation, module-ref)
- **docs-writing-style** — Prose style rules, clarity, tone, terminology, code block conventions
- **docs-mdoc-conventions** — mdoc modifier reference, decision tree, Scala 2/3 tabs, admonitions
- **metadata-extractor** — Extract title, description, keywords from content

## 7. Data Stores

### 7.1. Documentation Index (`.crossref-state/index.json`)

**Type:** JSON array of `PageIndexEntry` objects

**Purpose:**

- Fast search by title, keywords, topic
- Enable adjacency queries
- Track metadata (sectionType, existingLinkCount)
- Support report generation (coverage, orphans)

### 7.2. Page Frontmatter

**Location:** YAML header in each `.md` file

**Fields:**

```yaml
---
title: 'Page Title'
description: '1-3 sentence summary'
keywords: ['keyword1', 'keyword2']
---
```

**Usage:**

- Populated by `extract-metadata` workflow
- Used by `page-linker` to find relevant pages
- Improves link quality

### 7.3. Link Suggestions (`.crossref-state/suggestions.json`)

**Type:** JSON array of `LinkSuggestion` objects

**Purpose:**

- Accumulate all suggestions across runs
- Enable manual review of pending suggestions
- Track applied/skipped/pending status
- Support analytics and coverage reporting

## 8. Development & Testing

### 8.1. Local Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Create .env with API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Run tests
npm test

# Watch mode
npm test:watch
```

### 8.2. Testing Framework

**Vitest** — Test runner with snapshot support

**Test Coverage:**

- 19 tests for markdown parsing
- 11 tests for link insertion
- 4 tests for validation
- 9 end-to-end smoke tests

## 9. Configuration & Deployment

### 9.1. Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...  # Required for all workflows
```

### 9.2. Configuration File

`.crossref-config.json` (optional, in parent of docs):

```json
{
  "excludePatterns": ["node_modules"],
  "maxLinksPerPage": 10,
  "confidenceThreshold": "high"
}
```

### 9.3. Deployment

**Typical Usage:**

```bash
# Build index
flue run crossref --target node \
  --input '{"docsDir":"./docs","mode":"reindex"}'

# Process incrementally
flue run crossref --target node \
  --input '{"docsDir":"./docs","mode":"autopilot"}'

# Generate reference docs
flue run write-data-type-ref --target node \
  --input '{"projectRoot":".","outputPath":"docs/ref.md"}'
```

## 10. Security Considerations

- **Path Traversal:** All paths resolved with `realpathSync`, checked against docs boundary
- **Symlinks:** Followed to real target, then validated within boundary
- **TOCTOU:** Filesystem operations use try-catch (not existence checks)
- **LLM Safety:** Paths/URLs never directly from LLM (computed deterministically)
- **Error Recovery:** Unreadable files skipped with warnings; state only updated if complete

## 11. Limitations & Future Work

### Current Limitations

- State stored locally (no multi-instance coordination)
- Suggestions from LLM cannot be directly overridden
- No conflict detection for overlapping link text

### Future Enhancements

- Incremental reindex (update only changed files)
- Manual suggestion override interface
- Real-time analytics dashboard
- Integration with documentation platforms
- Collaborative review workflows
