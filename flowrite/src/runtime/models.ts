import type { ThinkingLevel } from '@flue/runtime';

/**
 * Central model + reasoning-effort selection, one place to edit. Each tier is
 * env-overridable per run without touching code, e.g.
 * `RESEARCHER_MODEL=openai/gpt-5.5 RESEARCHER_EFFORT=medium flue run ...`.
 */
interface Tier {
  model: string;
  thinkingLevel: ThinkingLevel;
}

const effort = (value: string | undefined, fallback: ThinkingLevel): ThinkingLevel =>
  (value as ThinkingLevel) ?? fallback;

export const TIERS: Record<
  | 'writer'
  | 'researcher'
  | 'examples'
  | 'integrator'
  | 'designer'
  | 'reviewer'
  | 'fixer'
  | 'redundancyEditor'
  | 'metadataWriter'
  | 'crossLinker'
  | 'docsOrganizer'
  | 'sectionWriter'
  | 'complianceChecker'
  | 'sectionEnricher'
  | 'gapFinder'
  | 'prAuditor'
  | 'retrospector',
  Tier
> = {
  writer: {
    model: process.env.WRITER_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.WRITER_EFFORT, 'high'),
  },
  researcher: {
    model: process.env.RESEARCHER_MODEL ?? 'anthropic/claude-haiku-4-5',
    thinkingLevel: effort(process.env.RESEARCHER_EFFORT, 'low'),
  },
  examples: {
    model: process.env.EXAMPLES_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.EXAMPLES_EFFORT, 'medium'),
  },
  integrator: {
    model: process.env.INTEGRATOR_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.INTEGRATOR_EFFORT, 'medium'),
  },
  designer: {
    model: process.env.DESIGNER_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.DESIGNER_EFFORT, 'medium'),
  },
  // Covers both the full-page checklist/style review and the per-section fact-check — merged from
  // two identities (`reviewer` and `factChecker`) into one, since a checker's tier doesn't need to
  // differ by job, only the payload a given call carries does. Not the researcher's tier, though the
  // fact-check half looks similar. Both read source, but a researcher's miss is recoverable
  // downstream — the drafter can still be corrected — while this role's answer IS the gate: a
  // fabricated drift fails a correct page, and a missed one passes a wrong page. Haiku was the
  // obvious cheap choice and is deliberately not the default, because the whole value of the phase is
  // that its evidence can be trusted without a second opinion.
  reviewer: {
    model: process.env.REVIEWER_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.REVIEWER_EFFORT, 'low'),
  },
  // Mechanical, not judgment: fixer applies a statement reviewer already composed, verbatim — it
  // does not diagnose, compose, or re-derive anything. `low` follows from that more directly than
  // for any other editing role here: redundancyEditor/crossLinker/complianceChecker/sectionEnricher
  // (below) all carry SOME judgement about what to change; this one is handed the literal answer and
  // an exact location. It's also the one editing role whose edit gets re-verified downstream (the
  // root re-runs mdoc, then re-delegates to reviewer to confirm) before a run may report the page as
  // passing — the closest thing here to a real gate, which is exactly what those other roles lack.
  fixer: {
    model: process.env.FIXER_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.FIXER_EFFORT, 'low'),
  },
  // writer-assistant ran this on Haiku, and the work looks cheap: find repetition, delete it. What
  // makes it not cheap is that every cut is a judgement about whether the words carry anything —
  // and unlike every other role here, this one EDITS a page that already passed review, with no
  // gate downstream to catch it. A wrong cut ships.
  redundancyEditor: {
    model: process.env.REDUNDANCY_EDITOR_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.REDUNDANCY_EDITOR_EFFORT, 'low'),
  },
  // Haiku, and the contrast with the tier directly above is the whole reasoning. That one DELETES
  // sentences from a finished page: a wrong cut destroys information permanently and nothing
  // downstream can tell. This one fills fields that are empty, so its worst realistic output is a
  // dull description where there was none — visible in `git diff`, and still better than absent.
  // writer-assistant also ran it on Haiku; here that is a decision rather than an inheritance.
  metadataWriter: {
    model: process.env.METADATA_WRITER_MODEL ?? 'anthropic/claude-haiku-4-5',
    thinkingLevel: effort(process.env.METADATA_WRITER_EFFORT, 'low'),
  },
  // Sonnet, and this is the one tier here chosen against a MEASURED failure rather than an argument.
  // writer-assistant ran its page-linker on Haiku, and the output is still readable in zio/zio: a link
  // spliced inside an inline-code span (`docs/reference/services/random.md:14`, merged in `d058fcd26`
  // and live eleven weeks later), plus anchor phrases up to eight words long against its own skill's
  // "1-5 words". Both are silent — an inline-code span is not a fenced block, so mdoc never sees it,
  // and it is not a link, so `onBrokenLinks: 'throw'` never sees it either.
  //
  // Same shape of risk as redundancyEditor directly above: this EDITS pages that already passed
  // review, in several files per run, with nothing downstream re-checking. The difference is that
  // there the case for Sonnet was a prediction, and here it is a published defect.
  crossLinker: {
    model: process.env.CROSS_LINKER_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.CROSS_LINKER_EFFORT, 'low'),
  },
  // Sonnet, but for a different reason than the two editors above: the risk here is not a damaged
  // sentence, it is a bad TAXONOMY. Grouping is the whole judgement — a category is a claim about what
  // a set of pages is for, and a wrong one is durable in a way a wrong link is not, because readers
  // navigate by it and later pages get filed into it. The predecessor grouped by name substring
  // ("contains chunk, list, vector" → Collections), which is what a cheap model reaches for when it
  // cannot hold a dozen pages' purposes at once.
  //
  // `medium` rather than `low`, alone among the standalone agents: the others act on one page at a
  // time, while this one has to hold every page in a section simultaneously to see the grouping.
  docsOrganizer: {
    model: process.env.DOCS_ORGANIZER_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.DOCS_ORGANIZER_EFFORT, 'medium'),
  },
  // Writer's tier, not an editor's: the other standalone agents cut, link, or file existing prose —
  // this one composes a new section from source it read itself, with runnable examples that have to
  // pass mdoc. That is the writer's job in miniature, not a judgement call over a finished page, so it
  // gets the writer's model. `medium` rather than `high`: one section is bounded in a way a whole page
  // is not, and the insertion-point algorithm here is deterministic, not a design decision.
  sectionWriter: {
    model: process.env.SECTION_WRITER_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.SECTION_WRITER_EFFORT, 'medium'),
  },
  // Same risk shape as redundancyEditor and crossLinker directly above: this EDITS a page that already
  // passed review, with nothing downstream re-checking a given fix. `low` rather than `medium` because
  // the rigor here is procedural, not judgement — 28 numbered rules checked one at a time, adversarial
  // verification against explicit text, not a taste call about what a sentence carries. Sonnet, not
  // Haiku, for the same reason as its neighbors: a false "clean" on a rule is silent, and nothing
  // downstream would catch it either.
  complianceChecker: {
    model: process.env.COMPLIANCE_CHECKER_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.COMPLIANCE_CHECKER_EFFORT, 'low'),
  },
  // Writer-shaped like sectionWriter above, but the risk sits closer to
  // redundancyEditor's: this REPLACES content on a page that already passed review, rather than
  // inserting into empty space. A bad enrichment does not just miss an opportunity, it overwrites
  // something that worked. Sonnet stays for that reason; `medium` because composing five real parts
  // from source research is still writer-shaped work, not a small judgement call.
  sectionEnricher: {
    model: process.env.SECTION_ENRICHER_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.SECTION_ENRICHER_EFFORT, 'medium'),
  },
  // Same reasoning as docsOrganizer above, and for the same structural reason: this agent has to hold
  // every undocumented type in the scan simultaneously to classify priority sensibly, not act on one
  // page at a time like the editors above it. `medium` rather than `low` follows from that alone. It
  // writes no page, so the redundancyEditor-class risk (a silent bad edit shipping) does not apply —
  // the worst realistic output is a report with a type in the wrong priority tier, visible in the
  // report itself and cheap to correct on the next run.
  gapFinder: {
    model: process.env.GAP_FINDER_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.GAP_FINDER_EFFORT, 'medium'),
  },
  // Same shape as complianceChecker: the part that most needed rigor — applying the gate table — is
  // no longer this model's job at all, `classify_pr_docs` computes it. What is left is procedural,
  // not judgement: fetch two `gh` calls per PR, up to 20 times a run, and grade coverage against a
  // fixed four-level rubric. `low` follows from that, Sonnet because a batch this repetitive is where
  // a cheap model starts skipping later items.
  prAuditor: {
    model: process.env.PR_AUDITOR_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.PR_AUDITOR_EFFORT, 'low'),
  },
  // The highest blast radius of any standalone agent here: redundancyEditor and crossLinker corrupt
  // one page if they get it wrong; this one edits the instructions that govern EVERY future run of a
  // kind, so a bad "fix" degrades every page written after it, silently, until the next retrospection
  // happens to catch it. `medium`, not `low` — this is judgement (is the log evidence strong enough to
  // justify a permanent change to shared instructions?), not a mechanical checklist like
  // complianceChecker's. Sonnet for the same reason as every editor above it: nothing downstream
  // re-checks what this run decides to change.
  retrospector: {
    model: process.env.RETROSPECTOR_MODEL ?? 'anthropic/claude-sonnet-4-6',
    thinkingLevel: effort(process.env.RETROSPECTOR_EFFORT, 'medium'),
  },
};
