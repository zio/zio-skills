import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { moduleResearchSchema } from './research-module.ts';
import { moduleStructureSchema } from './design-module-structure.ts';
import { toKebabCase } from './write-data-type-reference.ts';
import { isPhaseSkipped } from '../shared/skip-phases.ts';
import { buildFrontmatter, withFrontmatter } from '../shared/frontmatter.ts';
import { normalizePage } from '../review/fix.ts';
import moduleStructureDoc from '../skills/module-ref-structure/references/structure.md';
// TEMP (flue nested-skill limitation, see write-data-type-reference.ts): inject
// writing-style rules into the drafter prompt until flue packages nested skills.
import writingStyleRules from '../skills/writing-style/references/rules.md';
import { authorHint } from '../shared/author-hint.ts';
import { delegate } from '../shared/delegate.ts';

/**
 * Write the module reference's module-level page. For a flat layout this is the
 * WHOLE page — module narrative plus every type documented inline (light
 * per-type coverage). For a hierarchical layout this is only the index.md:
 * the module narrative plus links out to the per-type subpages, which are
 * written separately by the reused write_data_type_reference loop.
 *
 * Writing goes through harness.sandbox so the file lands deterministically. Mirrors
 * write-data-type-reference.ts, but for the module page shape and output path.
 */
export const writeModuleOverview = defineTool({
  name: 'write_module_overview',
  description:
    'Write the module reference module-level page (flat: whole page with inline type sections; hierarchical: index.md narrative + subpage links) and return its path and content.',
  harness: true,
  input: v.object({
    structure: moduleStructureSchema,
    researchAnswers: moduleResearchSchema,
  }),
  output: v.object({ path: v.string(), content: v.string() }),
  async run({ harness, data, log }) {
    const moduleKebab = toKebabCase(data.researchAnswers.moduleName);
    const isFlat = data.structure.layout === 'flat';
    // flat -> docs/reference/<module>.md (id = <module>); hierarchical -> the
    // module dir's index (id = index) with subpages alongside it.
    const path = isFlat ? `docs/reference/${moduleKebab}.md` : `docs/reference/${moduleKebab}/index.md`;
    const id = isFlat ? moduleKebab : 'index';

    // Resume support: the page already exists on disk — return it as-is.
    if (isPhaseSkipped('write')) {
      log.info(`Skipping draft (skipPhases) — using existing ${path}`);
      return { output: { path, content: await harness.sandbox.readFile(path) } };
    }

    log.info(`Writing module overview (${data.structure.layout}): ${path}`);

    const contentSchema = v.object({
      title: v.pipe(v.string(), v.description('The module title, e.g. "HTTP Model" — this is the page title')),
      description: v.pipe(
        v.string(),
        v.minLength(50),
        v.maxLength(150),
        v.description('50-150 characters describing the module reference purpose'),
      ),
      keywords: v.pipe(
        v.array(v.string()),
        v.minLength(3),
        v.maxLength(7),
        v.description('3-6 Title-Case search keywords, one concept each: general domain concepts (usually two words) + page-specific concepts + the module and its main type names. Not concatenated API identifiers or bare generic words.'),
      ),
      body: v.pipe(
        v.string(),
        v.description(
          'The page body only — no frontmatter, no leading ---. Starts directly with the opening ' +
            'definition prose (NO heading). No preamble, no surrounding code fence.',
        ),
      ),
    });

    const layoutInstruction =
      data.structure.layout === 'hierarchical'
        ? [
            `This is a HIERARCHICAL module reference: write ONLY the index.md — the module-level narrative`,
            `plus an Overview that introduces each core type in 2-3 sentences and links to its subpage with`,
            `a relative path "./<type-kebab>.md". Do NOT document the types' full APIs here; each type gets`,
            `its own subpage written separately.`,
          ]
        : data.structure.shape === 'dsl'
          ? [
              `This is a DSL module reference: write ONE page in a single file, organized BY TASK/composition`,
              `— sections are recipes ("Building X", "Combining Y and Z") showing how the types compose to`,
              `solve the domain problem. Use the plan's typeGroups as the task/recipe outline. Do NOT add a`,
              `per-type "### <TypeName>" reference section and do NOT create separate files — the types appear`,
              `inside the recipes, not as their own sections.`,
            ]
          : [
              `This is a FLAT module reference: write the WHOLE page in one file. After the module-level`,
              `sections, document EVERY type from the plan's typeGroups inline, organized under each group's`,
              `"## <label>" heading with types as "### <TypeName>" — a "core" type gets the lighter per-type`,
              `section shape (group operations concisely, one example per group), a "supporting" type gets a`,
              `minimal entry (role + one usage example). Do not create separate files.`,
            ];

    const draft = await delegate({
      harness,
      log,
      label: 'drafter (module overview)',
      role: 'drafter',
      result: contentSchema,
      prompt: [
        `Write a ZIO MODULE reference page as Docusaurus markdown.`,
        ``,
        `Follow this module-ref-structure template and its drafting rules exactly:`,
        ``,
        moduleStructureDoc,
        ``,
        ...layoutInstruction,
        ``,
        // TEMP (flue nested-skill limitation, see import): inject writing-style rules.
        `Writing-style rules — apply every rule to the prose you write:`,
        ``,
        writingStyleRules,
        ``,
        `Structural plan to follow exactly (layout, which sections to include, and the type order are`,
        `already decided; write the page to match this plan):`,
        JSON.stringify(data.structure),
        ``,
        `Research answers (ground every fact and relationship in this — real signatures, imports, and`,
        `examples; never substitute general knowledge; groundingDetail carries verbatim detail to copy`,
        `exactly. The "How They Work Together" section MUST reflect the real "relationships" here):`,
        JSON.stringify(data.researchAnswers),
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
