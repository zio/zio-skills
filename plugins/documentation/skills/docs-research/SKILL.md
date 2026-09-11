---
name: docs-research
description: Shared research procedure for documentation agents and skills — find source, tests, examples, patterns, and GitHub history when researching a ZIO topic. Mounted by the docs-researcher agent and loaded directly by the docs-add-missing-section skill.
allowed-tools: Read, Glob, Grep, Bash(gh:*)
---
# Source Code Research for Documentation

Use this procedure when researching a topic to understand the complete landscape of types, methods, patterns, and integrations before writing documentation.

## Core Mission

Provide documentation authors with comprehensive understanding of:
- Complete public API surface (all methods, signatures, variants)
- Real-world usage patterns and composition examples
- Design decisions and architectural relationships
- Dependencies, integrations, and supported use cases
- Gaps, edge cases, and performance characteristics

## Agent Workflow

**Phase 1 — Plan**

Create one task per research step: (1a) Read core source files, (1b) Read test files, (1c) Find supporting types, (1d) Search for real-world patterns, (2) Research GitHub history.

**Phase 2 — Execute Research (Steps 1a–2)**

Execute research steps in order. For each step, mark its task `in_progress` when starting, then `completed` when done. Work systematically through all five steps.

**Phase 3 — Synthesize Findings**

Build internal research notes (core types, public API, usage patterns, dependencies, gaps). Do not emit a formal report—these notes prepare the parent skill's author for writing.

## Analysis Approach

### 1. Discovery Phase

**Locate core source files:**
- Use Glob and Grep to find source files for the topic:
  ```
  Glob: **/src/main/scala*/**/<TypeName>.scala
  Grep: "class <TypeName>" or "trait <TypeName>" or "object <TypeName>"
  ```
- For modules: identify all core types and their source file locations

**Identify scope and boundaries:**
- Read the full source file(s) — understand every public method, type parameter, companion object, and factory method
- Map what is public API vs. internal implementation
- Note accessibility modifiers, deprecated methods, and alternative names

### 2. Code Flow & Usage Tracing

**Understand how the API is used:**
1. **Search test suites** (`*/src/test/scala/`) for idiomatic usage patterns
   - Look for construction patterns (how objects are created)
   - Trace method call sequences and data transformations
   - Identify edge cases and boundary conditions (empty values, single elements, large inputs)
   - Document error conditions and exception handling

2. **Find real-world examples**
   - Glob `**/examples/**/*.scala` for companion examples
   - Search integration tests combining multiple types
   - Look for cross-module usages via Grep to reveal composition patterns

3. **Trace type dependencies**
   - Grep imports in test files to reveal the full dependency graph
   - For each public method returning a complex type, trace that type's documentation
   - Identify implicit instances and type class derivation patterns

### 3. Architecture & Design Analysis

**Map abstraction layers and patterns:**
- Identify layers: constructors → transformations → queries → finalization
- Document common patterns: builders, factories, functional chains, state management
- Note which operations are composable vs. terminal
- Understand type relationships: inheritance, composition, sealed traits vs. open hierarchies

**Design rationale:**
- Search GitHub history for design decisions, API evolution, known tradeoffs
- Identify any documented anti-patterns or common misconceptions

### 4. Documentation Landscape

**Understand existing coverage:**
- Check `docs/reference/` and `docs/` for existing documentation
- Identify what is already documented vs. gaps to address
- Note examples or patterns already documented elsewhere

**Identify documentation gaps:**
- Methods lacking test coverage
- Performance characteristics not captured
- Edge cases not exercised in tests
- Composition examples not yet documented

## Research Workflow

### Step 1a: Read Core Source Files

For each core type, read the full source file to understand:
- All public methods and their signatures
- Type parameters, variance, constraints
- Companion object and factory methods
- Javadoc/scaladoc comments (design intent)

### Step 1b: Read Test Files

Search and read test suites to understand:
- Construction patterns and common usages
- Method chaining and composition examples
- Edge cases: empty inputs, single elements, large data
- Error handling and exception cases
- Integration with other types

### Step 1c: Find Supporting Types

Identify every type that core methods depend on:
1. Grep imports in test files for the full dependency graph
2. For each supporting type, read enough source and documentation to explain it in context
3. Trace return types through multiple layers if needed

### Step 1d: Search for Real-World Patterns

1. **Examples directory**: `Glob` for `**/examples/**/*.scala`
2. **Integration tests**: Look for tests combining multiple types from this module
3. **Cross-module usage**: `Grep` across other modules to find how core types integrate
4. **Documentation patterns**: Check if similar types have documented examples you can mirror

### Step 2: GitHub History Research

**Commits first, always** — read the commit history of every source file you read in Steps 1a-1b. This
is a research source in its own right, not a footnote: source states what the subject IS today, tests
state how it composes, and history is the only place that states everything else — a squash-merge
message routinely carries pages of design rationale. One path per call (`--follow` only takes one), and
always bound the output with both `-n` and `head -c` — an unbounded `git log` can exceed the shell
tool's own output cap, and that cap cuts the END of the output, which for `git log` means losing the
newest commits and keeping the oldest:

```bash
git log --follow -n 5 --date=short --format='%h %ad %an%n%s%n%b%n---' -- <path> | head -c 6000
```

**Follow the thread from the commit, not from a keyword search.** A squash-merge subject ends in
`(#N)` — that is the PR. Read it, then any issue it closes:

```bash
gh pr view <N> --json title,body,state,closingIssuesReferences,comments | head -c 6000
gh issue view <N> --json title,body,state,comments | head -c 6000
```

This is sharper than a broad search: it reads exactly the PR that produced the code you're
researching, not whatever a keyword happens to match. Fall back to a broad search only when a repo
lands PRs as merge commits, so `--follow` has simplified away the `(#N)` and file history carries no PR
reference at all:

```bash
gh search commits --repo <owner>/<repo> "<topic>" --limit 30
gh search issues  --repo <owner>/<repo> "<topic>" --limit 30
gh search prs     --repo <owner>/<repo> "<topic>" --limit 30
```

For high-value issues, read full discussion: `gh issue view <n> --comments`
For high-value PRs, read full review discussion: `gh pr view <n> --comments`
For high-value commits, review the commit message and changed files: `gh api repos/<owner>/<repo>/commits/<sha>`

**What counts as a finding.** Test: could a documentation author learn this from source or tests
alone? If not, it is a finding — design reasons are one kind among several:

| Finding | Also belongs in |
|---|---|
| Why it is shaped this way for the people who use it; what was rejected | Motivation |
| A rename or removal (e.g. `.unsafeRunSync` → `.block`) | grounding detail, for a migration note |
| Rejected usages, platform behaviour ("throws on JS") | that member's caveats |
| A Scala 2 vs 3 divergence | the Scala version notes |
| A version-conditional dependency | the sbt dependency |
| A claimed property or support matrix | key properties |
| Types the module gained, lost, or extracted | the core/supporting split |
| Which test proves which behaviour | read that test and cite it |

- ✅ findings about the subject ❌ CI, dependency bumps, release chores, formatting — a commit touching
  the file is not, by itself, a finding
- ✅ a reason that changes what a reader writes ❌ a reason aimed at maintainers — fixtures, test
  coverage, tooling, the docs pipeline itself
- ✅ record that a member was renamed ❌ document the old name (source is the authority for what exists
  today, not history)
- ✅ "history says nothing about this subject" ❌ an invented finding, indistinguishable downstream from
  a real one

## Internal Research Notes for Documentation Agents

As you complete your research, build and maintain these internal notes (not a deliverable report, but a foundation for writing):

- **Core types** with fully qualified names and source file paths (with line numbers)
- **Public API** organized by category (constructors, transformations, queries, etc.)
- **Usage patterns** from tests: construction, composition, error handling
- **Dependencies**: which types use which other types, and why
- **Real-world examples**: concrete composition patterns from tests/examples
- **Documentation gaps**: methods with no test coverage, undocumented behavior
- **Architecture insights**: design patterns, abstraction layers, design decisions
- **Critical files** (5-10 most important files) prioritized by relevance

**Purpose:** These notes prepare you to write clear, accurate documentation. You do not need to emit them as a formal report—use them to guide your writing in the parent skill.

For a topic likely to be researched again in this session (a type covered by more than one doc, or a
run that might retry), write the notes to a scratch file (e.g. `.claude-research/<type-kebab>.md`)
instead of holding them only in context — check for that file first and reuse it if it already covers
the subject, rather than repeating the same Glob/Grep/`gh` calls.

## Grounding Rules

These apply to every fact in your notes, not only what history states.

**Copy signatures verbatim.** A constructor signature is the real declaration from source
(`final case class T(...)`, `class T(...)`, or an actual companion factory method) — never a
synthesized `def apply`. A method signature is copied from the `def` itself — the complete parameter
list, type parameters, implicit/using params, varargs, and return type — including macro-generated defs
in `*Macros.scala` / `*VersionSpecific.scala` files. Derive a signature from the declaration, never from
a call site, scaladoc, or how a macro expands. When a method comes in a family — overloads, or one
variant per level/severity/type (e.g. `<level>Every` / `<level>AtMost` across every severity) —
enumerate the COMPLETE family from source, not a representative sample.

**Note the audience tier.** For each type and key method, judge whether it's an end-user API or a
low-level building block that a higher-level API wraps — from visibility (`private[...]` is internal),
scaladoc, and whether tests or other code call it directly or reach it through something higher-level.
For a building block, record why it's advanced and the high-level alternative to prefer (e.g.
`SpanBuilder` is the manual path a caller rarely needs — prefer `Tracer#span`). This feeds
writing-style rule 26 (frame low-level APIs by audience tier).

**Cite every fact.** `path:L<start>-L<end>` (e.g. `src/main/scala/optics/Lens.scala:L12-L20`) — the
repo-relative location you actually read it from. Never invent a path or a line; cite only a file you
opened. A citation nobody can follow is worse than none, because the author will trust it.

**Say plainly when you couldn't find something.** A gap the author knows about is recoverable; a gap
filled with a plausible invention is not, and is indistinguishable downstream from a real fact.

---

## Design Rule

This sub-skill targets comprehensive research for documentation. Focus on understanding what documentation authors need to write well. The research itself is scaffolding; the parent skill (data-type-ref, module-ref, how-to-guide, tutorial) owns the final documentation output.
