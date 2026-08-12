import type { Check, ReviewItem } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { fences } from '../markdown.ts';

/**
 * Rule 18: prefer `val` over `var` — use immutable patterns wherever possible.
 *
 * Scala code only, and comment lines are skipped: a comment explaining why a `var` would be wrong is
 * not itself a violation.
 */
export const style18: Check = {
  id: 'style-18',
  kind: 'code',
  async run(ctx) {
    const failures: ReviewItem[] = [];

    for (const fence of fences(ctx.lines)) {
      if (!fence.info.startsWith('scala')) continue;
      for (let i = fence.start + 1; i < fence.end; i++) {
        const line = ctx.lines[i];
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        if (/(^|[^\w.])var\s+\w/.test(line)) {
          failures.push(
            fail(
              'style-18',
              i,
              `Mutable declaration in an example: "${line.trim()}". Rewrite it with "val" — examples ` +
                `teach the patterns readers copy.`,
            ),
          );
        }
      }
    }
    return summarize('style-18', 'val over var', failures);
  },
};
