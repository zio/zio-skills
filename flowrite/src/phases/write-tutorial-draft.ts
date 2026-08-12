import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { structureSchema } from './design-tutorial-structure.ts';
import { researchSchema } from './research-tutorial-topic.ts';
import { isPhaseSkipped } from '../shared/skip-phases.ts';
import { buildFrontmatter, withFrontmatter } from '../shared/frontmatter.ts';
import { normalizePage } from '../review/fix.ts';
// The tutorial-structure skill's content, injected into the generic drafter's
// task (a subagent's skills can't vary per delegation, so the kind-specific
// template rides in the prompt). Same single-source-of-truth split as
// writing-style/references/rules.md; the SKILL.md points here.
import tutorialStructureDoc from '../skills/tutorial-structure/references/structure.md';
// TEMPORARY: flue does not package nested skill files, so the drafter cannot read
// writing-style/references/rules.md at runtime (read_skill_resource 404s) — see
// https://github.com/withastro/flue/discussions/100. We inject the rules into the
// drafter prompt at compile time instead. REVERT once flue supports nested skills:
// drop this import + injection and let the writing-style skill supply the rules.
import writingStyleRules from '../skills/writing-style/references/rules.md';
import { authorHint } from '../shared/author-hint.ts';
import { delegate } from '../shared/delegate.ts';

/**
 * Generate the tutorial markdown and write it to docs/guides/<id>.md.
 * Writing goes through harness.sandbox (out-of-band) so the file lands deterministically
 * rather than depending on the model choosing to call a filesystem tool.
 */
export const writeTutorialDraft = defineTool({
  name: 'write_tutorial_draft',
  description: 'Write the tutorial markdown to docs/guides/<id>.md and return its path and content.',
  harness: true,
  input: v.object({
    id: v.pipe(
      v.string(),
      v.description(
        'kebab-case tutorial id; matches the filename. Specific to this tutorial\'s actual angle, ' +
          'not a generic single word — e.g. "compositional-fiberref-updates", not "differ".',
      ),
    ),
    topic: v.string(),
    structure: structureSchema,
    researchAnswers: researchSchema,
  }),
  output: v.object({ path: v.string(), content: v.string() }),
  async run({ harness, data, log }) {
    const path = `docs/guides/${data.id}.md`;

    // Resume support: the tutorial already exists on disk — return it as-is so
    // later phases get the real path/content. Fails loudly if the id does not
    // match an existing file.
    if (isPhaseSkipped('write')) {
      log.info(`Skipping draft (skipPhases) — using existing ${path}`);
      return { output: { path, content: await harness.sandbox.readFile(path) } };
    }

    log.info(`Writing tutorial draft: ${path}`);

    // Delegates to the generic drafter subagent — see design-tutorial-structure.ts
    // for why the calling agent must not draft this itself.
    // Uses a result schema (not response.text) so the model returns content
    // through the structured channel instead of a chat reply — that channel
    // doesn't carry the "narrate, then fence the deliverable" habit that
    // corrupted the written file with a stray preamble/code fence.
    const contentSchema = v.object({
      title: v.pipe(
        v.string(),
        v.description(
          'A warm, specific tutorial title. A bare type name alone (e.g. "The Differ Data Type") is ' +
            "too vague — name the concept the tutorial actually teaches.",
        ),
      ),
      description: v.pipe(
        v.string(),
        v.minLength(50),
        v.maxLength(150),
        v.description('50-150 characters describing the page purpose'),
      ),
      keywords: v.pipe(
        v.array(v.string()),
        v.minLength(3),
        v.maxLength(7),
        v.description(
          'Search keywords/phrases for the frontmatter of the document. Each item is a compound ' +
            'phrase (1-2 words) grounded in this tutorial\'s actual terminology and its primary concepts — ' +
            'e.g. "Error Handling", "Fiber Composition", "Software Transactional Memory", "Functional Optics". ' +
            'Never a single generic word on its own (e.g. "Composition", "Lens") — always pair it with a ' +
            'qualifier specific to this tutorial.',
        ),
      ),
      body: v.pipe(
        v.string(),
        v.description(
          'The tutorial body only — no frontmatter, no leading ---. Starts directly with the ' +
            'first heading/prose. No preamble, no surrounding code fence.',
        ),
      ),
    });
    const draft = await delegate({
      harness,
      log,
      label: 'drafter (tutorial)',
      role: 'drafter',
      result: contentSchema,
      prompt: [
        `Write a complete learning-oriented tutorial as Docusaurus markdown.`,
        ``,
        `Follow this tutorial-structure template and its drafting rules exactly:`,
        ``,
        tutorialStructureDoc,
        ``,
        // TEMP (flue nested-skill limitation, see import): inject writing-style rules.
        `Writing-style rules — apply every rule to the prose you write:`,
        ``,
        writingStyleRules,
        ``,
        `Topic: ${data.topic}`,
        ``,
        `Research answers (ground every fact in this — imports, signatures, real`,
        `examples; never substitute general knowledge; groundingDetail carries the`,
        `verbatim code/signatures to copy exactly):`,
        JSON.stringify(data.researchAnswers),
        ``,
        `Section plan to follow exactly:`,
        JSON.stringify(data.structure),
        ``,
        `The finish result's "description" must be 50-150 characters.`,
      ].join('\n') + authorHint(),
    });

    const frontmatter = buildFrontmatter({
      id: data.id,
      title: draft.title,
      description: draft.description,
      keywords: draft.keywords,
    });
    // Deterministic style repairs, applied before anything reads the page: review is read-only, so a
    // mechanical violation surfacing there means a later phase reintroduced it or a fix is broken.
    const content = normalizePage(withFrontmatter(frontmatter, draft.body), log);

    await harness.sandbox.writeFile(path, content);
    return { output: { path, content } };
  },
});
