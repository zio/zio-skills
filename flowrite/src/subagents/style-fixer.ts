import { defineSubagent } from '@flue/runtime';
import { TIERS } from '../shared/models.ts';
import instructions from './style-fixer.md';

/**
 * Narrow, single-purpose role for the fixing pass in the style loop. Invoked
 * once per rule group with that group's violations; it reads the page once and
 * applies every fix in a single pass (see style-fixer.md).
 *
 * Currently declared with no caller, like review_resolver. The style loop that invoked it was replaced
 * by the read-only check registry in src/review/ — the writer fixes what review reports. Kept declared
 * so restoring an automatic style fixer stays a one-line change rather than a re-implementation.
 */
export function StyleFixer() {
  return instructions;
}

export const styleFixer = defineSubagent({
  name: 'style_fixer',
  ...TIERS.writer,
  description: 'Fixes a batch of listed writing style violations in a documentation page in a single pass.',
  agent: StyleFixer,
});
