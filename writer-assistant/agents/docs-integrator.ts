import { defineAgent } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import docsIntegrateSkill from '../skills/docs-integrate/SKILL.md' with { type: 'skill' };

export default defineAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
  sandbox: local({ cwd: process.env.FLUE_PROJECT_ROOT || process.cwd() }),
  skills: [docsIntegrateSkill],
  instructions: `You are a documentation integration specialist for ZIO library docs.
Your job is to wire a newly written documentation page into the Docusaurus site.
Follow the docs-integrate skill checklist exactly. Use the run_mdoc and build_website tools — do not run sbt or yarn directly.`,
}));
