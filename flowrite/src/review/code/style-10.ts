import type { Check } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { frontmatterFields, headings } from '../markdown.ts';

/** Heading text reduced to what a reader would call "the same title": no markup, no case, no padding. */
export const normalizeTitle = (text: string): string => text.replace(/[`*_]/g, '').trim().toLowerCase();

/**
 * Rule 10: no markdown heading that duplicates the frontmatter title.
 *
 * Docusaurus renders the frontmatter `title` as the page's h1, so a body heading repeating it shows
 * the same words twice. A page with no frontmatter title has nothing to duplicate and passes.
 */
export const style10: Check = {
  id: 'style-10',
  kind: 'code',
  async run(ctx) {
    const title = frontmatterFields(ctx.lines).title;
    if (title === undefined) return summarize('style-10', 'no heading duplicating the page title', []);

    const failures = headings(ctx.lines)
      .filter((heading) => normalizeTitle(heading.text) === normalizeTitle(title))
      .map((heading) =>
        fail(
          'style-10',
          heading.line,
          `This heading repeats the frontmatter title "${title}", which Docusaurus already renders ` +
            `as the page heading. Delete it and start with the first real section.`,
        ),
      );
    return summarize('style-10', 'no heading duplicating the page title', failures);
  },
};
