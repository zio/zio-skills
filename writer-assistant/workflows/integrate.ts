import 'dotenv/config.js';
import * as path from 'node:path';
import type { FlueContext } from '@flue/runtime';
import docsIntegratorAgent from '../agents/docs-integrator.js';
import pageLinkerAgent from '../agents/page-linker.js';
import { loadConfig } from '../lib/config-loader.js';
import { loadState, emptyState } from '../lib/state-store.js';
import { reindex } from './phases/reindex.js';
import { processBatch } from './phases/process.js';
import { createRunMdoc } from '../tools/run_mdoc.js';
import { createBuildWebsite } from '../tools/build_website.js';

export async function run({ init, payload }: FlueContext) {
  const { projectRoot, docPath } = payload as {
    projectRoot: string;
    docPath: string; // path to the new doc, relative to projectRoot (e.g. "docs/reference/chunk.md")
  };

  if (!projectRoot) throw new Error('payload.projectRoot is required');
  if (!docPath) throw new Error('payload.docPath is required');

  const docsDir = path.join(projectRoot, 'docs');
  const absDocPath = path.resolve(projectRoot, docPath);

  console.log(`[integrate] Integrating: ${docPath}`);

  // Phase 1: Wire into site (sidebars.js, index.md, mdoc + build verification)
  console.log('\n[integrate] Phase 1: Site integration (sidebar, index, compilation gate)');
  process.env.FLUE_PROJECT_ROOT = projectRoot;

  const integratorHarness = await init(docsIntegratorAgent, { name: 'docs-integrate' });
  const integratorSession = await integratorHarness.session();

  const integratePrompt = `Integrate the newly written documentation page into the Docusaurus site.

Project root: ${projectRoot}
New page path: ${docPath}

Follow the docs-integrate checklist:
1. Add to sidebars.js under the correct category
2. Add link in docs/index.md under the correct section
3. Run run_mdoc to verify compilation — fix any errors before continuing
4. Run build_website to verify the full site builds — fix any errors before continuing

Do not proceed to the next step until the current one succeeds.`;

  await integratorSession.prompt(integratePrompt, {
    tools: [createRunMdoc(projectRoot), createBuildWebsite(projectRoot)],
  });

  console.log('\n[integrate] Phase 1 complete.');

  // Phase 2: Cross-reference — find inbound link candidates for the new page
  console.log('\n[integrate] Phase 2: Cross-referencing (find inbound See Also candidates)');

  const linkerHarness = await init(pageLinkerAgent, { name: 'crossref-integrate' });
  const linkerSession = await linkerHarness.session();

  // Reindex to include the new page
  let state = (await loadState(docsDir)) ?? emptyState(docsDir);
  state = await reindex(docsDir, state, linkerSession);

  const config = loadConfig(docsDir);
  const result = await processBatch(state, config, linkerSession, 1, docsDir, absDocPath);

  console.log(
    `\n[integrate] Phase 2 complete. Cross-ref: processed=${result.processed}, remaining=${result.remaining}`
  );

  return {
    docPath,
    phases: {
      integration: 'complete',
      crossRef: { processed: result.processed, remaining: result.remaining },
    },
  };
}
