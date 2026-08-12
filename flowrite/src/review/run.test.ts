// The review runner: what a repeat call re-runs, and what the recorded verdict says afterwards.
//
// This is where the old design's two defects were fixed, so both are pinned here: a repeat must be cheap
// (it re-runs one delegating check, not all of them) and it must not lie (turn 11 shipped a page whose
// verdict still named a rule the writer had already fixed).
import assert from 'node:assert/strict';
import test from 'node:test';

import type { FlueHarness, FlueLogger } from '@flue/runtime';
import type { Check, ReviewItem } from './check.ts';
import { __setLastReviewForTests, getLastReview, pendingCheckIds, runChecks } from './run.ts';

const log = { info() {}, warn() {}, error() {} } as unknown as FlueLogger;

/** A harness whose sandbox serves whatever the test currently calls the page. */
function harnessOver(page: () => string): FlueHarness {
  return { sandbox: { async readFile() { return page(); } } } as unknown as FlueHarness;
}

/** A deterministic check that fails while its marker is in the page. Counts its own runs. */
function codeCheck(id: string, marker: string) {
  const check: Check & { runs: number } = {
    id,
    kind: 'code',
    runs: 0,
    async run(ctx) {
      check.runs++;
      return ctx.content.includes(marker)
        ? [{ item: `${id} @ line 1`, pass: false, issue: `${marker} present` }]
        : [{ item: `${id} (clean)`, pass: true, issue: null }];
    },
  };
  return check;
}

/** A delegating check owning one rule id, so narrowing can select it. */
function llmCheck(marker: string) {
  const check: Check & { runs: number } = {
    id: 'style-llm',
    kind: 'llm',
    covers: ['style-7', 'style-9'],
    runs: 0,
    async run(ctx) {
      check.runs++;
      return ctx.content.includes(marker)
        ? [{ item: 'style-7 @ line 4', pass: false, issue: 'Sibling type is not linked.' }]
        : [{ item: 'Writing style (2 model-judged rules)', pass: true, issue: null }];
    },
  };
  return check;
}

/** The checklist: it names its items freely, so none of them ever matches a declared id. */
function checklistCheck(marker: string) {
  const check: Check & { runs: number } = {
    id: 'checklist',
    kind: 'llm',
    runs: 0,
    async run(ctx) {
      check.runs++;
      const item: ReviewItem = ctx.content.includes(marker)
        ? { item: 'Overview section', pass: false, issue: 'The page has no Overview.' }
        : { item: 'Overview section', pass: true, issue: null };
      return [item];
    },
  };
  return check;
}

test('a full review runs every check and computes the verdict from all of them', async () => {
  __setLastReviewForTests(null);
  const code = codeCheck('style-15', 'BAD15');
  const style = llmCheck('BAD7');
  const list = checklistCheck('NOLIST');
  const result = await runChecks({
    checks: [code, style, list],
    harness: harnessOver(() => 'clean page'),
    log,
    path: 'docs/reference/prism.md',
  });

  assert.equal(result.passed, true);
  assert.equal(result.items.length, 3);
  assert.deepEqual([code.runs, style.runs, list.runs], [1, 1, 1]);
});

test('a repeat call re-checks only what failed, and keeps every deterministic check', async () => {
  __setLastReviewForTests(null);
  const code = codeCheck('style-15', 'BAD15');
  const style = llmCheck('BAD7');
  const list = checklistCheck('NOLIST');
  const checks = [code, style, list];
  let page = 'BAD7 only';

  const first = await runChecks({ checks, harness: harnessOver(() => page), log, path: 'p.md' });
  assert.equal(first.passed, false);
  assert.deepEqual(pendingCheckIds(), ['style-7']);

  // The writer fixes it and calls review again with no arguments.
  page = 'fixed page';
  const second = await runChecks({ checks, harness: harnessOver(() => page), log, path: 'p.md' });

  assert.equal(second.passed, true);
  // The delegating checklist was NOT re-run: it passed, and a delegation is what review costs.
  assert.equal(list.runs, 1);
  assert.equal(style.runs, 2);
  // Deterministic checks always run again — they are free, and a repair can introduce a new violation.
  assert.equal(code.runs, 2);
});

test('a narrowed review still reports every check, not just the subset it ran', async () => {
  __setLastReviewForTests(null);
  const code = codeCheck('style-15', 'BAD15');
  const style = llmCheck('BAD7');
  const list = checklistCheck('NOLIST');
  const checks = [code, style, list];
  let page = 'BAD7 only';

  await runChecks({ checks, harness: harnessOver(() => page), log, path: 'p.md' });
  page = 'fixed page';
  const second = await runChecks({ checks, harness: harnessOver(() => page), log, path: 'p.md' });

  // Three checks, three items — the checklist's passing item is carried forward rather than dropped.
  assert.equal(second.items.length, 3);
  assert.ok(second.items.some((item) => item.item === 'Overview section' && item.pass));
});

test('a repair that breaks a different rule is caught by the repeat', async () => {
  // The reason every deterministic check re-runs on a narrowed pass. Skipping them would let the fix
  // for one rule introduce a violation of another that nothing ever looks at again.
  __setLastReviewForTests(null);
  const code = codeCheck('style-15', 'BAD15');
  const style = llmCheck('BAD7');
  const checks = [code, style];
  let page = 'BAD7 only';

  await runChecks({ checks, harness: harnessOver(() => page), log, path: 'p.md' });
  page = 'BAD15 now'; // rule 7 fixed, rule 15 broken by the same edit
  const second = await runChecks({ checks, harness: harnessOver(() => page), log, path: 'p.md' });

  assert.equal(second.passed, false);
  assert.ok(second.items.some((item) => item.item.startsWith('style-15') && !item.pass));
});

test('a failed checklist narrows onto the checklist check itself', async () => {
  // The reviewer names its items freely ("Overview section"), so no such name matches a declared id.
  // Without the fallback to the check's own id, a failed checklist could never be re-checked.
  __setLastReviewForTests(null);
  const list = checklistCheck('NOLIST');
  const checks = [codeCheck('style-15', 'BAD15'), list];
  let page = 'NOLIST here';

  await runChecks({ checks, harness: harnessOver(() => page), log, path: 'p.md' });
  assert.deepEqual(pendingCheckIds(), ['checklist']);

  page = 'fixed page';
  const second = await runChecks({ checks, harness: harnessOver(() => page), log, path: 'p.md' });
  assert.equal(list.runs, 2);
  assert.equal(second.passed, true);
});

test('the recorded verdict is the one report_run_result reads', async () => {
  __setLastReviewForTests(null);
  const checks = [codeCheck('style-15', 'BAD15')];
  await runChecks({ checks, harness: harnessOver(() => 'BAD15'), log, path: 'p.md' });
  assert.equal(getLastReview()?.passed, false);

  await runChecks({ checks, harness: harnessOver(() => 'clean'), log, path: 'p.md' });
  assert.equal(getLastReview()?.passed, true);
  assert.deepEqual(pendingCheckIds(), []);
});

test('a failure that belongs to no covered id still gets re-run', async () => {
  // The batched style check reports `style-llm (payload unverified)` when it cannot prove the page
  // reached the checker. That item maps to the check's own id, not to any covered rule — so `idsOf` has
  // to include the check id, or the repeat skips the check, carries forward nothing for it, and the
  // unverified failure disappears into a passing verdict.
  __setLastReviewForTests(null);
  let broken = true;
  let runs = 0;
  const style: Check = {
    id: 'style-llm',
    kind: 'llm',
    covers: ['style-7', 'style-9'],
    async run() {
      runs++;
      return broken
        ? [{ item: 'style-llm (payload unverified)', pass: false, issue: 'Page did not arrive.' }]
        : [{ item: 'Writing style (2 model-judged rules)', pass: true, issue: null }];
    },
  };
  const checks = [codeCheck('style-15', 'BAD15'), style];

  const first = await runChecks({ checks, harness: harnessOver(() => 'clean'), log, path: 'p.md' });
  assert.equal(first.passed, false);
  assert.deepEqual(pendingCheckIds(), ['style-llm']);

  broken = false;
  const second = await runChecks({ checks, harness: harnessOver(() => 'clean'), log, path: 'p.md' });
  assert.equal(runs, 2, 'the repeat must re-run the check that failed');
  assert.equal(second.passed, true);
});

test('an unchanged failing set tells the writer to stop, but only after two repeats', async () => {
  // turn17's failing rules went 19,20 -> 19,20 -> 19 -> clean: one repeated set was a SLOW repair, not a
  // spin, and stopping there would have shipped two fixable violations. Three identical sets is the
  // signal. This is what replaced MAX_REVIEW_CALLS, and the difference matters — the old cap punished the
  // cheap confirming pass, so a fixed page kept its failing verdict.
  __setLastReviewForTests(null);
  const checks = [codeCheck('style-15', 'BAD15')];
  const stuck = () => 'BAD15';
  const advisory = (r: { items: ReviewItem[] }) => r.items.find((i) => i.item === 'Review progress');

  const first = await runChecks({ checks, harness: harnessOver(stuck), log, path: 'p.md' });
  assert.equal(advisory(first), undefined, 'no advisory on the first failure');

  const second = await runChecks({ checks, harness: harnessOver(stuck), log, path: 'p.md' });
  assert.equal(advisory(second), undefined, 'one repeat may still be a slow repair');

  const third = await runChecks({ checks, harness: harnessOver(stuck), log, path: 'p.md' });
  const item = advisory(third);
  assert.ok(item, 'two repeats of the same set is a stall');
  assert.equal(item?.pass, false);
  assert.match(item?.issue ?? '', /failed unchanged for 3 passes: style-15/);
  assert.match(item?.issue ?? '', /stop reviewing/);
  assert.equal(third.passed, false);
  // The advisory must not pollute narrowing, or the next pass would try to re-run a check called
  // "Review progress" that does not exist.
  assert.deepEqual(pendingCheckIds(), ['style-15']);
});

test('progress resets the stall counter', async () => {
  __setLastReviewForTests(null);
  const a = codeCheck('style-15', 'BAD15');
  const b = codeCheck('style-22', 'BAD22');
  const checks = [a, b];
  let page = 'BAD15 BAD22';

  await runChecks({ checks, harness: harnessOver(() => page), log, path: 'p.md' });
  await runChecks({ checks, harness: harnessOver(() => page), log, path: 'p.md' });
  // One violation fixed: the set changed, so the count starts over.
  page = 'BAD15';
  const third = await runChecks({ checks, harness: harnessOver(() => page), log, path: 'p.md' });
  assert.equal(third.items.find((i) => i.item === 'Review progress'), undefined);

  const fourth = await runChecks({ checks, harness: harnessOver(() => page), log, path: 'p.md' });
  assert.equal(fourth.items.find((i) => i.item === 'Review progress'), undefined, 'only one repeat so far');
});

test('explicit narrowing wins over the remembered failures', async () => {
  __setLastReviewForTests(null);
  const code = codeCheck('style-15', 'BAD15');
  const style = llmCheck('BAD7');
  const checks = [code, style];

  await runChecks({ checks, harness: harnessOver(() => 'BAD7 only'), log, path: 'p.md' });
  await runChecks({
    checks,
    harness: harnessOver(() => 'BAD7 only'),
    log,
    path: 'p.md',
    only: ['style-9'],
  });
  // style-9 belongs to the llm check, so it re-ran; nothing else delegating exists to run.
  assert.equal(style.runs, 2);
});
