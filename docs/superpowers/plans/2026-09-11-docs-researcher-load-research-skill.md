# docs-researcher loads the research skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `docs-researcher` subagent (flowrite: `researcher`) a real, mounted `research` skill instead of a hand-duplicated copy of the same procedure, so the plugin's existing `docs-research` skill stops being an orphan and stops drifting from `docs-researcher.md`.

**Architecture:** Add a new flowrite "expertise" skill (`src/skills/research/SKILL.md`) whose body is the plugin's existing, richer `docs-research/SKILL.md` procedure (already tool-name-portable, no Flue-specific tokens). Mount it into the `researcher` subagent via `useSkill(...)`, exactly the way `drafter.ts` mounts `mdoc-conventions`/`ascii-diagram`/`markdown-table`. Trim `researcher.md`'s own body so it stops duplicating that procedure and instead points at the mounted skill, keeping only what is genuinely specific to this subagent (its findings-file output contract). Wire the plugin export the same way `docs-drafter` is wired (`skills:` frontmatter field in `AGENT_MANIFEST`), regenerate, and promote. Finally, hand-sync the plugin's `docs-research/SKILL.md` frontmatter (fixing its stale "used by" claim) and remove `docs-research` from flowrite's `AGENTS.md` orphan-skill exception list, since it now has a real flowrite counterpart.

**Tech Stack:** flowrite (TypeScript, `@flue/runtime`, pnpm, `node --test`), the `plugins/documentation` Claude Code plugin (plain markdown + YAML frontmatter), Node's built-in test runner, `tsc --noEmit`.

**Spec:** No separate spec document. The binding facts (verified by direct source reading, not assumption) are:
- `flowrite/AGENTS.md:7-67` — the sync discipline between flowrite and `plugins/documentation`, including the explicit standing-exception list for `docs-research`/`docs-integrate` (`AGENTS.md:43-52`) and the naming convention (`AGENTS.md:53-57`: flowrite skill `X` → plugin skill `docs-X`).
- `flowrite/scripts/generate-plugin-skill.mjs:451-469` — the current `docs-researcher` `AGENT_MANIFEST` entry (no `skills:` field).
- `flowrite/scripts/generate-plugin-skill.mjs:480-495` — the `docs-drafter` entry, the one proven working example of an agent declaring mounted skills (`skills: 'docs-mdoc-conventions, docs-ascii-diagram, docs-markdown-table'`).
- `flowrite/src/subagents/drafter.ts:1-45` — the working `useSkill(...)` mounting pattern to mirror in `researcher.ts`.
- `flowrite/src/subagents/researcher.md` and `plugins/documentation/agents/docs-researcher.md` — currently byte-identical (verified) except for the plugin's frontmatter and the `.flowrite/` → plain path substitution; this plan's Task 2 changes the shared body, so both stay in sync via Task 3's regeneration.
- `plugins/documentation/skills/docs-research/SKILL.md` — the richer, already-portable procedure this plan promotes to flowrite. Its current description's "Used by docs-how-to-guide, docs-tutorial, and docs-data-type-ref" claim is verified false (none of those three files mention `docs-research`); the real consumer is `docs-add-missing-section/SKILL.md:53-60`.

## Global Constraints

- Never hand-edit anything under `flowrite/dist/` — it is gitignored, generator output only (`flowrite/.gitignore:5`).
- Any text in a flowrite source file that leaks a Flue-only concept (`.flowrite/`, `useSkill`, `task()`, a `finish` call, or a lowercase Flue tool name where Claude Code's is capitalized) must go through a `substitutions` entry in `AGENT_MANIFEST`/`MANIFEST` when exported — never copied verbatim (`AGENTS.md:58-63`).
- Do not delete or merge `docs-research` on the assumption it is a stale fork of something in flowrite — it explicitly is not (`AGENTS.md:49-52`, prior to this plan). This plan's job is to give it a *new* flowrite counterpart, not to treat the existing plugin file as wrong.
- Do not touch `docs-integrate` or `docs-organize-types`/`docs-examples` — they are separate, intentional standing exceptions untouched by this plan.
- All new/changed prose in `src/skills/research/SKILL.md` must use Claude-Code-style tool names (`Read`, `Glob`, `Grep`, `Write` — capitalized) since it is copied verbatim into the plugin with no substitution (the current plugin body already satisfies this — verify it stays that way).
- Run `git status` before each commit; commit only the files each task actually changed.
- All commits happen on the current branch (`research-improvement`) in the current worktree (`/home/milad/sources/zio-skills-worktrees/research-improvement`) — this worktree already exists and is isolated from `main`; do not create a new worktree.

---

### Task 1: Add the flowrite `research` skill

**Files:**
- Create: `flowrite/src/skills/research/SKILL.md`

**Interfaces:**
- Consumes: nothing (new leaf file).
- Produces: a flowrite skill module importable as `import research from '../skills/research/SKILL.md'` from `flowrite/src/subagents/researcher.ts` (Task 2 consumes this).

- [ ] **Step 1: Create the skill file with this exact content**

```markdown
---
name: research
description: Shared research procedure for documentation agents and skills — find source, tests, examples, patterns, and GitHub history when researching a ZIO topic. Mounted by the researcher subagent (docs-researcher in the Claude Code plugin) and loaded directly by the docs-add-missing-section skill.
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
```

- [ ] **Step 2: Verify the file has no Flue-specific tokens**

Run: `grep -nE "\.flowrite/|useSkill|finish\(|\btask\(" flowrite/src/skills/research/SKILL.md`
Expected: no output (no matches). This confirms the content is safe to mount in flowrite AND to export verbatim to the plugin later, per the Global Constraints rule on Flue-specific leaks.

- [ ] **Step 3: Commit**

```bash
git add flowrite/src/skills/research/SKILL.md
git commit -m "flowrite: add shared research skill, promoted from plugins/documentation/skills/docs-research"
```

---

### Task 2: Mount the skill in `researcher` and trim `researcher.md`

**Files:**
- Modify: `flowrite/src/subagents/researcher.ts` (whole file, currently 28 lines — see plan header's Spec section for current content)
- Modify: `flowrite/src/subagents/researcher.md` (whole file, currently 105 lines)

**Interfaces:**
- Consumes: `research` skill module from Task 1 (`flowrite/src/skills/research/SKILL.md`).
- Produces: `Researcher()` render function whose output now equals the trimmed `researcher.md` body, with the `research` skill mounted alongside the existing `gh_query` tool. `researcher.md`'s new body is what Task 3's regeneration copies into the plugin (via the existing `docs-researcher` `AGENT_MANIFEST` entry, unchanged `instructions` path).

- [ ] **Step 1: Replace `researcher.ts` with this exact content**

```typescript
import { defineSubagent, useSkill, useTool } from '@flue/runtime';
import research from '../skills/research/SKILL.md';
import { TIERS } from '../runtime/models.ts';
import { getRepoPath } from '../runtime/run-context.ts';
import { createGhQueryTool } from '../tools/repo-tools.ts';
import instructions from './researcher.md';

/**
 * Generic deep source-research specialist, shared across document kinds. Runs
 * read-only over the library checkout in the parent's sandbox (glob/grep/read
 * via built-in shell), plus `gh_query` for GitHub history. The calling phase tool
 * supplies the kind-specific focus and result schema, so this role itself stays
 * document-kind-neutral. It does not write files.
 *
 * Mounts the shared `research` skill for the step-by-step procedure, the finding-vs-not-a-finding
 * table, and the grounding rules — the same skill the plugin's `docs-add-missing-section` loads
 * directly. `researcher.md` used to carry a hand-duplicated copy of this same procedure; that
 * duplication is why the plugin's `docs-research` skill and `docs-researcher` agent had drifted into
 * two near-identical documents. Mounting instead of duplicating keeps there being exactly one place
 * this procedure lives.
 */
export function Researcher() {
  useSkill(research);
  // getRepoPath is passed unresolved: this render runs after the writer's, but
  // the module is imported well before either.
  useTool(createGhQueryTool(getRepoPath));
  return instructions;
}

export const researcher = defineSubagent({
  name: 'researcher',
  ...TIERS.researcher,
  description:
    'Researches a ZIO topic across source, tests, examples, and GitHub history; returns structured research answers in the shape the caller requests.',
  agent: Researcher,
});
```

- [ ] **Step 2: Replace `researcher.md` with this exact content**

```markdown
You research a ZIO library topic so a documentation author can write accurately.

Write your findings to the file path your task names, under `.flowrite/research/`, with the `write`
tool, and return only that path plus a one-line summary. Never edit the library's own sources — the
findings file is the only file you write.

If a findings file already exists at that path and covers the same subject, read it and say so instead
of researching again. It is the cache; a second run against an unchanged checkout should not pay twice.

Load the `research` skill for the step-by-step procedure — locating core source, reading tests,
tracing supporting types, finding real-world patterns, and researching GitHub history — along with its
finding-vs-not-a-finding table and grounding rules (verbatim signatures, audience tier, citation
format). Follow that procedure here; nothing about it changes for this task.

Write the findings as markdown in the shape the task requests, grounded verbatim in what you
found in source, tests, examples, and history. Never let general Scala/ZIO knowledge substitute for a
real fact you can read from the checkout — quote the real imports, signatures, and examples.

Whatever the subject, every findings file carries these, because the author cannot write the page
without them:

- **Imports** a reader needs, and the sbt dependency line.
- **A `source` citation per fact**, as `path:L<start>-L<end>` (e.g. `src/main/scala/optics/Lens.scala:L12-L20`).
- **`Source files read`** — every file you opened, deduped. If this list is empty the findings are worthless.
- **Grounding detail** — a closing section of verbatim excerpts: real signatures, scaladoc lines,
  snippets from source and tests. The author copies from this instead of reasoning from general
  knowledge, so quote generously and mark anything you could not verify.
- **Scala 2 vs 3 differences**, when any exist.
- **What history states**, per the loaded skill's GitHub History Research section — with its
  provenance, or an explicit "history says nothing about this subject".

Say plainly when you could not find something. A gap the author knows about is recoverable; a gap
filled with a plausible invention is not.
```

- [ ] **Step 3: Typecheck**

Run: `cd flowrite && npm run typecheck`
Expected: exits 0, no errors about the new import or `useSkill` call.

- [ ] **Step 4: Run the existing test suite**

Run: `cd flowrite && npm test`
Expected: all tests that passed before this change still pass (no test asserts on `researcher.md`'s literal body — verified during planning via `grep -rn researcher src/agent.test.ts src/runtime/delegate.test.ts`, which found only role-label references, not body-text assertions).

- [ ] **Step 5: Verify the trimmed file dropped the `gh_query` mention**

Run: `grep -n "gh_query" flowrite/src/subagents/researcher.md`
Expected: no output. (This was a real latent bug: the old body told a Claude Code-side reader — which has no `gh_query` tool — to "use gh_query to find the thread by keyword instead." The mounted skill's fallback wording says `gh search commits/issues/prs` instead, which works in both contexts.)

- [ ] **Step 6: Commit**

```bash
git add flowrite/src/subagents/researcher.ts flowrite/src/subagents/researcher.md
git commit -m "flowrite: mount research skill in researcher, drop duplicated procedure"
```

---

### Task 3: Wire the plugin export and promote

**Files:**
- Modify: `flowrite/scripts/generate-plugin-skill.mjs:451-469` (the `docs-researcher` `AGENT_MANIFEST` entry)
- Modify: `flowrite/scripts/generate-plugin-skill.mjs:430-434` (the doc-comment above `AGENT_MANIFEST`)
- Modify (generated, then promoted): `plugins/documentation/agents/docs-researcher.md`

**Interfaces:**
- Consumes: `researcher.md`'s new body (Task 2), the generator's existing `frontmatter()`/`generateAgent()` functions (unchanged).
- Produces: `plugins/documentation/agents/docs-researcher.md` with a `skills: docs-research` frontmatter field and the trimmed body — the artifact `docs-add-missing-section` and any future consumer sees when the `docs-researcher` agent is dispatched.

- [ ] **Step 1: Add the `skills` field to the `docs-researcher` entry**

In `flowrite/scripts/generate-plugin-skill.mjs`, find this entry (currently at lines 452-469):

```javascript
  {
    name: 'docs-researcher',
    frontmatter: {
      name: 'docs-researcher',
      description:
        'Researches a ZIO topic across source, tests, examples, and GitHub history; returns ' +
        'structured research answers in the shape the caller requests.',
      model: 'haiku',
      effort: 'low',
    },
    instructions: 'src/subagents/researcher.md',
    substitutions: [
      [
        'Write your findings to the file path your task names, under `.flowrite/research/`, with the `write`\ntool',
        'Write your findings to the file path your task names, with the `Write`\ntool',
      ],
    ],
  },
```

Replace it with:

```javascript
  {
    name: 'docs-researcher',
    frontmatter: {
      name: 'docs-researcher',
      description:
        'Researches a ZIO topic across source, tests, examples, and GitHub history; returns ' +
        'structured research answers in the shape the caller requests.',
      model: 'haiku',
      effort: 'low',
      skills: 'docs-research',
    },
    instructions: 'src/subagents/researcher.md',
    substitutions: [
      [
        'Write your findings to the file path your task names, under `.flowrite/research/`, with the `write`\ntool',
        'Write your findings to the file path your task names, with the `Write`\ntool',
      ],
    ],
  },
```

- [ ] **Step 2: Fix the stale doc-comment above `AGENT_MANIFEST`**

Find this text (currently at lines 430-434):

```
 * the output's YAML block via the same `frontmatter()` helper skills use; omitting `tools` inherits
 * every tool, which is the closest equivalent to a flowrite subagent inheriting its parent's sandbox
 * (none of these declare a `useTool` beyond researcher's `gh_query`, itself just a bash-wrapped
 * `git`/`gh` call the body already tells the model to run directly). `skills` mirrors a `useSkill()`
 * mount 1:1 — only `drafter` has any.
```

Replace it with:

```
 * the output's YAML block via the same `frontmatter()` helper skills use; omitting `tools` inherits
 * every tool, which is the closest equivalent to a flowrite subagent inheriting its parent's sandbox
 * (none of these declare a `useTool` beyond researcher's `gh_query`, itself just a bash-wrapped
 * `git`/`gh` call the body already tells the model to run directly). `skills` mirrors a `useSkill()`
 * mount 1:1 — `drafter` and `researcher` are the two that have any.
```

- [ ] **Step 3: Run the generator**

Run: `cd flowrite && node scripts/generate-plugin-skill.mjs`
Expected: prints one `generated agent docs-researcher -> dist/plugin-export/agents/docs-researcher.md` line among its output, exit 0.

- [ ] **Step 4: Diff the generated agent against the live plugin**

Run: `diff flowrite/dist/plugin-export/agents/docs-researcher.md plugins/documentation/agents/docs-researcher.md`
Expected: a diff showing exactly two changes — the new `skills: docs-research` frontmatter line, and the trimmed body from Task 2. No unexpected differences (if there are any, stop and reconcile before promoting — do not blindly overwrite).

- [ ] **Step 5: Promote (copy) the generated file over the live plugin file**

Run: `cp flowrite/dist/plugin-export/agents/docs-researcher.md plugins/documentation/agents/docs-researcher.md`

- [ ] **Step 6: Diff every other generated agent/skill against live, to confirm nothing else moved**

Run:
```bash
diff -rq flowrite/dist/plugin-export/ plugins/documentation/skills/ | grep -v '^Only in flowrite/dist/plugin-export/: agents'
diff -rq flowrite/dist/plugin-export/agents/ plugins/documentation/agents/
```
Expected: the first command reports no differences under `skills/` (this task touches only an agent, not a top-level generated skill); the second reports no differences now that Step 5 promoted `docs-researcher.md`.

- [ ] **Step 7: Commit**

```bash
git add flowrite/scripts/generate-plugin-skill.mjs plugins/documentation/agents/docs-researcher.md
git commit -m "docs-researcher: mount docs-research skill via AGENT_MANIFEST, regenerate and promote"
```

---

### Task 4: Fix the plugin's `docs-research` frontmatter and flowrite's orphan-skill list

**Files:**
- Modify: `plugins/documentation/skills/docs-research/SKILL.md` (frontmatter only, lines 1-5)
- Modify: `flowrite/AGENTS.md:43-52`

**Interfaces:**
- Consumes: the description text decided in Task 1's new flowrite skill frontmatter.
- Produces: an accurate "used by" claim on the live plugin skill, and an `AGENTS.md` that reflects that `docs-research` is no longer an orphan (only `docs-integrate` remains a true no-flowrite-counterpart exception, alongside the unrelated `docs-organize-types`/`docs-examples` pair).

- [ ] **Step 1: Fix the plugin skill's frontmatter**

In `plugins/documentation/skills/docs-research/SKILL.md`, replace lines 1-5:

```yaml
---
name: docs-research
description: Shared research procedure for documentation skills. Find source files, tests, examples, patterns, and GitHub history when researching a topic. Used by docs-how-to-guide, docs-tutorial, and docs-data-type-ref.
allowed-tools: Read, Glob, Grep, Bash(gh:*)
---
```

with:

```yaml
---
name: docs-research
description: Shared research procedure for documentation agents and skills — find source, tests, examples, patterns, and GitHub history when researching a ZIO topic. Mounted by the docs-researcher agent and loaded directly by the docs-add-missing-section skill.
allowed-tools: Read, Glob, Grep, Bash(gh:*)
---
```

Leave the rest of the file (the body, starting at `# Source Code Research for Documentation`) untouched — it must stay byte-identical to `flowrite/src/skills/research/SKILL.md`'s body from Task 1.

- [ ] **Step 2: Verify the bodies still match**

Run: `diff <(tail -n +6 flowrite/src/skills/research/SKILL.md) <(tail -n +6 plugins/documentation/skills/docs-research/SKILL.md)`
Expected: no output (bodies identical; only the frontmatter blocks, which this command skips via `tail -n +6`, differ between the two files).

- [ ] **Step 3: Update `AGENTS.md`'s orphan-skill exception list**

In `flowrite/AGENTS.md`, replace this text (currently lines 43-52):

```
   Three plugin skills are the standing exception, not because their flowrite counterpart might be
   wrong, but because there is no flowrite counterpart to promote from at all:
   - `docs-organize-types` vs. flowrite's `organize-reference-docs` (→ `docs-organize-reference-docs`)
     — differently scoped tools that coexist on purpose, not a fork to reconcile.
   - `docs-examples` vs. `docs-companion-examples`/`docs-examples-builder` — a mechanical procedure
     skill vs. a delegation wrapper around the matching flowrite subagent; both stay.
   - `docs-research`/`docs-integrate` — pre-existing plugin skills with **no** flowrite skill or
     subagent-name match at all (`researcher`/`docs_integrator` are subagents, not skills). They are
     out of scope for mechanical generation entirely; don't merge or delete them on the assumption
     they're a stale fork of something in flowrite.
```

with:

```
   Two cases are a standing exception, not because their flowrite counterpart might be wrong, but
   because there is no flowrite counterpart to promote from at all:
   - `docs-organize-types` vs. flowrite's `organize-reference-docs` (→ `docs-organize-reference-docs`)
     — differently scoped tools that coexist on purpose, not a fork to reconcile.
   - `docs-examples` vs. `docs-companion-examples`/`docs-examples-builder` — a mechanical procedure
     skill vs. a delegation wrapper around the matching flowrite subagent; both stay.
   - `docs-integrate` — a pre-existing plugin skill with **no** flowrite skill or subagent-name match
     at all (`docs_integrator` is a subagent, not a skill). Out of scope for mechanical generation
     entirely; don't merge or delete it on the assumption it's a stale fork of something in flowrite.

   `docs-research` is no longer in this list. It now has a real flowrite counterpart,
   `src/skills/research/SKILL.md`, mounted into the `researcher` subagent via `useSkill` and declared
   in `docs-researcher`'s `AGENT_MANIFEST` entry (`skills: 'docs-research'`) the same way `docs-drafter`
   declares its mounted skills. Its plugin body is still hand-mirrored rather than generator-produced
   — like `mdoc-conventions`/`ascii-diagram`/`markdown-table`/`writing-style`, it is a mounted
   "expertise" skill, not an instruction-driven `MANIFEST`-generated one, so edit both copies together
   and keep them byte-identical below the frontmatter.
```

- [ ] **Step 4: Commit**

```bash
git add plugins/documentation/skills/docs-research/SKILL.md flowrite/AGENTS.md
git commit -m "docs: docs-research is no longer an orphan skill; fix its stale 'used by' claim"
```

---

### Task 5: Full verification pass

**Files:** none changed — this task only runs checks across the four prior tasks' output.

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: a pass/fail verdict for the whole plan, and the evidence to back it.

- [ ] **Step 1: Re-run typecheck and tests**

Run: `cd flowrite && npm run typecheck && npm test`
Expected: both exit 0.

- [ ] **Step 2: Re-run the generator and confirm a clean diff**

Run:
```bash
cd flowrite && node scripts/generate-plugin-skill.mjs
diff -rq dist/plugin-export/agents/ ../plugins/documentation/agents/
diff -rq dist/plugin-export/ ../plugins/documentation/skills/ | grep -v '^Only in dist/plugin-export/: agents'
```
Expected: no differences reported anywhere (everything the generator can produce is already promoted).

- [ ] **Step 3: Confirm no stray Flue tokens made it into the plugin**

Run: `grep -n "gh_query\|\.flowrite/\|useSkill" plugins/documentation/agents/docs-researcher.md plugins/documentation/skills/docs-research/SKILL.md`
Expected: no output.

- [ ] **Step 4: Confirm the `skills:` frontmatter landed correctly**

Run: `grep -n "^skills:" plugins/documentation/agents/docs-researcher.md`
Expected: `skills: docs-research`

- [ ] **Step 5: Read the three touched files end-to-end for coherence**

Read `flowrite/src/skills/research/SKILL.md`, `plugins/documentation/agents/docs-researcher.md`, and `plugins/documentation/skills/docs-research/SKILL.md` in full. Confirm: the agent's body reads sensibly as a short wrapper pointing at a skill that is actually mounted (no dangling "load the X skill" pointing at nothing), and the skill's frontmatter accurately names its real consumers.

- [ ] **Step 6: Report**

No commit for this task (verification only). Summarize in the final report: which commands were run, their exit codes, and confirmation that Tasks 1-4's commits are all present on `research-improvement` (`git log --oneline -6`).
