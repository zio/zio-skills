import type { CrossrefState } from '../../lib/schemas.js';
import { meetsThreshold } from '../utils/confidence.js';

export function printIterationSummary(
  pageTitle: string,
  processed: number,
  total: number,
  applied: number,
  queued: number,
  thisIn: number,
  thisOut: number,
  totalIn: number,
  totalOut: number,
  totalCost: number
) {
  console.log(
    `✓ Processed: ${pageTitle} (${processed}/${total})  |  Applied: ${applied} links  |  Queued: ${queued}`
  );
  console.log(`  Tokens this run — in: ${thisIn.toLocaleString()}  out: ${thisOut.toLocaleString()}`);
  console.log(
    `  Tokens total    — in: ${totalIn.toLocaleString()}  out: ${totalOut.toLocaleString()}  (~$${totalCost.toFixed(2)})`
  );
}

export function report(
  state: CrossrefState,
  threshold: 'low' | 'medium' | 'high'
) {
  const applied = state.suggestions.filter(s => s.status === 'applied');
  const skipped = state.suggestions.filter(s => s.status === 'skipped');
  const pending = state.suggestions.filter(s => s.status === 'pending');
  const pendingHigh = pending.filter(s => s.confidence === 'high');
  const pendingMedium = pending.filter(s => s.confidence === 'medium');
  const pendingLow = pending.filter(s => s.confidence === 'low');
  const readyToApply = pending.filter(s => meetsThreshold(s.confidence, threshold));

  const totalPages = state.index.length;
  const totalApplied = applied.length;

  const linkedTargets = new Set([
    ...applied.map(s => s.targetId),
    ...readyToApply.map(s => s.targetId),
  ]);
  const orphans = state.index.filter(e => !linkedTargets.has(e.id));

  const lines: string[] = [
    ``,
    `Cross-Reference Coverage Report  (confidenceThreshold: ${threshold})`,
    `=`.repeat(60),
    `Total pages:   ${state.index.length}`,
    `Processed:     ${state.processed.length} (${Math.round(state.processed.length / state.index.length * 100)}%)`,
    `Pending:       ${state.index.length - state.processed.length}`,
    ``,
    `Suggestions:`,
    `  applied:  ${applied.length}`,
    `  skipped:  ${skipped.length}`,
    `  pending:  ${pending.length}  (${pendingHigh.length} high, ${pendingMedium.length} medium, ${pendingLow.length} low)`,
    readyToApply.length > 0
      ? `             ^--- ${readyToApply.length} meet threshold — run 'step' or 'autopilot' to apply`
      : `             ^--- none meet threshold`,
    ``,
    `Overall applied links: ${totalApplied} / ${totalPages} pages have outgoing links`,
    ``,
    `Orphan pages (no incoming applied or pending-${threshold} links): ${orphans.length}`,
    ...orphans.slice(0, 10).map(e => `  - ${e.path}`),
    orphans.length > 10 ? `  (${orphans.length - 10} more...)` : '',
    ``,
    `Token spend to date: in ${state.tokens.inputTotal.toLocaleString()}  out ${state.tokens.outputTotal.toLocaleString()}  (~$${state.tokens.runningCost.toFixed(2)})`,
    ``,
  ];

  console.log(lines.filter(l => l !== undefined).join('\n'));
  return { orphans: orphans.length, applied: applied.length, pending: pending.length };
}
