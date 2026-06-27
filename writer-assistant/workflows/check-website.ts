import 'dotenv/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runBuild } from '../lib/build-runner.js';

export interface CheckWebsiteResult {
  success: boolean;
  buildSystem: string;
  buildCwd: string;
  durationMs: number;
  errorCount: number;
  errors: string[];
  output: string;
  mdocRan: boolean;
  mdocSuccess: boolean;
}

/**
 * Parse true build errors (not warnings) from output.
 * Only captures lines that indicate actual build failures, not Docusaurus
 * warnings that still allow a successful build (broken links, deprecated options, etc.).
 */
function parseWebsiteBuildErrors(output: string): string[] {
  const lines = output.split('\n');
  const errors: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip noise and known non-fatal Docusaurus warnings
    if (
      trimmed.includes('[info]') ||
      trimmed.includes('[INFO]') ||
      trimmed.includes('[success]') ||
      trimmed.includes('[SUCCESS]') ||
      trimmed.includes('[WARNING]') ||
      trimmed.includes('[webpackbar]') ||
      trimmed.includes('download') ||
      trimmed.includes('Downloading') ||
      trimmed.includes('yarn add') ||
      trimmed.includes('npm notice') ||
      trimmed.match(/^\d+%|Working/)
    ) {
      continue;
    }

    // Capture actual error lines (not warnings)
    if (
      trimmed.toLowerCase().includes('[error]') ||
      trimmed.toLowerCase().includes('error ts') ||
      trimmed.includes('ERROR -') ||
      trimmed.includes('✖') ||
      // yarn/npm fatal errors (non-warning)
      (trimmed.toLowerCase().startsWith('error ') && !trimmed.includes('[WARNING]'))
    ) {
      errors.push(line);
    }
  }

  return errors;
}

// TODO: defineWorkflow requires an agent — assign one when migrating fully to Flue 1.0
export async function run({ input }: { input: any }) {
  const {
    projectRoot,
    docsDir: inputDocsDir,
    runMdoc = false,
  } = input as {
    projectRoot: string;
    docsDir?: string;
    /** Run `sbt docs/mdoc` before checking the website. Default: false. */
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

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  check-website`);
  console.log(`══════════════════════════════════════════`);
  console.log(`  Project root : ${projectRoot}`);
  console.log(`  Docs dir     : ${docsDir}`);
  console.log(`  Run mdoc     : ${runMdoc}`);
  console.log(`══════════════════════════════════════════\n`);

  const startMs = Date.now();

  console.log(`[check-website] ▶ Starting build...`);
  console.log(`─────────────────────────────────────────\n`);

  try {
    const buildResult = await runBuild(docsDir, runMdoc);
    const durationMs = Date.now() - startMs;

    console.log(`\n─────────────────────────────────────────`);

    // Trust exit code as ground truth. Docusaurus warnings (broken links, deprecated
    // options) don't fail the build — only capture true errors for the error list.
    const errors = parseWebsiteBuildErrors(buildResult.output);
    const success = buildResult.success;

    const elapsed = (durationMs / 1000).toFixed(1);
    console.log(`[check-website] ${success ? '✓ PASSED' : '✗ FAILED'} in ${elapsed}s`);
    if (errors.length > 0) {
      console.log(`\n  Build errors (${errors.length}):`);
      errors.forEach((e) => console.log(`    ${e}`));
    } else if (!success) {
      console.log(`  Build exited with non-zero code — see output above for details`);
    }

    return {
      success,
      buildSystem: buildResult.buildSystem,
      buildCwd: buildResult.buildCwd,
      durationMs,
      errorCount: errors.length,
      errors,
      output: buildResult.output,
      mdocRan: runMdoc,
      mdocSuccess: true,
    } satisfies CheckWebsiteResult;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startMs;
    const elapsed = (durationMs / 1000).toFixed(1);

    console.error(`\n─────────────────────────────────────────`);
    console.error(`[check-website] ✗ FAILED in ${elapsed}s: ${errorMsg}`);

    return {
      success: false,
      buildSystem: 'unknown',
      buildCwd: docsDir,
      durationMs,
      errorCount: 1,
      errors: [errorMsg],
      output: errorMsg,
      mdocRan: runMdoc,
      mdocSuccess: true,
    };
  }
}
