'use agent';
import { type AgentProps, useDelivery, usePersistentState, useTool } from '@flue/runtime';
import * as v from 'valibot';

// instructions — one per kind. These files are the real per-kind content and are unchanged by the
// merge: what differs between the three documents is writing guidance, which is data, not code.
import dataTypeRefMd from './data-type-ref-writer.md';
import moduleRefMd from './module-ref-writer.md';
import tutorialMd from './tutorial-writer.md';

import {
  type RunFacts,
  docsWriterDurability,
  docsWriterFields,
  useDocsWriter,
  useRunBasics,
} from '../shared/docs-writer.ts';
import { installVerboseObserver } from '../shared/verbose-observer.ts';

// skills — mdoc-conventions is shared by all three; writing-style comes from the shared baseline.
import mdocConventions from '../skills/mdoc-conventions/SKILL.md';
import dataTypeStructure from '../skills/data-type-ref-structure/SKILL.md';
import dataTypeChecklist from '../skills/data-type-ref-checklist/SKILL.md';
import moduleRefStructure from '../skills/module-ref-structure/SKILL.md';
import moduleRefChecklist from '../skills/module-ref-checklist/SKILL.md';
import tutorialStructure from '../skills/tutorial-structure/SKILL.md';
import tutorialChecklist from '../skills/tutorial-checklist/SKILL.md';

// phase tools
import { researchDataType } from '../phases/research-data-type.ts';
import { designDataTypeStructure } from '../phases/design-data-type-structure.ts';
import { writeDataTypeReference } from '../phases/write-data-type-reference.ts';
import { researchModule } from '../phases/research-module.ts';
import { designModuleStructure } from '../phases/design-module-structure.ts';
import { writeModuleOverview } from '../phases/write-module-overview.ts';
import { researchTutorialTopic } from '../phases/research-tutorial-topic.ts';
import { designTutorialStructure } from '../phases/design-tutorial-structure.ts';
import { writeTutorialDraft } from '../phases/write-tutorial-draft.ts';
import { writeCompanionExamples } from '../phases/write-companion-examples.ts';
import { integrateDataTypeReference, integrateTutorial } from '../phases/integrate.ts';
import { integrateModuleReference } from '../phases/integrate-module.ts';
import { reviewDataTypeRef, reviewModuleRef, reviewTutorial } from '../phases/review-page.ts';

// Ordinary tools, mounted unguarded. Deterministic and free, so the writer can iterate against them
// instead of waiting for the review phase to discover a gap.
import { checkMethodCoverage } from '../tools/check-method-coverage.ts';

// FLUE_VERBOSE_TOOLS=1 opts into full tool/delegation/turn detail. Installed once, here, because
// this module is now the single entry point for every kind of document.
installVerboseObserver();

export const DOC_KINDS = ['data-type', 'module', 'tutorial'] as const;
export type DocKind = (typeof DOC_KINDS)[number];

/**
 * The slice of creation data a run directive may read: the module escape hatches, and nothing else.
 *
 * Narrower than `RunFacts` on purpose — a directive has no business seeing `projectPath` (the
 * sandbox owns that) or `skipPhases` (the phase tools gate on it), and narrowing keeps the table's
 * three directives honest about what they depend on.
 */
export type DirectiveFacts = Pick<RunFacts, 'layout' | 'shapeOverride'>;

/**
 * Everything that differs between the three kinds of document, in one table.
 *
 * There used to be three agents — data-type-ref-writer.ts, module-ref-writer.ts,
 * tutorial-writer.ts — at 64, 87 and 61 lines, structurally identical: same imports, same
 * installVerboseObserver(), same useDocsWriter call, same durability. Only these five fields
 * differed, so they are now five fields rather than three files. The shape was inherited from
 * beta.9, where each kind was a `defineWorkflow` and a workflow was the unit of invocation; Flue 2
 * deleted workflows and the migration mapped one workflow to one agent mechanically.
 *
 * Adding a fourth kind is one row plus its .md, skills and phase tools — no change to the agent
 * function and no new entry point.
 */
export const KINDS = {
  'data-type': {
    label: 'write-data-type-ref',
    instructions: dataTypeRefMd,
    skills: [mdocConventions, dataTypeStructure, dataTypeChecklist],
    tools: [
      researchDataType,
      designDataTypeStructure,
      writeDataTypeReference,
      writeCompanionExamples,
      integrateDataTypeReference,
      reviewDataTypeRef,
    ],
    plainTools: [checkMethodCoverage],
    directive: (subject: string, _facts: DirectiveFacts) =>
      `Write a complete, compile-verified data type reference page for: ${subject}. ` +
      `Run the full flow (research → design → write → examples → mdoc verify → integrate → ` +
      `review; review covers method coverage + writing style + the checklist).`,
  },
  module: {
    label: 'write-module-ref',
    instructions: moduleRefMd,
    // Deliberately reuses three data-type tools: a hierarchical module reference builds a subpage
    // per core type through exactly the same phases. This overlap predates the merge — it is why
    // the three "separate" agents were never actually separate.
    skills: [mdocConventions, moduleRefStructure, moduleRefChecklist],
    tools: [
      researchModule,
      designModuleStructure,
      writeModuleOverview,
      researchDataType,
      writeDataTypeReference,
      writeCompanionExamples,
      integrateModuleReference,
      reviewModuleRef,
    ],
    // Module references carry per-type subpages, so coverage applies to each of them.
    plainTools: [checkMethodCoverage],
    directive: (subject: string, facts: DirectiveFacts) =>
      `Write a complete, compile-verified module reference for the module: ${subject}. ` +
      (facts.shapeOverride
        ? `Classify this module as the "${facts.shapeOverride}" shape (pass it as shapeOverride to design). `
        : '') +
      (facts.layout ? `Use the "${facts.layout}" layout (pass it as layoutOverride to design). ` : '') +
      `Run the full flow (research → design → write module page → per-type subpages if ` +
      `hierarchical → examples → mdoc verify → integrate → review; review covers per-type method ` +
      `coverage + writing style + the module checklist).`,
  },
  tutorial: {
    label: 'write-tutorial',
    instructions: tutorialMd,
    skills: [mdocConventions, tutorialStructure, tutorialChecklist],
    tools: [
      researchTutorialTopic,
      designTutorialStructure,
      writeTutorialDraft,
      writeCompanionExamples,
      integrateTutorial,
      reviewTutorial,
    ],
    directive: (subject: string, _facts: DirectiveFacts) =>
      `Write a complete, compile-verified tutorial for: ${subject}. ` +
      `Run the full flow (research → design → write → examples → mdoc verify → integrate → review).`,
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
 * The gate render's instructions: before the kind is known, the only thing to do is establish it.
 *
 * Ambiguity must stop the run rather than resolve it. "Write docs for Chunk" genuinely fits both a
 * reference page and a tutorial, and guessing spends hours of pipeline on the wrong document —
 * the same reason an uncertain module-shape classification halts instead of guessing.
 */
const GATE_INSTRUCTIONS = [
  'You write ZIO library documentation. Before any work starts, establish what the request asks for.',
  '',
  'Read the request and decide two things:',
  '',
  '1. **Which kind of document.**',
  '   - `data-type` — a reference page for ONE type: its full public API, every method.',
  '   - `module` — a reference for a MODULE: how its types work together, plus per-type coverage.',
  '   - `tutorial` — a learning-oriented walkthrough of a task or topic.',
  '2. **The subject** — the type name, the module name, or the tutorial topic, as the request names it.',
  '',
  'Record both with `set_document_kind`. The phase tools for that kind appear immediately after.',
  '',
  'When the request is genuinely ambiguous, call `ask_for_clarification` and stop. "Write docs for ' +
    'Chunk" fits both `data-type` and `tutorial` — that is a question, not a guess.',
].join('\n');

/**
 * Writes ZIO documentation of whichever kind the request asks for: a data type reference page, a
 * module reference, or a tutorial.
 *
 * Run it with a plain request — the kind and subject are read from the message:
 *   flue run src/agents/docs-writer.ts --id dtr-Chunk \
 *     -m "Please write reference documentation for the Chunk data type" \
 *     --data '{"projectPath":"/path/to/checkout"}'
 */
export function DocsWriter(_props: AgentProps) {
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
  const facts = useRunBasics(initialData, request);

  if (kind === null || subject === null) {
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
          v.description('The type name, module name, or tutorial topic, as the request names it.'),
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
    // `in` rather than optional-chaining: KINDS is `as const`, so the tutorial variant has no
    // plainTools key at all and the union type does not admit the property.
    plainTools: 'plainTools' in config ? [...config.plainTools] : [],
    runDirective: config.directive(subject, facts),
  });
}

DocsWriter.initialData = initialData;
DocsWriter.durability = docsWriterDurability;
