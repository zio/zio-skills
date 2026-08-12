import type { Check } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { bullets } from '../markdown.ts';

/**
 * Rule 4: when a bullet point is a full sentence, start it with a capital letter.
 *
 * "Full sentence" is taken from the rule's own condition and tested the only way text can be tested:
 * the bullet ends with sentence punctuation. Bullets that are fragments — the common case for a list
 * of operations — are left alone.
 *
 * Deliberately silent unless the first character is a lowercase ASCII letter. A bullet opening with an
 * inline code span, a link, or a digit is correct as written, and flagging `` - `map` transforms … ``
 * would train the writer to capitalize identifiers.
 */
export const style4: Check = {
  id: 'style-4',
  kind: 'code',
  async run(ctx) {
    const failures = bullets(ctx.lines)
      .filter((bullet) => /[.!?]$/.test(bullet.text))
      .filter((bullet) => /^[a-z]/.test(bullet.text.replace(/^(?:\*\*|\*|_)+/, '')))
      .map((bullet) =>
        fail(
          'style-4',
          bullet.line,
          `This bullet is a full sentence but starts lowercase: "${bullet.text}". ` +
            `Capitalize its first word.`,
        ),
      );
    return summarize('style-4', 'bullet capitalization', failures);
  },
};
