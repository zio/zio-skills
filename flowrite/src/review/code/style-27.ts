import type { Check, ReviewItem } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { fenceMask, stripInlineCode } from '../markdown.ts';

/**
 * The planning vocabulary this pipeline uses about itself.
 *
 * These are terms from the design phase — how the docs get built — not things a reader of the docs
 * knows. "The Tracing area of the telemetry module" is fine; "the Tracing sub-domain" leaks the
 * scaffolding. The shape names are the design phase's own classification labels.
 */
const INTERNAL: { pattern: RegExp; instead: string }[] = [
  { pattern: /\bsub-?domains?\b/i, instead: 'name the area directly, e.g. "the Tracing area" or just "Tracing"' },
  { pattern: /\bsingle-core\b/i, instead: 'drop it — this is a planning classification, not a reader-facing term' },
  { pattern: /\bcore-family\b/i, instead: 'drop it — this is a planning classification, not a reader-facing term' },
  { pattern: /\bmulti-domain\b/i, instead: 'drop it — this is a planning classification, not a reader-facing term' },
  { pattern: /\bmodule reference\b/i, instead: 'name the module, e.g. "the telemetry module"' },
  { pattern: /\bsupporting depth\b/i, instead: 'drop it — the depth tag is a planning term' },
];

/**
 * Rule 27: never surface internal organizing vocabulary in the doc.
 *
 * Prose only, with inline code stripped first: a page that documents a type literally named
 * `SubDomain` should not be punished for naming it.
 */
export const style27: Check = {
  id: 'style-27',
  kind: 'code',
  async run(ctx) {
    const mask = fenceMask(ctx.lines);
    const failures: ReviewItem[] = [];

    for (let i = 0; i < ctx.lines.length; i++) {
      if (mask[i]) continue;
      const prose = stripInlineCode(ctx.lines[i]);
      for (const { pattern, instead } of INTERNAL) {
        const match = pattern.exec(prose);
        if (match !== null) {
          failures.push(
            fail(
              'style-27',
              i,
              `"${match[0]}" is internal planning vocabulary, not something a reader knows — ${instead}.`,
            ),
          );
          break;
        }
      }
    }
    return summarize('style-27', 'no internal organizing vocabulary', failures);
  },
};
