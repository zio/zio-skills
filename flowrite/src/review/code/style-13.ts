import type { Check, ReviewItem } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { type Heading, headings } from '../markdown.ts';

/**
 * The immediate children of each heading: the next-deeper headings before the section closes.
 *
 * Shared with style-14, which applies the same "one child is not a division" idea one level down.
 */
export function childHeadings(all: Heading[], parentLevel: number): Map<number, Heading[]> {
  const children = new Map<number, Heading[]>();
  let parent: Heading | null = null;
  for (const heading of all) {
    if (heading.level === parentLevel) {
      parent = heading;
      children.set(heading.line, []);
    } else if (heading.level === parentLevel + 1 && parent !== null) {
      children.get(parent.line)?.push(heading);
    } else if (heading.level <= parentLevel) {
      parent = null;
    }
  }
  return children;
}

/**
 * Rule 13: never create a subsection with only one child.
 *
 * Scoped to `##` → `###`, with the `###` → `####` case left to style-14, whose rule states the
 * requirement for that level directly. Splitting by level is what stops one lone heading from drawing
 * two complaints.
 *
 * The rule's own exception is honoured: a Core-Operations category may keep a single method when no
 * related category fits.
 */
export const style13: Check = {
  id: 'style-13',
  kind: 'code',
  async run(ctx) {
    const all = headings(ctx.lines);
    const failures: ReviewItem[] = [];

    for (const [line, children] of childHeadings(all, 2)) {
      if (children.length !== 1) continue;
      const parent = all.find((heading) => heading.line === line);
      if (parent === undefined || /core[\s-]*operations?/i.test(parent.text)) continue;
      failures.push(
        fail(
          'style-13',
          children[0].line,
          `"${children[0].text}" is the only subsection under "${parent.text}". A division of one ` +
            `divides nothing: fold it into the parent's prose, or add the sibling subsections it needs.`,
        ),
      );
    }
    return summarize('style-13', 'no lone subheaders', failures);
  },
};
