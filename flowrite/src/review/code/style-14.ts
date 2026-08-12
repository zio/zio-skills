import type { Check, ReviewItem } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { headings } from '../markdown.ts';
import { childHeadings } from './style-13.ts';

/**
 * Rule 14: use `####` to organize MULTIPLE related topics under a single `###`.
 *
 * So a `###` with exactly one `####` child is the violation — the same shape style-13 checks one level
 * up, kept separate so each lone heading is reported once, by the rule that names its level.
 */
export const style14: Check = {
  id: 'style-14',
  kind: 'code',
  async run(ctx) {
    const all = headings(ctx.lines);
    const failures: ReviewItem[] = [];

    for (const [line, children] of childHeadings(all, 3)) {
      if (children.length !== 1) continue;
      const parent = all.find((heading) => heading.line === line);
      if (parent === undefined) continue;
      failures.push(
        fail(
          'style-14',
          children[0].line,
          `"${children[0].text}" is the only "####" under "${parent.text}". A "####" level exists to ` +
            `group several related topics — with one, drop the heading and write the content as prose.`,
        ),
      );
    }
    return summarize('style-14', 'subsubsections group multiple topics', failures);
  },
};
