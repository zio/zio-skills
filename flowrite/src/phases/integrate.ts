import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { isPhaseSkipped } from '../shared/skip-phases.ts';
import { authorHint } from '../shared/author-hint.ts';
import { delegate } from '../shared/delegate.ts';

/** Shared output of every doc-integration action. */
export const integrateOutput = v.object({
  skipped: v.boolean(),
  summary: v.string(),
});

/**
 * Build an action that wires a finished documentation page into the Docusaurus
 * site (sidebars.js, docs/index.md, cross-references, link verification) by
 * delegating to the generic `docs_integrator` subagent. The only real variation
 * between doc kinds is the target category and the delegation prompt, so those
 * are supplied per call; the skip guard, delegation, and output shape are shared.
 *
 * The skip-list check lives here in code — see review-page.ts for
 * why it must not live only as prose in the orchestrator's .md.
 */
export function defineIntegrateAction(opts: {
  name: string;
  description: string;
  /** Input field carrying the page path, e.g. 'tutorialPath' or 'pagePath'. */
  inputKey: string;
  inputDescription: string;
  /** Human label for logs, e.g. 'tutorial' or 'reference page'. */
  docKind: string;
  /** Delegation prompt naming the target category and any inbound-link guidance. */
  buildPrompt: (path: string) => string;
}) {
  return defineTool({
    name: opts.name,
    description: opts.description,
    harness: true,
    input: v.object({
      [opts.inputKey]: v.pipe(v.string(), v.description(opts.inputDescription)),
    }),
    output: integrateOutput,
    async run({ harness, data, log }) {
      if (isPhaseSkipped('integrate')) {
        log.info('Skipping integration (skipPhases)');
        return { output: { skipped: true, summary: 'Skipped by request.' } };
      }

      const path = (data as Record<string, string>)[opts.inputKey];
      log.info(`Integrating ${opts.docKind} into docs site: ${path}`);
      // Delegates to the docs_integrator subagent — see design-tutorial-structure.ts
      // for why prompting the calling agent's own conversation is unsafe here.
      const result = await delegate({
        harness,
        log,
        label: 'docs_integrator',
        role: 'docs_integrator',
        result: integrateOutput,
        prompt: opts.buildPrompt(path) + authorHint(),
      });
      return { output: result };
    },
  });
}

export const integrateTutorial = defineIntegrateAction({
  name: 'integrate_tutorial',
  description: 'Wire a finished tutorial into the Docusaurus site (sidebar, index, cross-references).',
  inputKey: 'tutorialPath',
  inputDescription: 'Path to the tutorial markdown, e.g. docs/guides/scope.md',
  docKind: 'tutorial',
  buildPrompt: (path) =>
    `Integrate the tutorial at ${path} into the Docusaurus site: sidebars.js, ` +
    `docs/index.md, cross-references, and full link verification.`,
});

export const integrateDataTypeReference = defineIntegrateAction({
  name: 'integrate_data_type_reference',
  description: 'Wire a finished data type reference page into the Docusaurus site under the Reference category.',
  inputKey: 'pagePath',
  inputDescription: 'Path to the reference markdown, e.g. docs/reference/chunk.md',
  docKind: 'reference page',
  buildPrompt: (path) =>
    `Integrate the documentation page at ${path} into the Docusaurus site under the ` +
    `"Reference" category: sidebars.js, docs/index.md, cross-references, and full link verification. ` +
    `Reference pages are typically linked TO from tutorials and how-to guides — add inbound ` +
    `"See also" links from those pages where relevant.`,
});
