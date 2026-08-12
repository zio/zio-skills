import type { Check, ReviewItem } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { fences } from '../markdown.ts';

/** A whole-line Scala 3 wildcard import. Anchored, so `import x.*.y` (not a thing) can't match. */
const WILDCARD = /^\s*import\s+[\w.]+\.\*\s*$/;

/**
 * Rule 23: default to Scala 2.13 syntax — `import x._`, never `import x.*`.
 *
 * Carries a `fix`, because the repair is a two-character substitution with no judgement in it.
 */
export const style23: Check = {
  id: 'style-23',
  kind: 'code',
  async run(ctx) {
    const failures: ReviewItem[] = [];
    for (const fence of fences(ctx.lines)) {
      if (!fence.info.startsWith('scala')) continue;
      for (let i = fence.start + 1; i < fence.end; i++) {
        if (WILDCARD.test(ctx.lines[i])) {
          failures.push(
            fail(
              'style-23',
              i,
              `Scala 3 wildcard import "${ctx.lines[i].trim()}". This corpus defaults to Scala 2.13: ` +
                `write "import x._".`,
            ),
          );
        }
      }
    }
    return summarize('style-23', 'Scala 2.13 wildcard imports', failures);
  },
  fix(content) {
    // The fences are re-derived from the text handed in, not read from a CheckContext: this runs in
    // the write phase where no context exists, and after any earlier fix has already changed the text.
    const lines = content.split('\n');
    for (const fence of fences(lines)) {
      if (!fence.info.startsWith('scala')) continue;
      for (let i = fence.start + 1; i < fence.end; i++) {
        if (WILDCARD.test(lines[i])) lines[i] = lines[i].replace(/\.\*(\s*)$/, '._$1');
      }
    }
    return lines.join('\n');
  },
};
