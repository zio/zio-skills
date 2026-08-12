import type { Check, ReviewItem } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { frontmatterFields, headings } from '../markdown.ts';
import { normalizeTitle } from './style-10.ts';

/**
 * Rule 11: `##` for major sections, `###` for subsections, `####` for subsubsections.
 *
 * Two ways to break it, both structural: a body heading at level 1 (the page's h1 comes from
 * frontmatter), and a level skipped on the way down — `##` straight to `####` leaves the reader no
 * subsection to attach the subsubsection to.
 *
 * A level-1 heading that merely repeats the page title is left to rule 10, so one line never draws two
 * differently-worded complaints.
 */
export const style11: Check = {
  id: 'style-11',
  kind: 'code',
  async run(ctx) {
    const title = frontmatterFields(ctx.lines).title;
    const failures: ReviewItem[] = [];
    // The frontmatter title is the page's level 1, so the first body heading may be level 2.
    let previous = 1;

    for (const heading of headings(ctx.lines)) {
      if (heading.level === 1) {
        if (title === undefined || normalizeTitle(heading.text) !== normalizeTitle(title)) {
          failures.push(
            fail(
              'style-11',
              heading.line,
              `"${heading.text}" is a level-1 heading. The page title comes from frontmatter — ` +
                `body headings start at "##".`,
            ),
          );
        }
      } else if (heading.level > previous + 1) {
        failures.push(
          fail(
            'style-11',
            heading.line,
            `Heading level jumps from "${'#'.repeat(previous)}" to "${'#'.repeat(heading.level)}" at ` +
              `"${heading.text}". Use the next level down, or promote this heading.`,
          ),
        );
      }
      previous = heading.level;
    }
    return summarize('style-11', 'heading hierarchy', failures);
  },
};
