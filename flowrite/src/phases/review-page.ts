import { type FlueHarness, type FlueLogger, defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { isPhaseSkipped } from '../shared/skip-phases.ts';
import { reviewSchema } from '../shared/schemas.ts';
import { buildChecks, type KindReview } from '../review/registry.ts';
import { runChecks } from '../review/run.ts';
import { toKebabCase } from './write-data-type-reference.ts';
// Each kind's checklist, injected into the generic reviewer's task (skills are role-owned and cannot
// vary per delegated task). Same source-of-truth split as writing-style/references/rules.md.
import dataTypeChecklistDoc from '../skills/data-type-ref-checklist/references/checklist.md';
import moduleChecklistDoc from '../skills/module-ref-checklist/references/checklist.md';
import tutorialChecklistDoc from '../skills/tutorial-checklist/references/checklist.md';

/**
 * The three review tools, over one shared body.
 *
 * This file replaces review-data-type-ref.ts, review-module-ref.ts and review-tutorial.ts, which
 * differed by four fields and shared everything else through `runCappedReview`. What is left per kind is
 * an input schema and a `KindReview` — the schema stays per-kind on purpose, because it is where the
 * model is told what to pass, and a module review genuinely needs every type name while a tutorial
 * needs only a path.
 */

/** The two input fields every review shares. */
const path = v.pipe(v.string(), v.description('Path to the page to review, e.g. docs/reference/prism.md'));
const only = v.pipe(
  v.optional(v.array(v.string())),
  v.description(
    'Check ids to re-run, as the previous review printed them (e.g. ["style-7","checklist"]). ' +
      'Omit on a repeat call and only the previously failing checks run. A repeat is cheap — after ' +
      'fixing the failures, call review again to confirm.',
  ),
);

/** Wording shared by all three tool descriptions: what the tool does NOT do. */
const READ_ONLY =
  'Read-only — fix the failures yourself, then call it again to confirm (a repeat re-checks only what failed).';

type ReviewOutput = v.InferOutput<typeof reviewSchema>;

/**
 * The shared body: skip gate, build the kind's checks, run them, return the verdict.
 *
 * Nothing here edits the page. The writer owns repairs, and the deterministic ones already ran on the
 * write phase's return path — which is what makes a repeat call meaningful, since it re-reads the page
 * as the writer left it. Turn 11 shipped a page whose recorded verdict still named a rule the writer had
 * already fixed.
 */
async function reviewPage(opts: {
  harness: FlueHarness;
  log: FlueLogger;
  path: string;
  only?: string[];
  kind: KindReview;
  typeName?: string;
}): Promise<ReviewOutput> {
  if (isPhaseSkipped('review')) {
    opts.log.info('Skipping review (skipPhases)');
    return { passed: true, items: [{ item: 'Review', pass: true, issue: 'Skipped by request.' }] };
  }
  return runChecks({
    checks: buildChecks(opts.kind),
    harness: opts.harness,
    log: opts.log,
    path: opts.path,
    typeName: opts.typeName,
    only: opts.only,
  });
}

/**
 * Review a data type reference page.
 *
 * The single quality gate for a reference page: fifteen deterministic style checks, method coverage for
 * the documented type, the model-judged style rules, and the data-type-ref-checklist.
 */
export const reviewDataTypeRef = defineTool({
  name: 'review_data_type_ref',
  description:
    'Review a data type reference page: mechanical style checks + method coverage + model-judged style ' +
    `+ the data-type-ref-checklist. ${READ_ONLY}`,
  harness: true,
  input: v.object({
    path,
    only,
    typeName: v.pipe(v.string(), v.description('The documented type, e.g. "Chunk" — used for method coverage')),
  }),
  output: reviewSchema,
  async run({ harness, data, log }) {
    return {
      output: await reviewPage({
        harness,
        log,
        path: data.path,
        only: data.only,
        typeName: data.typeName,
        kind: {
          checklistDoc: dataTypeChecklistDoc,
          promptNoun: 'data type reference page',
          headerLabel: 'REFERENCE PAGE',
          coverageTypes: [data.typeName],
          pagePathFor: () => data.path,
        },
      }),
    };
  },
});

/**
 * Review a module reference.
 *
 * Coverage runs per documented type, and costs nothing per type because it is deterministic. It
 * deliberately does NOT run a full per-type checklist on every subpage — that is the N×LLM cost the
 * design cut.
 */
export const reviewModuleRef = defineTool({
  name: 'review_module_ref',
  description:
    'Review a module reference: mechanical style checks + per-type method coverage + model-judged style ' +
    `+ the module-ref-checklist on the module page. ${READ_ONLY}`,
  harness: true,
  input: v.object({
    path: v.pipe(
      v.string(),
      v.description('The module page reviewed against the checklist: the flat page or the hierarchical index'),
    ),
    only,
    layout: v.picklist(['flat', 'hierarchical']),
    moduleName: v.pipe(v.string(), v.description('The module name — used to locate hierarchical subpages')),
    typeNames: v.pipe(
      v.array(v.string()),
      v.description('Every documented type name — one method-coverage check runs per type'),
    ),
  }),
  output: reviewSchema,
  async run({ harness, data, log }) {
    return {
      output: await reviewPage({
        harness,
        log,
        path: data.path,
        only: data.only,
        kind: {
          checklistDoc: moduleChecklistDoc,
          promptNoun: 'module reference page',
          headerLabel: 'MODULE REFERENCE',
          coverageTypes: data.typeNames,
          // Flat: every type is documented in the single page under review. Hierarchical: each type has
          // its own subpage under docs/reference/<module>/<type>.md.
          pagePathFor: (typeName) =>
            data.layout === 'flat'
              ? data.path
              : `docs/reference/${toKebabCase(data.moduleName)}/${toKebabCase(typeName)}.md`,
        },
      }),
    };
  },
});

/** Review a tutorial. No coverage checks — a tutorial is selective by design. */
export const reviewTutorial = defineTool({
  name: 'review_tutorial',
  description:
    `Review a tutorial: mechanical style checks + model-judged style + the tutorial-checklist. ${READ_ONLY}`,
  harness: true,
  input: v.object({ path, only }),
  output: reviewSchema,
  async run({ harness, data, log }) {
    return {
      output: await reviewPage({
        harness,
        log,
        path: data.path,
        only: data.only,
        kind: {
          checklistDoc: tutorialChecklistDoc,
          promptNoun: 'tutorial',
          headerLabel: 'TUTORIAL',
          coverageTypes: [],
          pagePathFor: (typeName) => typeName,
        },
      }),
    };
  },
});
