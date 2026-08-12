import type { Check, ReviewItem } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { fences } from '../markdown.ts';

/**
 * Rule 15: every code block is preceded by a prose sentence ending with `:` — never a heading, and
 * never another code block without bridging prose.
 *
 * The most frequently violated rule in past runs, and decidable by walking the markdown, which made
 * paying a model to find it the clearest waste in the old design.
 *
 * Two things are deliberately not flagged. A page opening with a code block has a different problem
 * than a missing colon, and a fence introduced by JSX (`<TabItem …>`) or a `:::note` directive is
 * correct as written — rule 24 asks for tabbed blocks, so treating the tab wrapper as missing prose
 * would punish the page for following another rule.
 */
export const style15: Check = {
  id: 'style-15',
  kind: 'code',
  async run(ctx) {
    const failures: ReviewItem[] = [];

    for (const fence of fences(ctx.lines)) {
      let i = fence.start - 1;
      while (i >= 0 && ctx.lines[i].trim() === '') i--;
      if (i < 0) continue;
      const previous = ctx.lines[i].trim();

      if (/^(<|:::)/.test(previous)) continue;

      if (/^#{1,6}\s/.test(previous)) {
        failures.push(
          fail(
            'style-15',
            fence.start,
            `This code block follows the heading "${previous}" directly. Introduce it with a sentence ` +
              `saying what it demonstrates, ending with a colon.`,
          ),
        );
      } else if (/^(```|~~~)/.test(previous)) {
        failures.push(
          fail(
            'style-15',
            fence.start,
            `This code block follows another code block with no prose between them. Add bridging prose ` +
              `explaining what the next block demonstrates, ending with a colon.`,
          ),
        );
      } else if (!previous.endsWith(':')) {
        failures.push(
          fail(
            'style-15',
            fence.start,
            `The line before this code block does not end with a colon: "${previous}". Introduce the ` +
              `block with a sentence that relates it to what it demonstrates.`,
          ),
        );
      }
    }
    return summarize('style-15', 'prose sentence before every code block', failures);
  },
};
