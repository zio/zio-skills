import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { dataTypeResearchSchema } from './research-data-type.ts';
import { dataTypeStructureSchema } from './design-data-type-structure.ts';
import { isPhaseSkipped } from '../shared/skip-phases.ts';
import { buildFrontmatter, withFrontmatter } from '../shared/frontmatter.ts';
import { normalizePage } from '../review/fix.ts';
// The data-type-ref-structure skill's content, injected into the generic drafter's
// task (skills can't vary per delegation). Same single-source-of-truth
// split as writing-style/references/rules.md; the SKILL.md points here.
import dataTypeStructureDoc from '../skills/data-type-ref-structure/references/structure.md';
// TEMPORARY: flue does not package nested skill files, so the drafter cannot read
// writing-style/references/rules.md at runtime (read_skill_resource 404s) — see
// https://github.com/withastro/flue/discussions/100. We inject the rules into the
// drafter prompt at compile time instead. REVERT once flue supports nested skills:
// drop this import + injection and let the writing-style skill supply the rules.
import writingStyleRules from '../skills/writing-style/references/rules.md';
import { authorHint } from '../shared/author-hint.ts';
import { delegate } from '../shared/delegate.ts';

/** Kebab-case a type name for the filename: "NonEmptyChunk" -> "non-empty-chunk". */
export function toKebabCase(typeName: string): string {
  return typeName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Generate the reference-page markdown and write it to docs/reference/<type>.md.
 * Writing goes through harness.sandbox (out-of-band) so the file lands deterministically
 * rather than depending on the model choosing to call a filesystem tool. Mirrors
 * write-tutorial-draft.ts, but for the reference-page shape and output path.
 */
export const writeDataTypeReference = defineTool({
  name: 'write_data_type_reference',
  description: 'Write the data type reference markdown to docs/reference/<type>.md and return its path and content.',
  harness: true,
  input: v.object({
    structure: dataTypeStructureSchema,
    researchAnswers: dataTypeResearchSchema,
    // Optional, for module-ref hierarchical subpages. When absent, this tool
    // behaves byte-identically to a standalone data-type-ref run.
    outputDir: v.pipe(
      v.optional(v.string()),
      v.description('Directory for the page instead of the default docs/reference (e.g. "docs/reference/http-model" for a module subpage).'),
    ),
    moduleContext: v.pipe(
      v.optional(v.string()),
      v.description('When this page is a member of a module, how it relates to its sibling types; appended to the drafter prompt for recontextualization.'),
    ),
  }),
  output: v.object({ path: v.string(), content: v.string() }),
  async run({ harness, data, log }) {
    const id = toKebabCase(data.researchAnswers.typeName);
    const dir = data.outputDir ?? 'docs/reference';
    const path = `${dir}/${id}.md`;

    // Resume support: the page already exists on disk — return it as-is so later
    // phases get the real path/content.
    if (isPhaseSkipped('write')) {
      log.info(`Skipping draft (skipPhases) — using existing ${path}`);
      return { output: { path, content: await harness.sandbox.readFile(path) } };
    }

    log.info(`Writing data type reference: ${path}`);

    // Delegates to the generic drafter subagent — see design-tutorial-structure.ts
    // for why the calling agent must not draft this itself. The
    // reference-page template + result schema are supplied at the call site.
    const contentSchema = v.object({
      title: v.pipe(v.string(), v.description('The type name, e.g. "Chunk" — this is the page title')),
      description: v.pipe(
        v.string(),
        v.minLength(50),
        v.maxLength(150),
        v.description('50-150 characters describing the reference page purpose'),
      ),
      keywords: v.pipe(
        v.array(v.string()),
        v.minLength(3),
        v.maxLength(7),
        v.description(
          '3-6 Title-Case search keywords, one concept each: lead with general domain concepts (usually ' +
            'two words — "Distributed Tracing", "Trace Sampling"), then page-specific concepts/tasks ' +
            '("Custom Sampler"), then the type name ("Sampler"). Never a bag of concatenated identifiers ' +
            '("AlwaysOnSampler AlwaysOffSampler ParentBasedSampler") or a bare generic word.',
        ),
      ),
      body: v.pipe(
        v.string(),
        v.description(
          'The reference body only — no frontmatter, no leading ---. Starts directly with the ' +
            'opening definition prose (NO heading). No preamble, no surrounding code fence.',
        ),
      ),
    });
    const draft = await delegate({
      harness,
      log,
      label: 'drafter (data type ref)',
      role: 'drafter',
      result: contentSchema,
      prompt: [
        `Write a complete ZIO data type reference page as Docusaurus markdown.`,
        ``,
        `Follow this data-type-ref-structure template and its drafting rules exactly:`,
        ``,
        dataTypeStructureDoc,
        ``,
        // TEMP (flue nested-skill limitation, see import): inject writing-style rules.
        `Writing-style rules — apply every rule to the prose you write:`,
        ``,
        writingStyleRules,
        ``,
        `Structural plan to follow exactly — the optional sections to include, the`,
        `construction order, and the Core Operations category grouping are already`,
        `decided; write the page to match this plan:`,
        JSON.stringify(data.structure),
        ``,
        `Research answers (ground every fact in this — real signatures, imports, and examples;`,
        `never substitute general knowledge; groundingDetail carries verbatim detail to copy exactly.`,
        `Document EVERY constructor and core operation listed):`,
        JSON.stringify(data.researchAnswers),
        // Module-ref subpage recontextualization: when this type is a member of a
        // module, thread its sibling relationships through each section.
        ...(data.moduleContext
          ? [
              ``,
              `This page is part of a MODULE reference. Recontextualize it to the module: in each section,`,
              `note how this type relates to its sibling types (what it is built with, what it composes`,
              `with, module-level integration). If the context marks this type "supporting" (a helper, or`,
              `rarely used by application code directly), write the MINIMAL supporting page per the`,
              `data-type-ref-structure core-vs-supporting rule; a "core" type gets full depth. Module context:`,
              data.moduleContext,
            ]
          : []),
        ``,
        `The finish result's "description" must be 50-150 characters.`,
      ].join('\n') + authorHint(),
    });

    const frontmatter = buildFrontmatter({
      id,
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
