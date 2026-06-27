import 'dotenv/config.js';
import * as v from 'valibot';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { defineWorkflow } from '@flue/runtime';
import docsWriterAgent from '../agents/docs-writer.js';
import { runPreview } from '../lib/build-runner.js';

export interface PreviewWebsiteResult {
  success: boolean;
  url: string;
  pid: number;
  buildSystem: string;
  previewCwd: string;
  mdocRan: boolean;
  mdocSuccess: boolean;
  mdocOutput: string;
}

export default defineWorkflow({
  agent: docsWriterAgent,
  input: v.looseObject({}),
  run: previewWebsiteRun as (ctx: any) => any,
});

async function previewWebsiteRun({ input }: { input: any }) {
  const {
    projectRoot,
    docsDir: inputDocsDir,
    runMdoc = false,
  } = input as {
    projectRoot: string;
    docsDir?: string;
    /** Whether to run `sbt docs/mdoc` before starting the preview server. Default: false. */
    runMdoc?: boolean;
  };

  if (!projectRoot) throw new Error('input.projectRoot is required');
  if (!fs.existsSync(projectRoot)) throw new Error(`projectRoot not found: ${projectRoot}`);

  const docsDir = inputDocsDir
    ? path.isAbsolute(inputDocsDir)
      ? inputDocsDir
      : path.resolve(projectRoot, inputDocsDir)
    : path.join(projectRoot, 'docs');

  if (!fs.existsSync(docsDir)) {
    throw new Error(`docs directory not found: ${docsDir}`);
  }

  console.log(`[preview-website] Starting documentation preview`);
  console.log(`  Project root: ${projectRoot}`);
  console.log(`  Docs directory: ${docsDir}`);
  console.log(`  Run mdoc first: ${runMdoc}`);

  let mdocSuccess = true;
  let mdocOutput = '';

  if (runMdoc) {
    console.log('\n[Step 1/2] Running sbt docs/mdoc...');
    const result = spawnSync('sbt', ['docs/mdoc'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 600_000,
      shell: false,
    });
    mdocOutput = (result.stdout || '') + (result.stderr || '');
    mdocSuccess = (result.status ?? 1) === 0;

    if (mdocSuccess) {
      console.log('[Step 1/2] ✓ mdoc compilation succeeded');
    } else {
      console.error('[Step 1/2] ✗ mdoc compilation FAILED');
      console.error(mdocOutput.slice(-2000));
      return {
        success: false,
        url: '',
        pid: 0,
        buildSystem: 'unknown',
        previewCwd: docsDir,
        mdocRan: true,
        mdocSuccess: false,
        mdocOutput,
      } satisfies PreviewWebsiteResult;
    }
  }

  const stepN = runMdoc ? '2/2' : '1/1';
  console.log(`\n[Step ${stepN}] Starting preview server...`);

  try {
    const preview = await runPreview(docsDir);

    console.log(`\n[preview-website] ✓ Preview running`);
    console.log(`  URL:    ${preview.url}`);
    console.log(`  PID:    ${preview.pid}`);
    console.log(`  System: ${preview.buildSystem}`);
    console.log(`\n  To stop: kill ${preview.pid}`);

    return {
      success: true,
      url: preview.url,
      pid: preview.pid,
      buildSystem: preview.buildSystem,
      previewCwd: preview.previewCwd,
      mdocRan: runMdoc,
      mdocSuccess,
      mdocOutput,
    } satisfies PreviewWebsiteResult;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\n[preview-website] ✗ Failed to start preview: ${msg}`);
    return {
      success: false,
      url: '',
      pid: 0,
      buildSystem: 'unknown',
      previewCwd: docsDir,
      mdocRan: runMdoc,
      mdocSuccess,
      mdocOutput,
    } satisfies PreviewWebsiteResult;
  }
}
