import type { Check } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { proseParagraphs } from '../markdown.ts';

/**
 * Rule 5: no manual line breaks in prose — write each paragraph as one continuous line.
 *
 * Worth fixing before anything reads the page, not after: a hard-wrapped paragraph shifts every line
 * number the llm checkers report, which is the same class of noise that produced turn 11's stale line
 * numbers. `proseParagraphs` excludes indented lines, so a bullet wrapped over several lines is never
 * mistaken for a wrapped paragraph.
 */
export const style5: Check = {
  id: 'style-5',
  kind: 'code',
  async run(ctx) {
    const failures = proseParagraphs(ctx.lines)
      .filter((span) => span.end > span.start)
      .map((span) =>
        fail(
          'style-5',
          span.start,
          `This paragraph is hard-wrapped across ${span.end - span.start + 1} lines. ` +
            `Join it into one continuous line.`,
        ),
      );
    return summarize('style-5', 'no manual line breaks in prose', failures);
  },
  fix(content) {
    const lines = content.split('\n');
    const wrapped = proseParagraphs(lines).filter((span) => span.end > span.start);
    if (wrapped.length === 0) return content;
    // Splice from the end so the earlier spans' indices stay valid while the array shrinks.
    for (const span of [...wrapped].reverse()) {
      const joined = lines
        .slice(span.start, span.end + 1)
        .map((line) => line.trim())
        .join(' ');
      lines.splice(span.start, span.end - span.start + 1, joined);
    }
    return lines.join('\n');
  },
};
