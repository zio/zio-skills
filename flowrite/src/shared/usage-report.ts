import { useAgentFinish } from '@flue/runtime';
import { trackTokenUsage, type TokenUsageTracker } from './token-usage.ts';
import { trackComponentUsage, type ComponentUsageTracker } from './component-usage.ts';
import { guardRefusals } from './phase-guard.ts';
import { failingReviewItems, getLastReview } from '../review/run.ts';
import { buildRunReport } from './run-report.ts';

/**
 * Per-run token, cost, and per-component usage reporting.
 *
 * This lived in the deleted workflow wrapper's `finally` block, which was the only
 * caller of the two trackers. Without it a run produces no cost figures at all,
 * which breaks both the "observable by construction" property and any comparison
 * against an archived run.
 *
 * Tracking starts at module load rather than in a hook: `observe()` is
 * process-global, one process serves one run, and the trackers must be subscribed
 * before the first turn — earlier than any render. Reporting hangs off
 * `useAgentFinish`, whose callbacks run at least once, so a guard keeps the summary
 * to a single emission.
 *
 * Logs go to stderr: `flue run` reserves stdout for the reply, and `--json` expects
 * it to parse.
 */
const g = globalThis as {
  __flowriteUsage?: { tokens: TokenUsageTracker; components: ComponentUsageTracker; reported: boolean };
};

function trackers() {
  g.__flowriteUsage ??= { tokens: trackTokenUsage(), components: trackComponentUsage(), reported: false };
  return g.__flowriteUsage;
}

function report(label: string): void {
  const state = trackers();
  if (state.reported) return;
  state.reported = true;

  const t = state.tokens.stop();
  console.error(
    `${label} token consumption: ${t.totalTokens} tokens ` +
      `(in ${t.input}, out ${t.output}, cacheRead ${t.cacheRead}, cacheWrite ${t.cacheWrite}) ` +
      `across ${t.turns} turns, cost $${t.cost.toFixed(4)}`,
  );
  // The report proper: cost per phase, cost per role, what the run did as counts, the review's
  // verdict, and computed flags. It answers "which phase cost the most" and "what looks wrong",
  // neither of which the component view below can — every phase's own harness turns collapse into
  // `agent:default` there, which is why that one line dominates while each phase reports zero.
  const components = state.components.report();
  console.error(
    `${label} run report: ${JSON.stringify(
      buildRunReport({
        totals: t,
        components,
        phases: state.components.phases(),
        activity: state.components.activity(),
        refusals: guardRefusals(),
        verdict: { passed: getLastReview()?.passed ?? null, failingItems: failingReviewItems() },
      }),
    )}`,
  );
  // Kept as-is: it is the reconciliation anchor (own + delegate must equal `agent:default` plus the
  // roles) and the archive's historical continuity — every earlier turn has this shape.
  console.error(`${label} component usage: ${JSON.stringify(state.components.stop())}`);
}

// Subscribe at import time, before the first turn.
trackers();

/**
 * Declare the end-of-run usage summary. Root render only — useAgentFinish throws in
 * a delegate.
 *
 * Reported from two places, whichever comes first. `useAgentFinish` is the normal
 * path, but it does not run when a submission settles `failed` — a timeout or crash
 * would otherwise discard the cost of the run you most want the number for (a
 * module reference that blew the submission deadline reported nothing at all). The
 * process-exit hook is the backstop, and the `reported` guard keeps it to one
 * summary either way.
 */
export function useUsageReport(label: string): void {
  const g2 = globalThis as { __flowriteUsageExitHook?: boolean };
  if (!g2.__flowriteUsageExitHook) {
    g2.__flowriteUsageExitHook = true;
    process.once('exit', () => report(label));
  }
  useAgentFinish(() => report(label));
}
