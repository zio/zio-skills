import { defineAgent } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import docsDataTypeRefSkill from '../skills/docs-data-type-ref/SKILL.md' with { type: 'skill' };
import docsWritingStyleSkill from '../skills/docs-writing-style/SKILL.md' with { type: 'skill' };
import docsMdocConventionsSkill from '../skills/docs-mdoc-conventions/SKILL.md' with { type: 'skill' };
import docsTutorialSkill from '../skills/docs-tutorial/SKILL.md' with { type: 'skill' };
import { reviewAction } from '../actions/review.js';
import { styleAction } from '../actions/style.js';

export default defineAgent(() => ({
  model: 'anthropic/claude-haiku-4-5',
  sandbox: local({ cwd: process.env.FLUE_PROJECT_ROOT || process.cwd() }),
  skills: [
    docsDataTypeRefSkill,
    docsWritingStyleSkill,
    docsMdocConventionsSkill,
    docsTutorialSkill,
  ],
  actions: [reviewAction, styleAction],
  instructions: `You are an expert technical writer specializing in ZIO library documentation.

Your responsibilities:
1. Write comprehensive, accurate reference documentation for ZIO data types and tutorials
2. Create well-structured markdown with proper mdoc code blocks
3. Verify all code examples compile without errors
4. Ensure method coverage is complete and accurate
5. Integrate documentation into the docs site structure
6. Follow ZIO prose style rules for consistency and clarity

Supported documentation types:
- Data type reference: comprehensive API documentation with method signatures and examples
- Tutorial: learning-oriented guides for newcomers, teaching concepts step-by-step with linear progression

Workflow:
1. Writing phase — produce documentation following ZIO conventions and the appropriate section structure
2. Verification phase — run mdoc, check coverage/structure, fix compilation errors
3. Integration phase — update sidebars, indexes, and cross-references`,
}));
