import {
  type SkillReference,
  type ToolDefinition,
  useInitialData,
  useInstruction,
  useSandbox,
  useSkill,
  useSubagent,
  useTool,
} from '@flue/runtime';
import { local } from '@flue/runtime/node';
import * as v from 'valibot';

// reusable baseline (supplies model tier + the writing-style skill)
import { useDocsAuthorBase } from './docs-author-base.ts';
import { guardPhase, guardRootOnly } from './phase-guard.ts';
import { type DocKind, getRepoPath, setRunContext, skippedPhases } from './run-context.ts';
import { createReportRunResultTool } from './self-report.ts';
import { useUsageReport } from './usage-report.ts';

// role delegates — the generic, document-kind-neutral roles shared by every docs
// writer; the kind-specific focus/schema/checklist is supplied by each phase tool
// at its delegation call site. The design/write/review phases delegate to narrow
// roles declaring no phase tools of their own, avoiding the self-recursion hazard
// of prompting the calling agent's own conversation.
import { researcher } from '../subagents/researcher.ts';
import { designer } from '../subagents/designer.ts';
import { drafter } from '../subagents/drafter.ts';
import { reviewer } from '../subagents/reviewer.ts';
import { examplesBuilder } from '../subagents/examples-builder.ts';
import { docsIntegrator } from '../subagents/docs-integrator.ts';
import { fixer } from '../subagents/fixer.ts';

import { createGhQueryTool } from '../tools/repo-tools.ts';

/**
 * How a docs writer is assembled: the hooks the agent module calls, and the creation data it accepts.
 *
 * This is not an agent — it declares no `'use agent'` and has no durable identity of its own. It is
 * the composition the one real agent (`src/agent.ts`) calls into, split out because the setup divides
 * cleanly in two: `useRunBasics` runs on EVERY render including the classification turn, while
 * `useDocsWriter` runs only once the kind is known.
 *
 * It was called docs-writer.ts, which is also the agent's filename — two editor tabs with the same
 * label, one of them the agent and one of them this.
 */

const ROLES = [researcher, designer, drafter, reviewer, examplesBuilder, docsIntegrator, fixer];

const skipPhase = v.picklist([
  'research',
  'design',
  'write',
  'write-examples',
  'fact-check',
  'integrate',
  'review',
]);

/**
 * The creation-data fields every docs writer takes. Each writer spreads these into
 * its own `initialData` static alongside its subject field (`typeName`, `topic`,
 * `moduleName`).
 *
 * Replaces the deleted workflows' input schemas. Validated once at the instance's
 * first contact, before anything durable is admitted, and read back with
 * `useInitialData()` — which is what retired the SKIP_PHASES/USER_PROMPT env channel
 * and its request-cloning middleware (see run-context.ts). REPO_PATH survives, not
 * as that channel but as an ordinary override for `projectPath`.
 */
export const docsWriterFields = {
  projectPath: v.pipe(
    v.optional(v.string()),
    v.description(
      'Absolute path to the ZIO library checkout to document. Omit to fall back to ' +
        'REPO_PATH, then to the process working directory.',
    ),
  ),
  // Module-run escape hatches. They stay in creation data because no sentence can express them
  // with schema validation, and run-module-ref.sh uses them to force a layout while testing.
  // Ignored by the other kinds.
  layout: v.pipe(
    v.optional(v.picklist(['flat', 'hierarchical'])),
    v.description('Module runs only: force the page layout; omit to let the design phase decide.'),
  ),
  shapeOverride: v.pipe(
    v.optional(v.picklist(['single-core', 'core-family', 'multi-domain', 'dsl'])),
    v.description(
      'Module runs only: force the module shape instead of letting the design phase classify. ' +
        'single-core = one dominant core type (flat); core-family = several co-equal core types, one domain (hierarchical); ' +
        'multi-domain = core types across ≥2 sub-domains (hierarchical + nesting); dsl = no dominant core, co-equal types combined (one task-organized page). ' +
        'Wins over `layout`.',
    ),
  ),
  skipPhases: v.pipe(
    v.optional(v.array(skipPhase), []),
    v.description(
      'Phases to skip (only code-gated phases; mdoc verify is agent-driven and always runs). ' +
        'Skipping a head-phase prefix resumes a run whose artifacts already exist, ' +
        'e.g. ["research", "design", "write"] runs only the examples/integrate/review tail.',
    ),
  ),
};

/** The parsed shape of a run's creation data, as `useRunBasics` hands it back. */
export type RunFacts = v.InferOutput<v.ObjectSchema<typeof docsWriterFields, undefined>>;

/**
 * The setup every render needs, whichever branch the writer takes: run context, model tier,
 * sandbox. Returns the parsed creation data so the caller can read the module escape hatches.
 *
 * Called by the classification gate AND by the writing branch, with identical values. Identical is
 * the point: `useSandbox` presence is re-read at every turn boundary, so a render that skipped it
 * would detach and re-attach the environment and make the runtime re-announce the whole workspace.
 * A render with no `useModel` at all cannot start.
 */
export function useRunBasics(schema: v.GenericSchema, request: string, kind: DocKind | null): RunFacts {
  const facts = v.parse(schema, useInitialData()) as RunFacts;

  // The checkout the writer reads and edits. local() binds it to this host with no isolation, so
  // keep it pointed at a directory you are willing to let the model change. Creation data is the
  // per-run input; REPO_PATH overrides when it is omitted, and the process working directory is the
  // last resort — so running from inside a library checkout needs no path at all.
  const projectPath = facts.projectPath ?? process.env.REPO_PATH ?? process.cwd();

  // Publish the run's facts for the phase tools and role renders, neither of which can reach
  // useInitialData() (it returns undefined in a subagent render). Idempotent, so repeating it on
  // every render is harmless. The caller owns the `request` state — declaring the same
  // usePersistentState name twice in one render throws, so it is passed in rather than re-read.
  setRunContext({ projectPath, request, kind, skipPhases: facts.skipPhases ?? [] });

  // Owns useModel, so nothing here may call it again — it throws on a second call in one render.
  useDocsAuthorBase();

  // Every render reaches here — the classification gate, every gate-phase maintenance skill, and
  // the writing branch alike — so this is the one place a usage report can be guaranteed regardless
  // of which path a run takes. It used to live only in `useDocsWriter`, which the gate branch never
  // reaches (it returns `GATE_INSTRUCTIONS` before ever calling that hook) — a run that classified no
  // kind (every maintenance pass: enrich-section, check-compliance, add-missing-section, cross-linker,
  // organize, redundancy, backfill-metadata, find-gaps, document-pr…) printed no token/cost figures at
  // all. `kind` stays the same value for a whole conversation once set (or stays null for the whole
  // conversation when a run never classifies one), so the label is stable across a run's renders
  // either way.
  useUsageReport(kind ?? 'flowrite-gate');

  // cwd belongs to local(), not to useSandbox. local()'s cwd anchors the sandbox on the host and
  // defaults to process.cwd(); useSandbox's cwd only picks a directory *inside* an already-anchored
  // environment. Passing it to useSandbox left the sandbox rooted in flowrite itself, so workspace
  // discovery — AGENTS.md and .agents/skills/ from the session cwd — fed the writer flowrite's own
  // AGENTS.md instead of the checkout it is documenting.
  useSandbox(local({ cwd: projectPath }));

  // MUST come after useSandbox. Declared before it, the roles never reach a phase tool's harness
  // conversation: every phase gave up with "No subagents are currently available. The system context
  // explicitly states \"Available Agents: None\"", while the root agent's own roster looked fine (a
  // probe confirmed every role declared on every render — the roster was nine roles then, six now).
  // One delegation happened in a whole run, against 24 in the equivalent pre-merge run.
  //
  // Isolated by measurement, one variable at a time, because two candidates were confounded at
  // first — position relative to useSandbox, and position relative to the useTool calls:
  //
  //   before useSandbox                    → 0 delegations, every phase gave up
  //   after useSandbox, before useTool     → delegation works
  //   after useSandbox, after useTool      → delegation works
  //
  // So useTool order is irrelevant and useSandbox order is everything. The likely mechanism is in
  // reference/agent-api.md: a sandbox attach narrates an `environment` signal that is "always a full
  // snapshot, never a delta … and the live skill and subagent catalogs", and that snapshot is the
  // baseline a harness conversation inherits. Attach before the roles exist and the baseline records
  // none. This contradicts the hooks reference, which lists useSubagent as "conditional and
  // reorderable" — worth reporting upstream.
  //
  // The pre-merge writers were accidentally correct: they called useSandbox first and useSubagent
  // last. Nothing said the order mattered.
  useRoles();

  return facts;
}

/**
 * Submission durability for every docs writer, assigned to each writer's
 * `durability` static.
 *
 * Flue 2 applies a one-hour submission deadline by default, which beta had no
 * equivalent of — flowrite never configured durability because nothing timed a run
 * out. A full pipeline is research → design → write → per-type subpages → examples
 * → mdoc → integrate → review, driving sbt throughout; a module reference with four
 * core types blew straight past the hour and settled `failed` mid-review. Six hours
 * is the runtime's own suggested figure for a long-running agent.
 *
 * `maxAttempts` is 2 rather than the default 10: an attempt here is a full,
 * expensive pipeline re-run, so one automatic retry after a crash is worth having
 * and nine are not. A timeout is terminal and is not retried either way.
 */
export const docsWriterDurability = { timeoutMs: 6 * 60 * 60 * 1_000, maxAttempts: 2 };

/**
 * Operational directives identical for every docs writer, appended after the
 * caller's own run directive. Lived in each deleted workflow's `buildPrompt`;
 * they are run-invariant, so they belong in the agent rather than in the
 * per-run message, which is now just a short kick-off line.
 */
const SHARED_DIRECTIVE =
  `Your shell already starts in the repo root of the library checkout — use relative paths ` +
  `for every command; do not cd into the repo. ` +
  `Review and fact-check are both delegations to the single "reviewer" subagent with the task tool, ` +
  `like every other phase — say in your task which job you want (a whole-page check against ` +
  `checklist + style, or a fact-check of one section or a small batch against source) and it replies ` +
  `in that job's shape; there is no tool that holds its verdict for you. When a reply reports ` +
  `failures or drifts, do NOT fix them yourself — delegate everything it reported, VERBATIM (every ` +
  `finding's exact statement/fix text included, never paraphrased or summarized), in one call to the ` +
  `"fixer" subagent with the task tool, naming the page path. Once fixer returns, re-run mdoc over ` +
  `the page yourself before trusting the edit — a fix that satisfies a finding can still break the ` +
  `page's compiled examples — then delegate to the SAME reviewer job once more to confirm. That ` +
  `confirming round is what lets you report the page as passing. If the confirming round raises ` +
  `something NEW instead of confirming the fixes, delegate to fixer again with the new findings and ` +
  `repeat: a round that finds something new earns another. Stop once a round only repeats what the ` +
  `one before it already said. ` +
  `When the work is done, call report_run_result once with the final page path, YOUR OWN read of ` +
  `whether it passed review (reviewVerdict), the failing items if it did not, a one-line summary, ` +
  `and a run retrospective: the real obstacles you hit this run and how you resolved them (empty if ` +
  `it went smoothly — never invent friction). Report the verdict honestly: say in reviewVerdict, in ` +
  `the summary, and in your closing reply what you fixed and anything still wrong, and never report ` +
  `"passed" over a page with a failing item you have not verified is fixed.`;

/**
 * Declare every role delegate. Called by useRunBasics, so every render has the full roster —
 * including the classification gate, whose render is the baseline snapshot phase tools inherit.
 *
 * Order matters and is not obvious: see the call site for the measurements.
 */
export function useRoles(): void {
  for (const role of ROLES) useSubagent(role);
}

/**
 * Shared composition for the writing branch of a docs writer: the role delegates, the guarded
 * phase tools, the kind's skills, the gh tool, and the run reporter. Returns the
 * instructions for the caller to return as its own.
 *
 * Model tier, sandbox and run context are NOT here — they belong to `useRunBasics`, which the agent
 * calls on every render including the one that has not yet classified the request.
 *
 * A custom hook rather than a factory, because Flue 2 replaced profiles with hook composition and
 * an agent's durable identity is its own exported function name — the agent must declare that
 * function itself rather than receive one from a factory.
 */
export function useDocsWriter(
  opts: {
    /** Log prefix for the end-of-run usage summary, e.g. 'write-data-type-ref'. */
    label: string;
    instructions: string;
    skills: SkillReference[];
    /** Phase tools. Guarded — each one refuses to run inside another phase. */
    tools: ToolDefinition[];
    /**
     * Ordinary tools, mounted unguarded.
     *
     * The distinction is not cosmetic: the guard exists because a phase tool's harness conversation
     * inherits the whole registry, so one phase can re-enter another. A plain tool starts no
     * conversation and can re-enter nothing, and a phase may legitimately need it — guarding it would
     * refuse the call for no reason.
     */
    plainTools?: ToolDefinition[];
    /** What to do this run, built from the request's kind and subject. */
    runDirective: string;
  },
): string {
  for (const skill of opts.skills) useSkill(skill);
  // Guarded: a phase tool's harness conversation inherits every other tool, so without this a phase
  // can re-enter the pipeline until the delegation cap trips, leaving the review roles unreachable.
  // See phase-guard.ts.
  for (const tool of opts.tools) useTool(guardPhase(tool));
  for (const tool of opts.plainTools ?? []) useTool(tool);
  // gh_query stays unguarded — an ordinary lookup any phase may legitimately need.
  useTool(createGhQueryTool(getRepoPath));
  // report_run_result is guarded on a different axis: not "is it a phase?" but "is it terminal for
  // the run?". It was exempt originally, and a phase duly filed the run's verdict mid-review.
  useTool(guardRootOnly(createReportRunResultTool(opts.label)));

  // The usage report itself is registered by `useRunBasics` (with this same label, once `kind` is
  // set) so it also covers the gate branch that never reaches this function — see the comment there.
  useInstruction(`${opts.runDirective} ${SHARED_DIRECTIVE}`);

  // The skip list, in prose, because most phases are prose. See `skippedPhases()`: only the two
  // code-gated tools could ever refuse a call, so without this a skipped head phase ran regardless
  // and the run directive above — which names the full flow — was the only thing the model heard.
  //
  // Last, so it qualifies the directive it follows rather than being qualified by it.
  const skipped = skippedPhases();
  if (skipped.length > 0) {
    useInstruction(
      `This run SKIPS these phases: ${skipped.join(', ')}. Whatever each would have produced is ` +
        `already on disk — read it and carry on from there. A skipped phase stays skipped: do not ` +
        `delegate it, do not call its tool, and never do its work yourself. Every phase not listed ` +
        `here still runs.`,
    );
  }

  return opts.instructions;
}
