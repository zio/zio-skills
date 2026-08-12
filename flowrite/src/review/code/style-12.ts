import type { Check, ReviewItem } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { headings } from '../markdown.ts';

/**
 * Rule 12: always write an intro sentence between a header and its first nested subheader.
 *
 * Only nested pairs count — `##` → `###` and `###` → `####`. Two headings at the same level with
 * nothing between them describe an empty section, which is a different problem and not this rule's.
 */
export const style12: Check = {
  id: 'style-12',
  kind: 'code',
  async run(ctx) {
    const all = headings(ctx.lines);
    const failures: ReviewItem[] = [];

    for (let i = 0; i < all.length - 1; i++) {
      const current = all[i];
      const next = all[i + 1];
      if (next.level <= current.level) continue;
      const hasProse = ctx.lines.slice(current.line + 1, next.line).some((line) => line.trim() !== '');
      if (!hasProse) {
        failures.push(
          fail(
            'style-12',
            current.line,
            `"${current.text}" is followed straight by "${next.text}" with nothing between them. ` +
              `Add a sentence introducing what the subsections cover.`,
          ),
        );
      }
    }
    return summarize('style-12', 'no bare subheaders', failures);
  },
};
