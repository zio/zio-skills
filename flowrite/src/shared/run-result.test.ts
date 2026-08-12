// The verdict gate on report_run_result.
//
// This exists because the prose instruction it replaces was measured failing twice: told to "report
// the review's actual verdict … do not describe a failing page as passing", the writer filed
// "Complete Prism reference page with … working mdoc examples (0 errors)" over a review that had
// returned `passed: false` with two named writing-style failures. Once before the three writers were
// merged and once after, so the shape of the agent was never the cause.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createReportRunResultTool } from './run-result.ts';
import { __setLastReviewForTests } from '../review/run.ts';

const tool = createReportRunResultTool('write-data-type-ref');

/**
 * Call the tool with an otherwise-valid report, varying only the verdict.
 *
 * `run` is invoked through an `unknown` signature because a real ToolContext carries a harness,
 * sandbox and logger that this tool never touches — constructing one would be fabricating a runtime
 * to test four lines of comparison.
 */
const run = (reviewVerdict: 'passed' | 'failed' | 'not-reviewed') =>
  (tool.run as (arg: unknown) => unknown)({
    data: {
      path: 'docs/reference/prism.md',
      reviewVerdict,
      summary: 'A Prism reference page.',
      insights: [],
    },
  });

test('a truthful "failed" is accepted and carries the failing items', async () => {
  __setLastReviewForTests({
    passed: false,
    items: [
      { item: 'Method coverage (100%)', pass: true, issue: null },
      { item: 'writing-style rule 7 @ line 402', pass: false, issue: 'sibling types not linked' },
    ],
  });

  const result = (await run('failed')) as {
    output: { recorded: boolean; reviewPassed: boolean | null; failingItems: string[] };
  };
  assert.equal(result.output.recorded, true);
  assert.equal(result.output.reviewPassed, false);
  assert.deepEqual(result.output.failingItems, ['writing-style rule 7 @ line 402']);
});

test('claiming "passed" over a failing review is rejected', async () => {
  __setLastReviewForTests({
    passed: false,
    items: [{ item: 'writing-style rule 7 @ line 402', pass: false, issue: 'sibling types not linked' }],
  });

  await assert.rejects(async () => {
    await run('passed');
  }, (err: Error) => {
    // The error has to name the real verdict and the outstanding items: it is the retry prompt, so
    // the model must be able to refile correctly from it alone.
    assert.match(err.message, /recorded review says "failed"/);
    assert.match(err.message, /writing-style rule 7 @ line 402/);
    return true;
  });
});

test('claiming "failed" over a passing review is rejected too', async () => {
  // The gate is symmetric on purpose. Under-claiming corrupts the archive's history just as much,
  // and it would let a run bury a real pass behind invented friction.
  __setLastReviewForTests({ passed: true, items: [{ item: 'Method coverage (100%)', pass: true, issue: null }] });

  await assert.rejects(async () => {
    await run('failed');
  }, /recorded review says "passed"/);
});

test('with no review at all, only "not-reviewed" is accepted', async () => {
  __setLastReviewForTests(null);

  const result = (await run('not-reviewed')) as { output: { reviewPassed: boolean | null } };
  assert.equal(result.output.reviewPassed, null);

  await assert.rejects(async () => {
    await run('passed');
  }, /recorded review says "not-reviewed"/);
});
