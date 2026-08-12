import type { Check, ReviewItem } from './check.ts';
import { getRepoPath } from '../shared/run-context.ts';
import { computeMethodCoverage } from '../tools/check-method-coverage.ts';

/**
 * Method coverage for one documented type, as a check.
 *
 * Deterministic and free, so it runs on every review including a targeted repeat. A model must never
 * be the one to report "I documented everything"; this is the code that decides it.
 *
 * `pagePath` is separate from the type because a hierarchical module reference documents each type on
 * its own subpage, while a flat one documents them all in the page under review.
 */
export function coverageCheck(typeName: string, pagePath: string): Check {
  return {
    id: `coverage:${typeName}`,
    kind: 'code',
    async run() {
      const coverage = await computeMethodCoverage(getRepoPath(), typeName, pagePath);
      const found = coverage.sourceFiles.length > 0;

      // A type whose source cannot be found is NOT a pass. computeMethodCoverage returns `missing: []`
      // in that case, so the old `missing.length === 0` test let a misspelled type name ship at 0%
      // coverage with a green check.
      if (!found) {
        const item: ReviewItem = {
          item: `coverage:${typeName} (no source found)`,
          pass: false,
          issue:
            `No source file named ${typeName}.scala was found under a src/main tree, so coverage ` +
            `could not be computed. Check the type name, or document why the type has no source of ` +
            `its own.`,
        };
        return [item];
      }

      return [
        {
          item: `coverage:${typeName} (${coverage.coveragePercent}%)`,
          pass: coverage.missing.length === 0,
          issue:
            coverage.missing.length === 0
              ? null
              : `Undocumented public members of ${typeName} (heuristic — verify against source, then ` +
                `document or justify): ${coverage.missing.join(', ')}. ${coverage.note}`,
        },
      ];
    },
  };
}
