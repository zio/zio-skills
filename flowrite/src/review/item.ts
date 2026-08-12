import type { ReviewItem } from './check.ts';
import { at } from './markdown.ts';

/**
 * The two item shapes every grader produces, in one place.
 *
 * The naming is a contract, not cosmetics: `run.ts` recovers a check's id from an item name to decide
 * what a repeat review should re-check (`'style-15 @ line 42'` → `'style-15'`). A grader that invents
 * its own format silently breaks the narrowing that makes a second review cheap.
 */

/** A failure, anchored to a line. Line numbers shown to a model are 1-based. */
export const fail = (id: string, index: number, issue: string): ReviewItem => ({
  item: `${id} @ line ${at(index)}`,
  pass: false,
  issue,
});

/**
 * A grader's result: its failures, or one passing item when there are none.
 *
 * The passing item matters — a check that returns nothing when the page is clean would leave the
 * verdict silent about a rule that was genuinely verified.
 */
export const summarize = (id: string, label: string, failures: ReviewItem[]): ReviewItem[] =>
  failures.length > 0 ? failures : [{ item: `${id} (${label})`, pass: true, issue: null }];
