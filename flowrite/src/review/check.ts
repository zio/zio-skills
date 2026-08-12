import type { FlueHarness, FlueLogger } from '@flue/runtime';
import type * as v from 'valibot';
import type { reviewSchema } from '../shared/schemas.ts';

/**
 * One row of a review verdict.
 *
 * Derived from `reviewSchema` rather than declared again, so a check can never produce a shape the
 * review tool's output schema would reject at runtime.
 */
export type ReviewItem = v.InferOutput<typeof reviewSchema>['items'][number];

/**
 * Everything a check may look at.
 *
 * The page is read ONCE by the runner and shared, so twenty checks cost one file read. `lines` is
 * precomputed for the same reason: nearly every mechanical check wants line numbers, and splitting
 * per check would be twenty passes over the same string.
 */
export interface CheckContext {
  /** Repo-relative path, e.g. `docs/reference/prism.md`. For messages — the runner does the reading. */
  path: string;
  content: string;
  lines: string[];
  /** The documented type, when the doc kind has one. Used by the coverage checks. */
  typeName?: string;
  /** Only `kind: 'llm'` checks touch these. */
  harness: FlueHarness;
  log: FlueLogger;
}

/**
 * One nameable quality question about a page.
 *
 * The id is the whole point of the abstraction. Before it, the review phase could not express
 * "re-check only rule 7" — so a second review had to redo everything, so it had to be capped, so a
 * fixed page kept its failing verdict. An addressable check makes a repeat review cheap, and a cheap
 * repeat needs no cap.
 */
export interface Check {
  /** Stable id: `style-15`, `style-7-form`, `coverage:Prism`, `checklist`. */
  id: string;
  kind: 'code' | 'llm';
  /**
   * Every item id this check can produce. Defaults to `[id]`.
   *
   * Declared so `only` can narrow work INSIDE a check rather than merely selecting between checks.
   * That distinction is load-bearing for the llm style check: it owns fourteen rule ids but batches
   * them into two delegations, because each delegation costs the phase's scratch conversation about
   * two turns of an ever-growing context. Fourteen separate checks would mean fourteen relay
   * round-trips — worse than the loop this replaces.
   */
  covers?: string[];
  /** `only` is the subset of `covers` still worth checking; `undefined` means all of them. */
  run(ctx: CheckContext, only?: string[]): Promise<ReviewItem[]>;
  /**
   * A deterministic repair.
   *
   * Code checks only, and never called by review — review is read-only, and the write phase applies
   * these on its return path so no model is involved and nothing can skip them. Must be idempotent
   * (`fix(fix(x)) === fix(x)`); `applyFixes` loops until the text settles and there is a test.
   */
  fix?(content: string): string;
}

/**
 * Every id that should select this check for a re-run: its own, plus everything it covers.
 *
 * The check's own id has to be in here even when `covers` is set. A check can report a failure that
 * belongs to no single covered id — the batched style check does exactly that when it cannot prove the
 * page reached the checker — and such an item narrows to the check id. Returning only `covers` would
 * leave that id matching nothing, so the repeat would skip the check, carry forward no items for it,
 * and turn the unverified failure into a passing verdict.
 */
export const idsOf = (check: Check): string[] =>
  check.covers === undefined ? [check.id] : [check.id, ...check.covers];
