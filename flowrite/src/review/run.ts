import type { FlueHarness, FlueLogger } from '@flue/runtime';
import type * as v from 'valibot';
import type { Check, CheckContext, ReviewItem } from './check.ts';
import { idsOf } from './check.ts';
import type { reviewSchema } from '../shared/schemas.ts';

type ReviewResult = v.InferOutput<typeof reviewSchema>;

/**
 * The last review, what each check contributed to it, and the ids that failed.
 *
 * Module-level state, like the call counter it replaces: this repo runs one OS process per run (each
 * run-*.sh execs a fresh node), a run only ever exercises one document kind, and the tool context
 * exposes no run id to key on. It would need a real per-run key if these ever ran inside a long-lived
 * dev server handling concurrent writers.
 */
let lastReview: ReviewResult | null = null;
let lastByCheck = new Map<string, ReviewItem[]>();
let lastFailedIds: string[] = [];
/** How many passes in a row have failed on exactly the same checks. See STALL_LIMIT. */
let stalls = 0;

/**
 * Consecutive repeats of an identical failing set before the loop is told to stop.
 *
 * Two, not one, and turn17 is why: its failing rules went 19,20 → 19,20 → 19 → clean. One repeated set
 * was a slow repair, not a spin, and stopping there would have shipped two known-fixable violations.
 * Three identical sets is a much better signal that the writer has run out of ideas.
 *
 * This replaces `MAX_REVIEW_CALLS`, and the difference is the point: a call cap punished the cheap
 * confirming pass, so a fixed page kept its failing verdict. This bounds only *unproductive* repeats, so
 * a run may review as often as it keeps making progress.
 */
const STALL_LIMIT = 2;

/**
 * The last review result, or null when none ran this process.
 *
 * Read by `report_run_result` so the end-of-run record carries the review's own verdict instead of the
 * model's description of it. With only a prose instruction, two runs filed "Complete Prism reference
 * page …" over a `passed: false` review that had named its failures twice.
 */
export function getLastReview(): ReviewResult | null {
  return lastReview;
}

/** The failing items of the last review, by name. Empty when it passed or none ran. */
export function failingReviewItems(): string[] {
  return (lastReview?.items ?? []).filter((item) => !item.pass).map((item) => item.item);
}

/**
 * The check ids a repeat review would re-run. Exposed for tests and for the tool's log line.
 */
export function pendingCheckIds(): string[] {
  return [...lastFailedIds];
}

/**
 * Seed the cached review from a test. Not for production code.
 *
 * The cache is module state deliberately (see above), which leaves no seam for a test to drive
 * `report_run_result`'s verdict gate. A setter is the smallest opening; the alternative was running a
 * real review, and a real review means a model call.
 */
export function __setLastReviewForTests(result: ReviewResult | null): void {
  lastReview = result;
  lastByCheck = new Map();
  stalls = 0;
  lastFailedIds = [...new Set((result?.items ?? []).filter((i) => !i.pass).map((i) => idOfItem(i.item)))];
}

/**
 * The item-level id an item came from: `'style-15 @ line 42'` → `'style-15'`, `'coverage:Prism (42%)'`
 * → `'coverage:Prism'`.
 *
 * Both suffixes have to go because a failing item carries a line and a passing one carries a label.
 * Without this the ids exist but nothing can recover them from a previous verdict — and then a repeat
 * review could not narrow, which is the entire mechanism that replaced the call cap.
 */
const idOfItem = (item: string): string => item.split(' @ ')[0].split(' (')[0];

/**
 * The ids a repeat run should narrow onto, given what a check just produced.
 *
 * Prefers the precise item-level id (`style-7`, so a repeat re-checks one rule rather than fourteen)
 * and falls back to the check's own id. The fallback is what keeps a failed checklist actionable: the
 * reviewer names its items freely ("Overview section missing"), and no such name would ever match a
 * declared id.
 */
function failingIdsOf(check: Check, produced: ReviewItem[]): string[] {
  const own = new Set(idsOf(check));
  return produced
    .filter((item) => !item.pass)
    .map((item) => (own.has(idOfItem(item.item)) ? idOfItem(item.item) : check.id));
}

/**
 * Run a document kind's checks and record the verdict.
 *
 * Read-only. Nothing here edits the page: the writer owns repairs, and the deterministic ones already
 * ran on the write phase's return path. That is what makes a repeat call meaningful — it re-reads the
 * page as the writer left it, so the recorded verdict describes the page that actually ships. Turn 11
 * shipped a page whose verdict still named a rule the writer had already fixed.
 *
 * There is no call cap. The old one existed because every call redid all seventeen delegations; a
 * repeat now costs at most one, so the expensive pass happens once by construction.
 */
export async function runChecks(opts: {
  checks: Check[];
  harness: FlueHarness;
  log: FlueLogger;
  path: string;
  typeName?: string;
  /** Explicit narrowing from the model. Omitted on a repeat call → whatever failed last time. */
  only?: string[];
}): Promise<ReviewResult> {
  const { checks, harness, log, path } = opts;
  const only = opts.only ?? (lastReview === null ? undefined : lastFailedIds);

  const content = await harness.sandbox.readFile(path);
  const ctx: CheckContext = {
    path,
    content,
    lines: content.split('\n'),
    typeName: opts.typeName,
    harness,
    log,
  };

  // On a narrowed run, every deterministic check runs anyway. They cost nothing, and skipping them
  // would let a repair introduce a fresh mechanical violation that no later pass ever looks at.
  const selected =
    only === undefined
      ? checks
      : checks.filter((check) => check.kind === 'code' || idsOf(check).some((id) => only.includes(id)));

  const delegating = selected.filter((check) => check.kind === 'llm').length;
  log.info(
    `Reviewing ${path}: ${selected.length}/${checks.length} checks, ${delegating} of them delegating` +
      (only === undefined ? '' : ` (targeted: ${only.join(', ') || 'nothing'})`),
  );

  // Sequential, deliberately: the llm checks share one scratch conversation, and the runtime allows
  // "one active operation at a time" on it (reference/agent-api.md) — concurrent delegations would
  // reject with SessionBusyError.
  const produced = new Map<string, ReviewItem[]>();
  for (const check of selected) produced.set(check.id, await check.run(ctx, only));

  // A narrowed run must not shrink the verdict: checks that did not re-run keep the result they last
  // reported, in registry order, so the record always describes every check rather than the subset the
  // model happened to ask about.
  const contribution = (check: Check): ReviewItem[] =>
    produced.get(check.id) ?? lastByCheck.get(check.id) ?? [];
  const items = checks.flatMap(contribution);

  const failedIds = [...new Set(checks.flatMap((check) => failingIdsOf(check, contribution(check))))];

  // Progress check. An identical failing set means the repair attempt changed nothing on those checks;
  // enough of those in a row and the loop is spinning, so say so rather than letting it run forever.
  const sameAsLast =
    failedIds.length > 0 &&
    failedIds.length === lastFailedIds.length &&
    failedIds.every((id) => lastFailedIds.includes(id));
  stalls = sameAsLast ? stalls + 1 : 0;

  if (stalls >= STALL_LIMIT) {
    items.push({
      item: 'Review progress',
      pass: false,
      issue:
        `These checks have failed unchanged for ${stalls + 1} passes: ${failedIds.join(', ')}. ` +
        `Further repair attempts are not landing, so stop reviewing: finish now, and name these as ` +
        `known limitations in your summary and in the run result. The verdict stays "failed".`,
    });
    log.warn(`Review stalled on ${failedIds.join(', ')} for ${stalls + 1} passes — telling the writer to finish`);
  }

  // The verdict is computed here, never self-reported.
  const result: ReviewResult = { passed: items.every((item) => item.pass), items };
  lastReview = result;
  lastByCheck = new Map(checks.map((check) => [check.id, contribution(check)]));
  lastFailedIds = failedIds;
  log.info(
    `Review verdict: passed=${result.passed}` +
      (failedIds.length > 0 ? `, re-check with only: ${failedIds.join(', ')}` : ''),
  );
  return result;
}
