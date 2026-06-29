---
providers:
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}
---

# Development Rules

## Code

- TypeScript strict mode
- `const`/`let` only, no `var`
- camelCase variables, snake_case files
- Named exports only
- No `any`, no comments unless WHY non-obvious

## Structure

```
agents/    → Claude agent profiles
workflows/ → Orchestrators
lib/       → Pure utilities (testable)
tools/     → Flue tools (I/O only)
skills/    → SKILL.md (LLM instructions)
tests/     → Vitest tests
```

## Imports

```typescript
import fs from 'node:fs';
import { func } from '../lib/module.js';
```

Node modules use `node:`. Named exports only.

## Functions

- Pure in `lib/` — no I/O
- Immutable — return new objects
- Explicit types
- Throw on error (don't return null)
- One responsibility

## State

- Load → Process → Save (atomic)
- Never mutate state
- Validate with Valibot
- Stored in `.crossref-state/`

## Paths

- Always `realpathSync()` symlinks
- Check resolved path within boundary
- Never trust user paths

## Logging

```
[workflow-name] ✓ Processed: Title (1/42) | Applied: 3
[workflow-name] Error: ...
```

## Running Workflows

### Foreground (Interactive)

```bash
npm run build
export ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY .env | cut -d= -f2)
npx flue run crossref --target node --input '{...}'
```

### Background (Non-blocking)

For long-running workflows (autopilot, verify-and-fix), run in background:

**nohup (simple):**

```bash
nohup npx flue run crossref --target node \
  --input '{"docsDir":"/path/to/docs","mode":"autopilot"}' > workflow.log 2>&1 &
```

**screen (persistent):**

```bash
screen -S my-workflow
npm run build
export ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY .env | cut -d= -f2)
npx flue run crossref --target node --input '{...}'
# Ctrl+A then D to detach
# screen -r my-workflow to reattach
```

**Claude Code background execution:**
Use the `run_in_background: true` parameter in Bash tool calls.

### Monitoring

```bash
tail -f workflow.log           # nohup logs
screen -r my-workflow          # reattach screen session
ps aux | grep flue             # find process
```

## Formatting

Run `npx prettier --write <file>` after every edit. CI enforces it.

## Testing

```bash
npm test      # Run all
npm test:watch
```

Tests pass before commit.

## Git

- One commit per logical change
- Message: `type: description`
- Types: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- No force-push
- Tests pass first

## Documentation Maintenance

After any significant change, update `README.md` (feature list + quick-start example) and `ARCHITECTURE.md` (directory tree + workflow section). Same commit or immediate `docs:` follow-up.

After developing a new workflow or agent, update `AGENT_RUNNING_GUIDE.md` with the new workflow's payload schema and usage example.

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

## Agents

- Skill-driven (behavior in `skills/*/SKILL.md`)
- Minimal tools
- Validate LLM output before use

## Markdown

- Protect code blocks, inline code, frontmatter
- Safe phrase matching (word boundaries)
- Preserve original casing

## Security

- Validate all paths (symlink + boundary)
- Never hardcode secrets
- Never execute LLM output
- Escape shell arguments
