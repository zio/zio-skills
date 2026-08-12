import type { Check, ReviewItem } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { headings, stripInlineCode } from '../markdown.ts';

/** Words title case leaves lowercase: articles, coordinating conjunctions, short prepositions. */
const SMALL = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'of', 'to', 'in', 'on', 'at',
  'by', 'from', 'with', 'as', 'vs', 'via', 'per', 'up', 'off', 'out',
]);

/** Names that are lowercase by convention and stay that way in a heading. */
const ALWAYS_LOWER = new Set(['mdoc', 'sbt', 'npm', 'pnpm']);

/**
 * Rule 28: Title Case every heading.
 *
 * Detect-only, deliberately: no `fix` ships for this one. A naive title-caser mangles
 * `## Working with Chunk#map`, and a repair that damages content silently is worse than a finding the
 * writer resolves in a turn.
 *
 * Restraint is built into the word filter, since this is the grader most likely to invent a violation.
 * Skipped: anything inside backticks, tokens that do not begin with a letter, identifiers and paths
 * (containing `#`, `.`, `_`, `/`, `(`), acronyms already in caps, small words after the first
 * position, and the handful of names that are lowercase by convention.
 */
export const style28: Check = {
  id: 'style-28',
  kind: 'code',
  async run(ctx) {
    const failures: ReviewItem[] = [];

    for (const heading of headings(ctx.lines)) {
      const words = stripInlineCode(heading.text)
        .split(/\s+/)
        .map((word) => word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
        .filter((word) => word !== '');

      const offenders = words.filter((word, index) => {
        if (!/^\p{Ll}/u.test(word)) return false;
        if (/[#._/(]/.test(word)) return false;
        if (word === word.toUpperCase()) return false;
        if (ALWAYS_LOWER.has(word.toLowerCase())) return false;
        if (index === 0) return true;
        return !SMALL.has(word.toLowerCase()) && word.length >= 3;
      });

      if (offenders.length > 0) {
        failures.push(
          fail(
            'style-28',
            heading.line,
            `"${heading.text}" is not Title Case: capitalize ${offenders.map((w) => `"${w}"`).join(', ')}.`,
          ),
        );
      }
    }
    return summarize('style-28', 'Title Case headings', failures);
  },
};
