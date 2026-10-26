# ZIO Skills — Teach Your Agent to Build ZIO Applications

Teaching coding agents (Claude Code, Cursor, Codex, Gemini, OpenCode) how to build and document ZIO applications.

This marketplace currently ships two plugins:

- **`zio-skills`** — Build ZIO and ZIO HTTP applications (server scaffolding, OpenAPI code generation, endpoint API, …).
- **`documentation`** — Write high-quality documentation for ZIO libraries (reference pages, how-to guides, tutorials, mdoc conventions, writing-style enforcement).

## Installation

### Claude Code

First, add the marketplace, then install one or both plugins:

```bash
claude plugin marketplace add zio/zio-skills

# build apps with ZIO / ZIO HTTP
claude plugin install zio-skills@ziogenetics

# write documentation for ZIO libraries
claude plugin install documentation@ziogenetics
```

Then invoke a skill in Claude Code:
```
/zio-http-scaffold
/zio-http-openapi-to-endpoint
/zio-http-endpoint-to-openapi
/zio-http-imperative-to-declarative
/docs-data-type-ref
/docs-how-to-guide
/docs-tutorial
/docs-writing-style-judgment
/docs-writing-style-mechanical
```

### Cursor

```bash
/add-plugin zio-skills
```

### Gemini CLI

```bash
gemini extensions install https://github.com/zio/zio-skills
```

To update:

```bash
gemini extensions update zio-skills
```

### Codex

Clone the repo and symlink:

```bash
git clone https://github.com/zio/zio-skills.git ~/.agents/skills/zio-skills
```

or user Skill Installer inside codex cli:

```bash
$skill-installer zio/zio-skills
```

### OpenCode

Add to `opencode.json`:
```json
{
  "plugin": ["zio-skills@git://github.com/zio/zio-skills.git"]
}
```

## Tools

### Crossref Agent

**Crossref Agent** is a Flue-based TypeScript tool that automatically discovers and creates cross-references between pages in Markdown documentation. It helps improve documentation quality, SEO, and user navigation by intelligently identifying related pages and generating link suggestions with confidence-based filtering.

#### Key Features

- **Automated Link Discovery** — Scans documentation to find pages that should be cross-referenced
- **Intelligent Suggestions** — Uses Claude LLM to generate contextually relevant link suggestions with confidence scoring
- **Security Hardening** — Built-in validation for path safety, symlink handling, and LLM output verification
- **Flexible Execution** — Four modes: dry-run analysis, suggestions, application, and full pipeline with reporting
- **State Management** — Persistent tracking of index state and applied suggestions for incremental updates

#### Quick Start

```bash
# Install dependencies
npm install

# Run in dry-run mode (analyze without making changes)
npm run crossref -- --mode=dry-run

# Generate suggestions for new cross-references
npm run crossref -- --mode=suggest

# Apply all suggestions to documentation
npm run crossref -- --mode=apply

# Run complete pipeline with analytics report
npm run crossref -- --mode=full
```

#### Technologies

- **Framework**: Flue (agent orchestration)
- **Language**: TypeScript with Valibot schema validation
- **AI Model**: Claude Haiku 4.5 for suggestions and enrichment
- **Testing**: Vitest with 43+ test cases
- **State Storage**: JSON-based index and suggestion tracking

That module was `writer-assistant/`, removed in this repository once its capabilities had been ported into `flowrite/`. What was ported, what was dropped and why is recorded in [flowrite/WRITER-ASSISTANT-MIGRATION.md](flowrite/WRITER-ASSISTANT-MIGRATION.md), which also carries the commands to recover any file from git history.

## Skills

### ZIO HTTP (`zio-skills` plugin)

- **`zio-http-scaffold`** — Scaffold a minimal ZIO HTTP server and client
- **`zio-http-openapi-to-endpoint`** — Generate Endpoint declarations from an OpenAPI spec
- **`zio-http-endpoint-to-openapi`** — Generate OpenAPI documentation from Endpoint declarations + serve Swagger UI
- **`zio-http-imperative-to-declarative`** — Convert imperative routes to typed Endpoint API

### Documentation (`documentation` plugin)

Authoring skills:
- **`docs-data-type-ref`** — Write a reference page for a single data type
- **`docs-module-ref`** — Write a reference page for a module (multiple related types)
- **`docs-how-to-guide`** — Write a goal-oriented how-to guide
- **`docs-tutorial`** — Write a learning-oriented tutorial for newcomers
- **`docs-document-pr`** — Generate documentation from a GitHub PR
- **`docs-add-missing-section`** — Add a missing section to an existing reference page
- **`docs-enrich-section`** — Add motivation and use-cases to a thin section

Authoring helpers:
- **`docs-examples`** — Shared procedure for creating runnable companion examples
- **`docs-research`** — Shared research procedure (find source, tests, examples, history)
- **`docs-integrate`** — Wire a new doc page into Docusaurus navigation
- **`docs-organize-types`** — Group types into logical sidebar categories

Quality checks:
- **`docs-writing-style-judgment`** — Judgment-based prose rules requiring language understanding (Rules J-1 to J-9)
- **`docs-writing-style-mechanical`** — Mechanical prose rules checkable via regex (Rules M-1 to M-17) with `check-docs-style.sh` script
- **`docs-mdoc-conventions`** — mdoc code-block modifiers and Docusaurus admonitions
- **`docs-check-compliance`** — Audit a doc file against a rule skill
- **`docs-verify-compliance`** — Fix compliance issues in a doc file
- **`docs-critique`** — Review and fix an existing documentation file using a maker-critic loop
- **`docs-find-documentation-gaps`** — Scan project for undocumented types/modules
- **`docs-report-method-coverage`** — Check that all public members are documented
- **`docs-data-type-list-members`** — Extract public members from a Scala type
- **`docs-skill-retrospection`** — Improve a docs-* skill from execution feedback

### Writing Style Rules Split

The `docs-writing-style` skill has been split into two focused skills to separate concerns and reduce token overhead:

**Judgment-Based Rules (docs-writing-style-judgment)**
- J-1: Person pronouns ("we" vs "you")
- J-2: No manual line breaks in prose
- J-3: Qualified method names (semantic cases)
- J-4: Type name alone rule
- J-5: No bare subheaders (quality check)
- J-6: When to use ####
- J-7: One concept per code block
- J-8: Method signatures within containing type
- J-9: Contextualized descriptions for code blocks

**Mechanical Rules (docs-writing-style-mechanical)**
- M-1 to M-17: Rules checkable via regex/bash (present tense, filler phrases, bullet capitalization, link formats, heading hierarchy, code block structure, table alignment, Scala syntax, implicit trace convention, etc.)

Usage:
- **LLM checker agent** imports only judgment skill (smaller, focused)
- **Writer agent** imports both judgment and mechanical skills
- **Mechanical checker script** runs independently via `check-docs-style.sh`
- Violations reported as `[J-Rule N]` (judgment) and `[M-Rule N]` (mechanical) to avoid ambiguity

## Planned Skills

- Typed path & query parameters
- Custom middleware with context injection
- Type-safe HTTP client with EndpointExecutor
- Server-Sent Events (SSE) streaming
- WebSocket handlers
- Datastar reactive UI integration
- HTML templates with template2 DSL
- Multipart form uploads
- Testing with zio-http-testkit
- Metrics & Prometheus integration
- ZIO Streams patterns
- ZIO Config patterns
- And more…

## Contributing

Skills are curated learning resources. See [CLAUDE.md](CLAUDE.md) for contribution guidelines.

## License

[License](LICENSE)

## Releasing

1. Actions → **Release - prepare** → Run workflow, enter `X.Y.Z`. It bumps every version file (`scripts/bump-version.sh`) and opens a `release-X.Y.Z` PR.
2. Review and merge the PR. **Release - publish** then creates draft releases `vX.Y.Z` (plugins) and `flowrite-vX.Y.Z` with auto-generated notes.
3. Edit the draft notes if you want, then publish. Publishing creates the tag.
