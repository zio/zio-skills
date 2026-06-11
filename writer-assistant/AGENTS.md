---
providers:
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}
---

# Agent Configuration

Configure the Anthropic provider using the `ANTHROPIC_API_KEY` environment variable from `.env`.

## Running the Crossref Workflow

### On a Specific File

To run the writer-assistant on a single documentation file, use:

```bash
npx flue run crossref --target node \
  --payload '{"docsDir":"/path/to/docs","mode":"step","targetFile":"relative/path/to/file.md"}'
```

**Parameters:**
- `docsDir`: Absolute path to the docs directory
- `mode`: "step" for incremental processing
- `targetFile`: Relative path from docsDir to the target file (e.g., "reference/service-pattern/reloadable-services.md")

### On a Directory

To process all files in a directory recursively:

```bash
npx flue run crossref --target node \
  --payload '{"docsDir":"/path/to/docs","mode":"step","targetDir":"relative/path/","batchSize":5}'
```

### Build Fresh Index

To rebuild the documentation index before processing:

```bash
npx flue run crossref --target node \
  --payload '{"docsDir":"/path/to/docs","mode":"reindex"}'
```

### Verify Documentation Builds

To validate that the documentation builds successfully after cross-reference additions:

```bash
npx flue run crossref --target node \
  --payload '{"docsDir":"/path/to/docs","mode":"verify"}'
```

**Parameters:**
- `docsDir`: Absolute path to the docs directory

The verify mode automatically detects the build system (Docusaurus, MkDocs, or Sphinx) and runs the build command. Use this after running `autopilot` mode to ensure no broken links were introduced.

### Auto-Fix Documentation Build Failures

To automatically fix build failures and re-validate:

```bash
npx flue run crossref --target node \
  --payload '{
    "docsDir":"/path/to/docs",
    "mode":"verify-and-fix",
    "maxRetries":3
  }'
```

**Parameters:**
- `docsDir`: Absolute path to the docs directory
- `mode`: "verify-and-fix" to enable auto-fixing
- `maxRetries`: Maximum number of fix attempts (default: 3, optional)

**How it works:**
1. Verifies documentation builds
2. If build fails: extracts errors (broken links, syntax errors, missing files)
3. Fixes documentation using Claude analysis
4. Re-verifies build
5. Repeats until success or max retries exceeded

**Automatic fixes include:**
- Adding missing `.md` extensions to links
- Correcting relative paths
- Closing unclosed code fences
- Removing broken file references

Use this mode to automatically resolve common documentation build issues without manual intervention.

## What the Crossref Agent Does

1. **Analyzes** documentation pages to identify cross-linking opportunities
2. **Generates suggestions** for both inline links and "See Also" sections using Claude
3. **Validates** suggestions based on confidence thresholds
4. **Applies** high-confidence links directly to files
5. **Queues** medium/low-confidence suggestions for manual review

## Output

The agent produces:
- **Inline links**: Inserted contextually where relevant terms appear
- **See Also sections**: Added at the end of pages with related topics
- **Progress tracking**: Shows processed/remaining pages and token usage
- **Validation reports**: Details on applied vs. skipped suggestions

---

## Skills System

### Two Skill Ecosystems

This project maintains skills in two locations for different purposes:

| Location | Purpose | Invocation | Use Case |
|---|---|---|---|
| `plugins/documentation/skills/` | Canonical, human-oriented skills | `/skill-name` in Claude Code | Human operators authoring docs |
| `writer-assistant/skills/` | Agent-adapted behavior specs | `import ... with { type: 'skill' }` | Flue agents at runtime |

**Key principle:** Agent skills are adapted versions of the canonical skills, trimmed of human framing and optimized for autonomous execution.

### Agent Skills

The `docs-writer` agent loads these skills:

1. **docs-research** — Comprehensive research procedure (4 phases: Discovery, Code Flow, Architecture, Documentation Landscape). Includes GitHub history search, type dependency tracing.
2. **docs-data-type-ref** — Writing standards and verification steps for data type reference pages.

Both are loaded via import assertions in `agents/docs-writer.ts` and become part of the agent's system prompt.

### Maintaining Skills

When canonical skills in `plugins/documentation/skills/` are updated:

1. Evaluate whether the change improves agent behavior
2. Apply the same conceptual change to the agent version in `writer-assistant/skills/`
3. Remove human-specific framing; adapt for autonomous execution
4. Test the updated agent workflow

See `writer-assistant/skills/README.md` for the adaptation contract and maintenance guide.

---

## Running the Docs Write Data Type Ref Workflow

Generate comprehensive reference documentation for a specific ZIO data type. The workflow orchestrates research, writing, verification, and integration in four phases.

### Basic Usage

```bash
npx flue run write-data-type-ref --target node \
  --payload '{
    "projectRoot": "/path/to/zio",
    "outputPath": "docs/reference/chunk.md",
    "dataTypePath": "core/shared/src/main/scala/zio/Chunk.scala"
  }'
```

**Parameters:**
- `projectRoot`: Absolute path to the project root (e.g., `/path/to/zio` or `/path/to/zio-http`)
- `outputPath`: Path to the documentation file relative to projectRoot (e.g., `docs/reference/chunk.md`)
  - Can also be absolute if needed
  - Type name is inferred from filename (e.g., `chunk.md` → `Chunk`)
- `dataTypePath` (optional): Path to the source file containing the type
  - Can be a full path: `core/shared/src/main/scala/zio/Chunk.scala`
  - Can be a relative path: `src/main/scala/zio/Chunk.scala`
  - Can be just a filename: `Chunk.scala`
  - Can be just a type name: `Chunk`
  - If omitted, the agent searches all discovered source directories

The source directories are automatically discovered from the project root. ZIO projects often have multiple source directories for different platforms. All are searched to find the type definition.

**Example:** `projectRoot: /path/to/zio` discovers:
- `/path/to/zio/core/shared/src` (shared code)
- `/path/to/zio/core/jvm/src` (JVM-specific)
- `/path/to/zio/core/js/src` (JS-specific)
- `/path/to/zio/core/native/src` (Native-specific)

### What the Workflow Does

**Phase 1 — Research**
- Locates the type definition and source file
- Reads tests and identifies usage patterns
- Extracts all public methods and companion object methods
- Finds integration points and related types

**Phase 2 — Write Documentation**
- Generates markdown file at `docs/reference/<type-name>.md`
- Follows ZIO documentation conventions and structure
- Creates sections: Opening Definition, Motivation, Quick Showcase, Installation, Construction, Core Operations, etc.
- Documents every public method with examples

**Phase 3 — Verify**
- Checks method coverage against source code
- Runs mdoc to verify all code examples compile
- Fixes compilation errors iteratively
- Reports final coverage and error counts

**Phase 4 — Integrate**
- Formats Scala code with `sbt scalafmtAll`
- Runs lint checks with `sbt check`
- Updates `sidebars.js` with new documentation entry
- Updates `docs/index.md` with cross-references

### Output

On success:
- Generated markdown file at `docs/reference/<kebab-case-type-name>.md`
- Updated sidebar and index files
- Fully integrated into documentation site
- All code examples verified to compile
