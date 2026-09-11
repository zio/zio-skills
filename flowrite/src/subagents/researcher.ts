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
 * document-kind-neutral.
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
