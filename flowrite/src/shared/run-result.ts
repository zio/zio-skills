import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { failingReviewItems, getLastReview } from '../review/run.ts';
import { insightsSchema } from './schemas.ts';

/**
 * The end-of-run report every docs writer files: where the page landed, what it did, the review's
 * verdict, and the run retrospective.
 *
 * This existed as the deleted workflow's `outputSchema`, collected by a closing
 * `session.prompt(..., { result })` and logged as three lines. Losing the workflow
 * lost the retrospective with it: `scripts/archive-docs.sh` parses a
 * `<label> run insights: <json>` line into `insights.json`, and that line stopped
 * being emitted, so run friction silently stopped being captured across turns —
 * which is the whole point of archiving it.
 *
 * A model-callable tool rather than a hook, because only the model can author the
 * retrospective. The shared run directive tells it to call this last.
 *
 * Logged with `console.error`, not `log.info`: the CLI printer renders a tool's
 * logger output where the archive script cannot see it, while stderr lands in the
 * captured run log next to the token-usage line the same script already parses.
 * Stdout stays reserved for the reply so `--json` keeps parsing.
 */

/** What the model claims the review concluded. Checked against the real review below. */
const claimedVerdict = v.picklist(['passed', 'failed', 'not-reviewed']);

export function createReportRunResultTool(label: string) {
  return defineTool({
    name: 'report_run_result',
    description:
      'File the end-of-run report: the finished page path, the review verdict, a one-line summary, ' +
      'and the run retrospective. Call this once, last, after the page is written and reviewed.',
    input: v.object({
      path: v.pipe(v.string(), v.description('Repo-relative path of the finished page')),
      reviewVerdict: v.pipe(
        claimedVerdict,
        v.description(
          'What the review concluded: "passed" only when every checklist item passed, "failed" ' +
            'when any item still fails, "not-reviewed" when no review ran. Checked against the ' +
            'recorded review — a wrong value is rejected.',
        ),
      ),
      summary: v.pipe(
        v.string(),
        v.description(
          'One line: what was produced. When the review failed, say so here and name what is ' +
            'still wrong — do not describe a failing page as complete.',
        ),
      ),
      insights: insightsSchema,
    }),
    output: v.object({
      recorded: v.boolean(),
      reviewPassed: v.nullable(v.boolean()),
      failingItems: v.array(v.string()),
    }),
    run({ data }) {
      // The verdict is taken from the review, never from the summary prose. Two runs filed
      // "Complete Prism reference page with … working mdoc examples (0 errors)" over a review that
      // had returned `passed: false` with two named writing-style failures — once before the writers
      // were merged and once after, so it is a general problem and not a quirk of either shape. The
      // standing instruction not to describe a failing page as passing did not prevent it: the model
      // is summarising an hour of its own work, and nothing in a sentence tells the code it is false.
      const review = getLastReview();
      const actual = review === null ? 'not-reviewed' : review.passed ? 'passed' : 'failed';
      const failingItems = failingReviewItems();

      // Rejected rather than silently corrected, so the model has to restate the truth itself: the
      // record it files and the reply it writes to the user come from the same turn, and only the
      // model can fix the reply. A tool error reads to it as an instruction — the same mechanism the
      // phase guard and the review cap rely on.
      if (data.reviewVerdict !== actual) {
        throw new Error(
          `reviewVerdict was "${data.reviewVerdict}" but the recorded review says "${actual}"` +
            (failingItems.length > 0 ? ` (still failing: ${failingItems.join('; ')})` : '') +
            `. File the report again with reviewVerdict "${actual}", and say so in your summary ` +
            `and in your reply — do not describe a failing page as complete.`,
        );
      }

      console.error(`${label} run summary: ${data.path} — ${data.summary}`);
      // Its own line, parsed into verdict.json by archive-docs.sh, so a run's pass/fail survives in
      // the archive as data rather than as a sentence someone has to interpret.
      console.error(
        `${label} run verdict: ${JSON.stringify({ passed: review?.passed ?? null, failingItems })}`,
      );
      console.error(`${label} run insights: ${JSON.stringify(data.insights)}`);

      // Echoed back so the facts are in front of the model as it writes its closing reply.
      return { output: { recorded: true, reviewPassed: review?.passed ?? null, failingItems } };
    },
  });
}
