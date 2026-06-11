# Crossref Agent Skills

This directory contains **agent-adapted skills** loaded by Flue agents at runtime via ES module import assertions.

## Purpose

Skills in this directory are behavior specifications for autonomous Flue agents. They are distinct from the canonical skills in `plugins/documentation/skills/`, which are designed for human operators invoking slash commands in Claude Code.

## Architecture

### Two Skill Ecosystems

| Aspect | `plugins/documentation/skills/` | `writer-assistant/skills/` |
|---|---|---|
| **Audience** | Human operators (Claude Code CLI) | Flue agent runtime |
| **Invocation** | `/skill-name` slash commands | `import ... with { type: 'skill' }` in agent code |
| **Style** | Instructional, verbose, task-oriented | Procedural, focused, behavior specification |
| **Scope** | 22 comprehensive documentation skills | 3 skills actively used by agents |
| **Source of truth** | Canonical | Adapted subset |

### Adaptation Contract

Agent skills are **adapted versions** of the canonical plugin skills. When adapting:

- ✅ **Keep:** Core procedures, analysis frameworks, research methodology
- ✅ **Keep:** GitHub history, examples, real-world patterns section
- ✅ **Add:** JSON output schemas if the workflow requires structured output
- ❌ **Remove:** Human-specific framing ("create tasks", "mark in_progress", "ask user")
- ❌ **Remove:** Detailed instructions for manual human actions

Example adaptation (docs-research):
- **Original** (plugin): "Create one task per research step..."
- **Adapted** (agent): "Execute research steps in order..." (assumes programmatic execution)

## Skills Inventory

### `docs-research/SKILL.md`

**Adapts from:** `plugins/documentation/skills/docs-research/SKILL.md`

**Purpose:** Comprehensive research procedure with 4 analysis phases (Discovery, Code Flow, Architecture, Documentation Landscape). Includes GitHub history search, type dependency tracing, and documentation gap identification.

**Used by:** `write-data-type-ref`, `write-tutorial`, `write-guide`, `write-explanation` workflows

**Key procedures:** GitHub CLI (`gh search`, `gh issue view`, `gh pr view`), source code navigation, test analysis

---

### `docs-data-type-ref/SKILL.md`

**Original location:** Created for Flue agents; exists in canonical form here only

**Purpose:** Reference documentation writing standards for ZIO data types. Documents 4-phase workflow: research, write, verify, integrate. Specifies section structure, mdoc conventions, frontmatter requirements.

**Used by:** `write-data-type-ref` workflow (Phase 2–4 writing guidance)

**Output schema:** Includes JSON output structure with phasesCompleted, methodsCovered, etc.

---

### `cross-linker/SKILL.md`

**Purpose:** Link identification, validation, and insertion strategy for the page-linker agent. Handles confidence scoring, anchor validation, and "See Also" section generation.

**Used by:** `page-linker` agent in the crossref workflow

---

## Maintenance Guide

### When the canonical skill changes

Example: A feature is added to `plugins/documentation/skills/docs-research/SKILL.md`.

**Steps:**

1. **Understand the change** — Read the updated plugin skill
2. **Assess relevance** — Does this change improve agent behavior?
3. **Adapt the agent version** — Apply the same conceptual change to `writer-assistant/skills/docs-research/SKILL.md`, removing human framing
4. **Test** — Run a workflow using the updated skill and verify the research output improves
5. **Document** — Update this README if the adaptation rules change

### Example: Adding "error handling patterns" section

In `plugins/documentation/skills/docs-research/SKILL.md`:
```markdown
### Step 1e: Find Error Handling Patterns
- Grep for Exception and Error handling in source
- Note common exception types and recovery patterns
```

In `writer-assistant/skills/docs-research/SKILL.md`:
```markdown
### Additional Research: Error Handling

Include in Step 1d findings:
- Common exception types and error conditions
- Recovery patterns and error handling idioms
```

(Same meaning, adapted phrasing for agent consumption)

---

## How Skills Load in Flue Agents

```typescript
// In agents/docs-writer.ts
import docsResearchSkill from '../skills/docs-research/SKILL.md' with { type: 'skill' };
import docsDataTypeRefSkill from '../skills/docs-data-type-ref/SKILL.md' with { type: 'skill' };

export default createAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
  sandbox: local(),
  skills: [docsResearchSkill, docsDataTypeRefSkill],  // ← skills loaded here
  instructions: `You have access to: docs-research, docs-data-type-ref`,
}));
```

When the agent runs, Flue includes the skill content in the system prompt. The agent then has the full procedure available and can delegate to it via natural language (e.g., "Use the docs-research skill to...").

---

## No Symlinks or Build Pipelines

Explicit, maintained adaptation is intentional. We do not:
- Symlink agent skills to plugin skills (breaks some environments, forces agents to consume human-oriented content verbatim)
- Auto-copy files (loses intentional adaptation and hides divergence)

Instead: Each skill update is a conscious decision about what agents need.

---

## Adding a New Agent Skill

When creating a new workflow that needs a skill:

1. **Check the plugin skills** — Does a canonical version exist in `plugins/documentation/skills/`?
   - If yes: Adapt it (follow the adaptation contract above)
   - If no: Create a new skill from scratch

2. **Create the directory:** `writer-assistant/skills/<skill-name>/`

3. **Create `SKILL.md`** with frontmatter and content following Flue conventions

4. **Load in the agent:** Import and add to the agent's `skills: []` array

5. **Update this README** with the new skill's inventory entry

---

## References

- **Canonical skills:** `/home/milad/sources/zio-skills/plugins/documentation/skills/`
- **Flue skill system:** Flue loads skills via `import ... with { type: 'skill' }` (ES module assertion)
- **Agent definition:** `agents/docs-writer.ts`, `agents/page-linker.ts`, etc.
