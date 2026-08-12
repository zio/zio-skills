import type { Check, ReviewItem } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { bullets } from '../markdown.ts';

/**
 * Pairs of consecutive same-indent bullets separated by nothing but blank lines.
 *
 * The narrowness is the point. A blank line followed by indented prose is a multi-paragraph list item,
 * and a blank line followed by anything else ends the list — neither is a violation. Only blank lines
 * sitting directly between two siblings are.
 */
function looseGaps(lines: string[]): { after: number; before: number; indent: number }[] {
  const items = bullets(lines);
  const gaps: { after: number; before: number; indent: number }[] = [];

  for (let i = 0; i < items.length - 1; i++) {
    const current = items[i];
    const next = items[i + 1];
    if (current.indent !== next.indent || next.line <= current.line + 1) continue;
    const between = lines.slice(current.line + 1, next.line);
    if (between.length > 0 && between.every((line) => line.trim() === '')) {
      gaps.push({ after: current.line, before: next.line, indent: current.indent });
    }
  }
  return gaps;
}

/**
 * Rule 21, mechanical half: never place blank lines between bullet items.
 *
 * The rule's other half — bullets only for independent enumerable items, prose when they form a
 * narrative — needs reading comprehension and stays with the model under id `style-21`. This one is
 * whitespace, so it is decided here and repaired before review ever sees the page.
 */
export const style21Form: Check = {
  id: 'style-21-form',
  kind: 'code',
  async run(ctx) {
    const failures: ReviewItem[] = looseGaps(ctx.lines).map((gap) =>
      fail(
        'style-21-form',
        gap.after,
        `Blank line${gap.before - gap.after > 2 ? 's' : ''} between this bullet and the next. ` +
          `List items run without blank lines between them.`,
      ),
    );
    return summarize('style-21-form', 'no blank lines between bullet items', failures);
  },
  fix(content) {
    const lines = content.split('\n');
    const gaps = looseGaps(lines);
    if (gaps.length === 0) return content;
    // Splice from the end so earlier gaps' indices stay valid as the array shrinks.
    for (const gap of [...gaps].reverse()) lines.splice(gap.after + 1, gap.before - gap.after - 1);
    return lines.join('\n');
  },
};
