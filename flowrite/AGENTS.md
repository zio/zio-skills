# flowrite — Agent & Workflow Conventions

## Writing Flue Agents

Read https://flueframework.com/start.md then help create flue agents.

## Keep `plugins/documentation` in sync with flowrite

flowrite is the source of truth for the Claude Code marketplace's `documentation` plugin
(`plugins/documentation/`). Whenever you change any of:

- `src/skills/*/SKILL.md` (and their `references/*.md`)
- `src/instructions/*.md` (the standalone-agent workflows)
- `src/subagents/*.md` and its paired `.ts` wrapper (instructions, `model`/`thinkingLevel` tier,
  `useSkill` mounts)
- `scripts/generate-plugin-skill.mjs` itself

... `plugins/documentation` may now be stale. Do not let a plugin skill or agent silently drift from
its flowrite source — that already happened once this project's history (`docs-backfill-metadata`
briefly forked into a differently-named, un-cross-referenced copy) and cost a dedicated cleanup pass.

### The workflow

1. Run `node scripts/generate-plugin-skill.mjs` from `flowrite/` (or let it run automatically — see
   `.git-hooks/post-commit`, which regenerates `flowrite/dist/plugin-export/` on any commit touching
   the paths above, but never touches the live plugin itself).
2. Diff the output against the live plugin:
   ```bash
   diff -rq flowrite/dist/plugin-export/ ../plugins/documentation/skills/
   diff -rq flowrite/dist/plugin-export/agents/ ../plugins/documentation/agents/
   ```
3. **For anything with a `MANIFEST`/`AGENT_MANIFEST` entry, flowrite has already won — promote the
   generator's output, don't re-litigate it.** The migration that required a side-by-side editorial
   read of every skill (comparing flowrite's version against a pre-existing, independently-evolved
   plugin skill to decide which was actually better) is done; that discipline caught real bugs at the
   time (`docs-organize-types`' broken categorization, an `sbt docs/mdoc --watch` hang, and others) but
   it was a one-time migration task, not a standing posture. Going forward, treat the diff as a
   mechanical check, not an editorial one: does every substitution still fire (a throw from
   `applySubstitutions()` means the source drifted and the substitution needs updating, not that
   flowrite's new content is wrong), does the output look structurally sane, and — the one case that
   still needs a human decision — does a *new* flowrite skill or subagent need a *new* manifest entry
   (the generator only emits what's already listed; it won't notice a new source file on its own).
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
4. **Naming convention.** A flowrite skill named `X` maps to plugin skill `docs-X` under
   `plugins/documentation/skills/`. A flowrite subagent named `X` maps to plugin agent `docs-X` (or its
   already-`docs-`-prefixed name, e.g. `docs-integrator`) under `plugins/documentation/agents/`. If you
   add a new flowrite skill or subagent and its plugin counterpart doesn't exist yet, that's a real gap
   — add it, following this convention, rather than leaving the marketplace behind.
5. **Flue-specific content never copies verbatim.** A source file mentioning `.flowrite/`, `useSkill`,
   `useTool`, `task()`, a Flue tool name (`write`/`read` should read `Write`/`Read`, Claude Code's real
   tool names), or a Flue structured-output primitive (a `finish` call) needs a `substitutions` entry
   in `MANIFEST`/`AGENT_MANIFEST` translating it — never a blind copy. `applySubstitutions()` throws if
   a substitution's target text no longer matches, by design: a stale substitution fails loudly at
   generation time rather than silently emitting content that still leaks Flue internals.
6. A subagent whose `.ts` wrapper composes per-invocation content at render time (`drafter.ts` and
   `designer.ts` both do `structureBlock(docKind())`) has no static-file equivalent in Claude Code —
   document that gap in the `AGENT_MANIFEST` comment (see the existing note) rather than trying to fake
   it; the calling skill supplies that material in its `Task()` prompt instead.

## Never commit anything under fixtures/tinyoptics/ or fixtures/tinytally/

Each fixture is a from-scratch baseline: sparse starter docs, no generated examples,
a clean `build.sbt`. Every run is measured against it, so committing a run's output
destroys it — later runs stop exercising the empty-start path, and quality can no
longer be judged against a known baseline.

A run writes far more than docs. All of it is output, none of it is committed:

- `docs/` — pages, `index.md`, `sidebars.js`
- `examples/` and `<fixture>-examples/` — generated `.scala`, `project/build.properties`
- `build.sbt` — the integrate phase edits it (`mdocVariables`, subprojects)
- `website/docs/` and `website/build/` — mdoc output and the Docusaurus build

✅ `bash scripts/archive-docs.sh <log> <label>` — snapshots the whole run to
`fixtures/<fixture>-archive/<label>-turn<N>/` and resets the fixture
❌ `git add -A` after a run — sweeps generated pages, examples and build edits into
whatever you commit next

Treat both fixture directories as read-only from git's point of view. Archive first,
then stage source paths explicitly (`git add src/ README.md`). Never `git add -A`
while run output is in the working tree — it has already caused two history rewrites.

## Which fixture to run

`tinytally` (2 types × 3 methods) for everything that does not need scale: verifying a
fix, checking a phase's behaviour, reproducing a defect. Its API names are invented, so a
model that fabricates instead of reading produces something visibly wrong.

`tinyoptics` (4 types × ~6 methods) when the finding depends on size — cost curves,
context bloat, how a long module run degrades. It cost $3.30 for one module run.

Build the site with `npm run build`, never `pnpm build`: this repo is a pnpm workspace, so
`pnpm run` auto-installs against the outer workspace and dies before Docusaurus starts.

## Autonomous Agent Best Practices

### 1. Set the stage, don't script the steps
Give goal + capable environment + loop. Don't hardcode do-this-then-that. Model finds path: read → act → observe → correct → repeat. Hardcoded steps = brittle, break when reality diverges.

### 2. Build context, not code
Agent quality ≈ quality of model, instructions, tools, skills, environment. Spend effort there.

An agent is model + instructions + tools + skills + sandbox. Building one is less about code, more about the context you assemble:

```ts
// .flue/agents/triage.ts
import { defineAgent } from '@flue/runtime';
import { local } from '@flue/runtime/node';

export default defineAgent(() => ({
  model: 'anthropic/claude-sonnet-4-6',
  instructions, // who the agent is
  tools,        // what it can do
  skills,       // expertise loaded on demand
  sandbox: local(), // where it runs, safely
}));
```

Always prefer declarative context over imperative code. The model + instructions + tools + skills + sandbox is the agent's "mind". The code is just a wrapper.

### 3. Nudge by example, not explanation
When adding a rule to a skill/profile, show it as a compact ✅/❌ pair, not a prose paragraph — examples teach the boundary faster and cost fewer tokens. Cap: 1-3 lines or a ✅/❌ pair. If it needs a paragraph, cut it, don't add it.

✅ `Family header: \`#### Accessors\` (members in prose), not \`#### getInt / getLong / … — Read a field\``
❌ `When a subsection documents a family of related methods, avoid enumerating every method name in the header because it becomes long; instead use a short group label and list the members in the introductory prose.`

### 4. A tool is a contract, an instruction is a suggestion
`repo-tools.ts` already says to wrap a command only when code must enforce something. The test for
"must": **put the schema where data crosses a component boundary, not where the command runs.** If a
command's output only ever goes into the model's head and comes back out as prose, a schema buys
nothing — no code reads that shape.

Pay for a contract when breaking it would be SILENT: a credential or derived parameter the model
shouldn't have to know (`gh_query` needs `--repo <owner/slug>`, so it earns its wrapper), or a value
one component must hand another intact. When breaking it is LOUD — the command errors, the path
doesn't exist, the output looks wrong — instruct instead: the model recovers from the raw error but not
from your `catch` block's summary of it.

✅ `git log --follow -n 5 --format=… -- <path> | head -c 6000` in the role's instructions
❌ a `git_history` tool whose only enforcement is truncation the shell tool already caps at 50 KB

These are NOT reasons to wrap: output might be long (bound it with a flag), the format should be
consistent, the model might forget something. Those are instruction-line problems. Instruct first,
run it, wrap only what you WATCHED fail — `gh_query` exists because `sbt gh-query` was measured
failing, and every tool written against an imagined problem in this repo has been deleted again.

Cost side: every mounted tool spends context on every turn. This is also why thirteen of the fourteen
`harness: true` phase tools are gone — each wrapped a delegation the root agent could make itself, and
paid two relay turns per call for the privilege.

## Flue Framework Reference

Flue docs ship with the npm packages. Read them directly — do not rely on training data for Flue API signatures.

- `node_modules/@flue/runtime/docs` — core API: `defineAgent`, `defineWorkflow`, tools, skills, sandboxes, subagents
- `node_modules/@flue/cli/docs` — CLI usage: `flue run`, `flue docs`, deploy targets
- `node_modules/@flue/sdk/docs` — SDK: channels, evals, observability, schedules

Alternatively you can use `flue docs` to get/search documentation pages of flue project:

```
flue docs                  List all documentation pages
flue docs read <path>      Print a documentation page as markdown
flue docs search <query>   Search the documentation (JSON results)
```
