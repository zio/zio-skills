'use agent';
import {
  type ToolDefinition,
  defineSkill,
  useDelivery,
  usePersistentState,
  useSkill,
  useTool,
} from '@flue/runtime';
import * as v from 'valibot';

// instructions — one per kind. These files are the real per-kind content and are unchanged by the
// merge: what differs between the documents is writing guidance, which is data, not code.
import dataTypeRefMd from './instructions/data-type-ref.md';
import moduleRefMd from './instructions/module-ref.md';
import tutorialMd from './instructions/tutorial.md';
import howToGuideMd from './instructions/how-to-guide.md';
// Gate-phase-only skills, activated by the model rather than always in the prompt (see the
// `documentPrSkill`/`prSubsectionSkill` doc-comment below for why these two and not a third file).
import documentPrMd from './instructions/document-pr.md';
import prSubsectionMd from './instructions/pr-subsection.md';

import {
  type RunFacts,
  docsWriterDurability,
  docsWriterFields,
  useDocsWriter,
  useRunBasics,
} from './runtime/composition.ts';
import { installVerboseObserver } from './runtime/verbose-observer.ts';

// skills — mdoc-conventions is shared by every kind; writing-style comes from the shared baseline.
import mdocConventions from './skills/mdoc-conventions/SKILL.md';
import dataTypeStructure from './skills/data-type-ref-structure/SKILL.md';
import dataTypeChecklist from './skills/data-type-ref-checklist/SKILL.md';
import moduleRefStructure from './skills/module-ref-structure/SKILL.md';
import moduleRefChecklist from './skills/module-ref-checklist/SKILL.md';
import tutorialStructure from './skills/tutorial-structure/SKILL.md';
import tutorialChecklist from './skills/tutorial-checklist/SKILL.md';
import howToStructure from './skills/how-to-structure/SKILL.md';
import howToChecklist from './skills/how-to-checklist/SKILL.md';
// Conditional bulk, activated only by the runs that need it: the sbt examples build when a page embeds
// files, the per-type subpage loop when a module comes out hierarchical. Both would be dead weight in
// an instruction file that rides on every turn.
import companionExamples from './skills/companion-examples/SKILL.md';
import moduleSubpages from './skills/module-subpages/SKILL.md';
// The root agent hand-writes the sub-domain index pages of a hierarchical module (see module-subpages),
// and those carry the mandatory "How They Work Together" diagram and a type roster — so it needs the
// drawing and tabulating methods itself, not only through the drafter.
import asciiDiagram from './skills/ascii-diagram/SKILL.md';
import markdownTable from './skills/markdown-table/SKILL.md';

// `review_page` and `fact_check_page` — the last two `harness: true` phase tools — are gone too now.
// Both existed so TypeScript could hold a schema-validated verdict for `recordedVerdict()`, since a
// plain `task` delegation returns prose that nothing can check; `reviewer` (which now covers both
// jobs — `fact_checker` merged into it) is an ordinary subagent reached with `task` like every other
// role, and `report_run_result` (see self-report.ts) is back to asking the model for the verdict
// directly, trusting what it reports.
//
// A `fixer` subagent now applies every fix `reviewer` reports — the root agent no longer edits a page
// itself. `reviewer` composes the exact corrected statement for each finding; `fixer` applies it
// verbatim, with no judgment of its own. See composition.ts's SHARED_DIRECTIVE for the delegation
// protocol and fixer.ts's doc-comment for why it carries no per-kind context.

// Ordinary tools, mounted unguarded. Deterministic and free, so the writer can iterate against them
// instead of waiting for the review phase to discover a gap.
import { checkMethodCoverage } from './tools/check-method-coverage.ts';
// The deterministic "does this PR need docs at all" gate `documentPrSkill` calls into — same tool
// `list-undocumented-prs.ts` uses, reused rather than re-derived.
import { classifyPrDocs } from './tools/classify-pr-docs.ts';

// FLUE_VERBOSE_TOOLS=1 opts into full tool/delegation/turn detail. Installed once, here, because
// this module is now the single entry point for every kind of document.
installVerboseObserver();

// Defined in run-context.ts, where every role's render can reach the type (via docKind()) without
// importing this module and closing a cycle. Re-exported because this is where a reader looks for it,
// and the tests import it from here.
import { DOC_KINDS, type DocKind } from './runtime/run-context.ts';
export { DOC_KINDS, type DocKind };

/**
 * The slice of creation data a run directive may read: the module escape hatches, and nothing else.
 *
 * Narrower than `RunFacts` on purpose — a directive has no business seeing `projectPath` (the
 * sandbox owns that) or `skipPhases` (the run directive states them in prose; see `skippedPhases()`),
 * and narrowing keeps the table's every directive honest about what it depends on.
 */
export type DirectiveFacts = Pick<RunFacts, 'layout' | 'shapeOverride'>;

/**
 * Everything that differs between the kinds of document, in one table.
 *
 * One table rather than one file per kind: they were structurally identical and only these five
 * fields differed. Adding a kind is one row plus its .md and skills — no change to the agent
 * function and no new entry point. `how-to` was added that way and held: tsc forces the row (the
 * `KINDS[kind]` index below), the two `Record<DocKind, string>` maps in kind-docs.ts, and nothing
 * else. What it did NOT cover is the prose around it — GATE_INSTRUCTIONS, two role descriptions, and
 * the fixture's AGENTS.md all named three kinds and had to be amended by hand.
 */
export const KINDS = {
  'data-type': {
    label: 'write-data-type-ref',
    instructions: dataTypeRefMd,
    skills: [mdocConventions, dataTypeStructure, dataTypeChecklist, companionExamples],
    tools: [] as ToolDefinition[],
    plainTools: [checkMethodCoverage],
    directive: (subject: string, _facts: DirectiveFacts) =>
      `Write a complete, compile-verified data type reference page for: ${subject}. ` +
      `Run the full flow (research → design → write → examples → mdoc verify → fact check → ` +
      `integrate → review; fact check and review are both the "reviewer" role — fact check per ` +
      `section against source, review of the whole page against method coverage + writing style + ` +
      `the checklist — and the "fixer" role applies whatever either one reports, verbatim, never you).`,
  },
  module: {
    label: 'write-module-ref',
    instructions: moduleRefMd,
    // module-subpages carries the per-type loop that module-ref.md used to spell out inline. A module
    // only reaches it when the design comes back hierarchical, which is what makes it a skill rather
    // than instruction prose: a flat module never needs it.
    skills: [
      mdocConventions,
      moduleRefStructure,
      moduleRefChecklist,
      moduleSubpages,
      companionExamples,
      asciiDiagram,
      markdownTable,
    ],
    tools: [] as ToolDefinition[],
    // Module references carry per-type subpages, so coverage applies to each of them.
    plainTools: [checkMethodCoverage],
    directive: (subject: string, facts: DirectiveFacts) =>
      `Write a complete, compile-verified module reference for the module: ${subject}. ` +
      (facts.shapeOverride
        ? `Classify this module as the "${facts.shapeOverride}" shape — tell the designer to use it. `
        : '') +
      (facts.layout ? `Use the "${facts.layout}" layout — tell the designer to use it. ` : '') +
      `Run the full flow (research → design → write module page → per-type subpages if ` +
      `hierarchical → examples → mdoc verify → fact check → integrate → review; fact check and ` +
      `review are both the "reviewer" role — fact check per section against source, review of each ` +
      `page against per-type method coverage + writing style + the module checklist — and the ` +
      `"fixer" role applies whatever either one reports, verbatim, never you).`,
  },
  tutorial: {
    label: 'write-tutorial',
    instructions: tutorialMd,
    skills: [mdocConventions, tutorialStructure, tutorialChecklist, companionExamples],
    tools: [] as ToolDefinition[],
    // Empty rather than absent: every row carries every field, so the call site reads
    // `config.plainTools` like any other. A missing key made the union type reject the property.
    plainTools: [],
    directive: (subject: string, _facts: DirectiveFacts) =>
      `Write a complete, compile-verified tutorial for: ${subject}. ` +
      `Run the full flow (research → design → write → examples → mdoc verify → fact check → ` +
      `integrate → review; fact check and review are both the "reviewer" role — fact check per ` +
      `section against source, review of the whole page against writing style + the checklist — ` +
      `and the "fixer" role applies whatever either one reports, verbatim, never you).`,
  },
  'how-to': {
    label: 'write-how-to-guide',
    instructions: howToGuideMd,
    skills: [mdocConventions, howToStructure, howToChecklist, companionExamples],
    tools: [] as ToolDefinition[],
    // Empty for the same reason tutorial's is, and the reason is worth restating because a how-to
    // guide *does* document real API: it documents only the API its one task needs, deliberately.
    // Offering method coverage would invite a check that should fail on a correct page.
    plainTools: [],
    directive: (subject: string, _facts: DirectiveFacts) =>
      `Write a complete, compile-verified how-to guide for the task: ${subject}. ` +
      `It opens on a concrete problem with a "before" example of what the reader writes today — ` +
      `not on concepts — and walks one canonical path to a working result. ` +
      `Run the full flow (research → design → write → examples → mdoc verify → fact check → ` +
      `integrate → review; fact check and review are both the "reviewer" role — fact check per ` +
      `section against source, review of the whole page against writing style + the checklist — ` +
      `and the "fixer" role applies whatever either one reports, verbatim, never you).`,
  },
} as const;

/**
 * Creation data: only the machine settings a sentence cannot express.
 *
 * The subject and the kind of document now come from the message, so nothing here is required —
 * and the whole object is wrapped in `v.optional(..., {})` because absence would otherwise reject
 * the run outright ("a mismatch — including absence, unless the schema accepts undefined — rejects
 * the creating send", reference/agent-api.md). `flue run … -m "…"` with no --data must work.
 */
const initialData = v.optional(v.object({ ...docsWriterFields }), {});

/**
 * Mounted only during the gate render (kind unknown), activated by the model rather than always in
 * the prompt — the same `activate_skill` mechanism Claude Code's skills use, per flue's own "Skills"
 * guide. Two, not three: the new-page case needs no skill of its own, because GATE_INSTRUCTIONS below
 * already tells the model to read a PR directly and call `set_document_kind` — the same tool this
 * render already has. `document-pr` earns its place for the part GATE_INSTRUCTIONS does NOT do
 * deterministically (ruling out "no docs needed" via `classify_pr_docs` before falling back to
 * judgment) and for naming the subsection case; `pr-subsection` earns its place because, once
 * activated, this same conversation can just carry it out — fetch, decide, write, verify, commit —
 * with no separate `flue run` needed, unlike when these lived in their own now-deleted agent files.
 */
const documentPrSkill = defineSkill({
  name: 'document-pr',
  description:
    'Decide, from a bare PR number, whether it needs a full new page, a subsection on an existing ' +
    'page, or nothing at all. Use when asked to "document PR #<n>" and it is not already clear which ' +
    'case applies.',
  instructions: documentPrMd,
});

const prSubsectionSkill = defineSkill({
  name: 'pr-subsection',
  description:
    'Turn a GitHub pull request into one subsection appended to a page that already documents the ' +
    'area it touches — no new page, no sidebar edit. Use for a PR that only enhances or fixes ' +
    'something already documented, or when the document-pr skill names this as the subsection case.',
  instructions: prSubsectionMd,
});

/**
 * The gate render's instructions: before the kind is known, the only thing to do is establish it.
 *
 * Ambiguity must stop the run rather than resolve it. "Write docs for Chunk" genuinely fits both a
 * reference page and a tutorial, and guessing spends hours of pipeline on the wrong document —
 * the same reason an uncertain module-shape classification halts instead of guessing.
 *
 * Exported only so a test can assert it names every DOC_KINDS member. This list is the one place the
 * kinds are enumerated in prose rather than in a type, so it is the one place a new kind can be added
 * everywhere else and stay invisible to the model. Nothing else reads it.
 */
export const GATE_INSTRUCTIONS = [
  'You write ZIO library documentation. Before any work starts, establish what the request asks for.',
  '',
  'Read the request and decide two things:',
  '',
  '1. **Which kind of document.**',
  '   - `data-type` — a reference page for ONE type: its full public API, every method.',
  '   - `module` — a reference for a MODULE: how its types work together, plus per-type coverage.',
  '   - `tutorial` — learning-oriented: the reader wants to UNDERSTAND a topic they are new to.',
  '   - `how-to` — goal-oriented: the reader already knows the basics and wants to FINISH a task.',
  '',
  '   `tutorial` and `how-to` both walk through steps and both land in `docs/guides/`, so the shape ' +
    'of the request does not separate them — the reader\'s intent does. Ask what they have when they ' +
    'finish: an understanding, or a working result.',
  '   ✅ "Understanding ZIO\'s error model" → `tutorial`  ✅ "How do I retry a failed request with ' +
    'backoff?" → `how-to`',
  '   ❌ "Error handling in ZIO" → neither; that is a subject, not an intent. Ask.',
  '2. **The subject** — the type name, the module name, the tutorial topic, or the task the how-to ' +
    'guide accomplishes, as the request names it.',
  '   A PR, issue or commit is a SOURCE, not a subject: read it (`gh pr view <n> --repo <slug>`) and ' +
    'take the kind and subject from what it changed.',
  '   ✅ "document PR #42" → read it, then `data-type` + `ZStream`  ❌ subject `PR #42`  ❌ a ' +
    'dependency bump or internal refactor → no page; say so and stop.',
  '   ❌ a PR that only enhances or fixes something an existing page already covers → not a new ' +
    'page either; flowrite has no agent for that — say so, point at the `docs-pr-subsection` skill ' +
    '(or `src/instructions/pr-subsection.md` applied by hand), and stop.',
  '',
  'Record both with `set_document_kind`. The phase tools for that kind appear immediately after.',
  '',
  'When the request is genuinely ambiguous, call `ask_for_clarification` and stop. "Streaming in ' +
    'ZIO" fits `tutorial` and `how-to` equally — that is a question, not a guess.',
].join('\n');

/**
 * Writes ZIO documentation of whichever kind the request asks for: a data type reference page, a
 * module reference, a tutorial, or a how-to guide.
 *
 * Run it with a plain request — the kind and subject are read from the message:
 *   flue run src/agent.ts --id dtr-Chunk \
 *     -m "Please write reference documentation for the Chunk data type" \
 *     --data '{"projectPath":"/path/to/checkout"}'
 */
export function DocsWriter() {
  const [kind, setKind] = usePersistentState<DocKind | null>('docKind', null);
  const [subject, setSubject] = usePersistentState<string | null>('subject', null);
  const [storedRequest, setRequest] = usePersistentState<string | null>('request', null);
  const delivery = useDelivery();

  // What the requester asked for. On the classification turn the delivery IS the request; after
  // that the recorded copy wins, because the delivery is a cursor that advances to whatever message
  // the model is currently answering — a later message must not silently redefine the run.
  const request = storedRequest ?? (delivery.kind === 'user' ? delivery.body : '');

  // Setup both branches need: run context, model tier, sandbox. Called in BOTH renders with
  // identical values, because `useSandbox` presence is re-read at every turn boundary — a render
  // that skipped it would detach and re-attach the environment and re-announce the workspace.
  const facts = useRunBasics(initialData, request, kind);

  if (kind === null || subject === null) {
    // PR-shaped requests: the two skills above, activated by the model rather than always in the
    // prompt, plus what `pr-subsection` needs to actually carry out a write here — `mdoc-conventions`
    // (writing-style is already mounted for every render, inside `useRunBasics`) and the
    // `classify_pr_docs` tool `document-pr` calls in its own step 2.
    useSkill(documentPrSkill);
    useSkill(prSubsectionSkill);
    useSkill(mdocConventions);
    useTool(classifyPrDocs);

    // Two tools while the kind is unknown, and both are plain rather than `harness: true`: they
    // start no sub-conversation, consume no delegation depth, and can re-enter nothing — so neither
    // needs the phase guard. Neither can run twice either, because recording a kind retires this
    // whole branch.
    //
    // Asking is a named tool rather than "just don't call the other one", and that difference was
    // measured, not assumed:
    //
    //   prose "ask and stop", no tool  → classified "write docs for Prism" as data-type and wrote
    //                                    the whole page (53 turns, $0.38)
    //   prose naming this tool         → halted and asked (1 turn, 3.2k tokens)
    //
    // An instruction whose compliance looks like *inaction* is weak; naming the alternative as a
    // capability makes it a real option. A ✅/❌ example pair was tried alongside and ablated — it
    // changed nothing on its own, so it is not here.
    //
    // Note the model asks in prose and does not actually call this tool. It earns its place as the
    // affordance the instruction can point at; the log line is for the case where it is called.
    useTool({
      name: 'ask_for_clarification',
      description:
        'Ask the requester which kind of document they want, when the request does not say. Use ' +
        'instead of set_document_kind — this ends the run with your question, and nothing is written.',
      input: v.object({
        question: v.pipe(
          v.string(),
          v.minLength(1),
          v.description('The question to put to the requester, naming the kinds that would fit.'),
        ),
      }),
      output: v.object({ asked: v.literal(true) }),
      run({ data }) {
        // Nothing durable to record: the question is the run's outcome. Logged so an unattended run
        // that halted is distinguishable from one that crashed.
        console.error(`[docs-writer] asked for clarification: ${data.question}`);
        return { output: { asked: true } };
      },
    });

    useTool({
      name: 'set_document_kind',
      description:
        'Record which kind of document to write and its subject. Call once, after reading the ' +
        'request. The phase tools for that kind become available immediately afterwards.',
      input: v.object({
        docKind: v.picklist(DOC_KINDS),
        subject: v.pipe(
          v.string(),
          v.minLength(1),
          v.description(
            'The type name, module name, tutorial topic, or the task a how-to guide accomplishes, ' +
              'as the request names it.',
          ),
        ),
        rationale: v.pipe(
          v.string(),
          v.description('One sentence: why this kind, from the wording of the request.'),
        ),
      }),
      output: v.object({ recorded: v.literal(true) }),
      run({ data }) {
        // This input schema is the only runtime validation these state values get: the type
        // parameter on usePersistentState is compile-time only and parses nothing at runtime.
        setKind(data.docKind);
        setSubject(data.subject);
        setRequest(request);
        return { output: { recorded: true } };
      },
    });

    // Declared here too, after the gate's own tools: the `task` roster is frozen into the system
    // prompt from the FIRST render's snapshot, and every phase tool's harness conversation is seeded
    // with that prompt. A roster declared only after classification is invisible to the code that
    // delegates.
    return GATE_INSTRUCTIONS;
  }

  const config = KINDS[kind];
  return useDocsWriter({
    label: config.label,
    instructions: config.instructions,
    // Spread because `as const` makes these readonly and useDocsWriter takes mutable arrays.
    skills: [...config.skills],
    tools: [...config.tools],
    plainTools: [...config.plainTools],
    runDirective: config.directive(subject, facts),
  });
}

/**
 * The durable identity, pinned rather than inherited from the function name.
 *
 * Without this static, storage is keyed by the identifier `DocsWriter`, so renaming the function
 * orphans every conversation under the old key — which already happened here: run.db still holds
 * `DataTypeRefWriter` and `ModuleRefWriter` streams from before the three writers merged, reachable
 * by no name this code exports. `agentName` is the documented fix (agent-api.md, "Agent statics"):
 * the source name and the storage key move independently from now on.
 *
 * Must be a string literal — build targets derive durable identifiers from it before any user code
 * runs. Setting it now retires the 19 `DocsWriter` streams in the cache database, which costs
 * nothing: no run script passes `--id`, so every run opens a fresh conversation and none of them
 * were ever continued.
 */
DocsWriter.agentName = 'docs-writer';
DocsWriter.initialData = initialData;
DocsWriter.durability = docsWriterDurability;
