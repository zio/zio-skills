import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { isPhaseSkipped } from '../shared/skip-phases.ts';
import { authorHint } from '../shared/author-hint.ts';
import { delegate } from '../shared/delegate.ts';

export const writeCompanionExamplesOutput = v.object({
  skipped: v.boolean(),
  summary: v.string(),
});

/**
 * Build companion example files for a finished documentation page (tutorial or
 * reference), then verify they compile and run. Checks the skip list before ever
 * delegating — see review-page.ts for why this check must live in
 * code, not only as prose in the agent instructions. Shared across document kinds.
 */
export const writeCompanionExamples = defineTool({
  name: 'write_companion_examples',
  description: 'Build companion example files for a documentation page and verify they compile and run.',
  harness: true,
  input: v.object({
    pagePath: v.pipe(v.string(), v.description('Path to the page markdown, e.g. docs/guides/scope.md or docs/reference/chunk.md')),
  }),
  output: writeCompanionExamplesOutput,
  async run({ harness, data, log }) {
    if (isPhaseSkipped('write-examples')) {
      log.info('Skipping companion examples (skipPhases)');
      return { output: { skipped: true, summary: 'Skipped by request.' } };
    }

    log.info(`Building companion examples for: ${data.pagePath}`);
    // Delegates to the examples_builder subagent — see design-tutorial-structure.ts
    // for why the calling agent must not build the examples itself.
    const result = await delegate({
      harness,
      log,
      label: 'examples_builder',
      role: 'examples_builder',
      result: writeCompanionExamplesOutput,
      prompt:
        `Build companion examples for the documentation page at ${data.pagePath}. Read the page ` +
        `and copy its code blocks: one standalone runnable example per major concept. If the page ` +
        `embeds a source file at a fixed mdoc:embed:<path> (a tutorial's "## Putting It Together", or ` +
        `a reference page's "Running the Examples" entries), create that file at exactly that path. Then ` +
        `compile the examples leaf build and run every example (each must print meaningful output).` +
        authorHint(),
    });
    return { output: result };
  },
});
