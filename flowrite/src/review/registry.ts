import type { Check } from './check.ts';
import { CODE_CHECKS } from './code/index.ts';
import { referencesCheck } from './code/references.ts';
import { coverageCheck } from './coverage.ts';
import { checklistCheck, llmStyleCheck } from './llm.ts';

/**
 * Everything a document kind contributes to its review.
 *
 * Four fields, which is exactly what the three old review tools differed by — the rest of their bodies
 * was identical and already shared. Adding a kind is one of these, not a new file.
 */
export interface KindReview {
  /** The kind's checklist, injected into the reviewer's task (skills cannot vary per delegated task). */
  checklistDoc: string;
  /** Noun for the delegation prompt, e.g. 'data type reference page'. */
  promptNoun: string;
  /** Fenced header label, e.g. 'REFERENCE PAGE'. */
  headerLabel: string;
  /** Types whose method coverage this kind checks: none for a tutorial, one or many for a reference. */
  coverageTypes: string[];
  /** Where a given type's members are documented — a flat page documents them all in one file. */
  pagePathFor(typeName: string): string;
}

/**
 * The checks one review runs, cheapest first.
 *
 * Order is load-bearing for cost, not for correctness: the fifteen mechanical checks and the coverage
 * checks are deterministic and free, so they run before anything reaches a model. A page that fails
 * them still pays for the llm checks on the same pass — the writer gets one complete verdict rather
 * than a trickle — but a targeted repeat that touches only mechanical ids costs nothing at all.
 */
export function buildChecks(kind: KindReview): Check[] {
  return [
    ...CODE_CHECKS,
    // Not in CODE_CHECKS because that list drives `applyFixes` and holds only style rules — this one
    // checks the world outside the page and can never repair itself. Still `kind: 'code'`, so it costs
    // nothing and re-runs on every narrowed pass.
    referencesCheck,
    ...kind.coverageTypes.map((typeName) => coverageCheck(typeName, kind.pagePathFor(typeName))),
    llmStyleCheck,
    checklistCheck(kind),
  ];
}
