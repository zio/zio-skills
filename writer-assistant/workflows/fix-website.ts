import 'dotenv/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineWorkflow } from '@flue/runtime';
import docsWriterAgent from '../agents/docs-writer.js';
import { runBuild } from '../lib/build-runner.js';

export interface FixWebsiteResult {
  success: boolean;
  rounds: number;
  errorCount: number;
  errors: string[];
  durationMs: number;
  buildSystem: string;
  buildCwd: string;
}

const DEFAULT_MAX_ROUNDS = 3;

/**
 * Parse website build errors from output.
 * Filters for lines containing error keywords, excluding noise.
 */
function parseWebsiteBuildErrors(output: string): string[] {
  const lines = output.split('\n');
  const errors: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip noise: progress, downloads, info messages
    if (
      trimmed.includes('[info]') ||
      trimmed.includes('[success]') ||
      trimmed.includes('download') ||
      trimmed.includes('Downloading') ||
      trimmed.includes('yarn add') ||
      trimmed.includes('npm notice') ||
      trimmed.match(/^\d+%|Working/)
    ) {
      continue;
    }

    // Capture error/warning lines
    if (
      trimmed.toLowerCase().includes('error:') ||
      trimmed.toLowerCase().includes('[error]') ||
      trimmed.toLowerCase().includes('failed') ||
      trimmed.toLowerCase().includes('error ts') ||
      trimmed.includes('ERROR -') ||
      trimmed.includes('WARNING -') ||
      trimmed.includes('broken link') ||
      trimmed.includes('✖')
    ) {
      errors.push(line);
    }
  }

  return errors;
}

export default defineWorkflow({
  agent: docsWriterAgent,
  run: fixWebsiteRun,
});

async function fixWebsiteRun({ harness, input }: { harness: any; input: any }) {
  const {
    projectRoot,
    docsDir: inputDocsDir,
    maxRounds: inputMaxRounds,
  } = input as {
    projectRoot: string;
    docsDir?: string;
    maxRounds?: number;
  };

  if (!projectRoot) throw new Error('input.projectRoot is required');
  if (!fs.existsSync(projectRoot)) throw new Error(`projectRoot not found: ${projectRoot}`);

  const maxRounds = inputMaxRounds ?? DEFAULT_MAX_ROUNDS;
  const docsDir = inputDocsDir
    ? path.isAbsolute(inputDocsDir)
      ? inputDocsDir
      : path.resolve(projectRoot, inputDocsDir)
    : path.join(projectRoot, 'docs');

  if (!fs.existsSync(docsDir)) {
    throw new Error(`docs directory not found: ${docsDir}`);
  }

  console.log(`[fix-website] Starting website build with auto-fix (max ${maxRounds} rounds)`);
  console.log(`  Project root: ${projectRoot}`);
  console.log(`  Docs directory: ${docsDir}`);

  const startMs = Date.now();
  let round = 0;
  let currentErrors: string[] = [];
  let buildSystem = 'unknown';
  let buildCwd = docsDir;

  // Phase 1: Initial check
  console.log('\n[fix-website] Phase 1: Initial check');
  try {
    const buildResult = await runBuild(docsDir);
    buildSystem = buildResult.buildSystem;
    buildCwd = buildResult.buildCwd;
    currentErrors = parseWebsiteBuildErrors(buildResult.output);

    if (buildResult.success && currentErrors.length === 0) {
      console.log('[fix-website] ✓ Build successful, no errors found');
      const durationMs = Date.now() - startMs;
      return {
        success: true,
        rounds: 0,
        errorCount: 0,
        errors: [],
        durationMs,
        buildSystem,
        buildCwd,
      } satisfies FixWebsiteResult;
    }

    console.log(`[fix-website] Found ${currentErrors.length} error(s), starting fix loop`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startMs;
    console.error(`[fix-website] Initial build failed: ${errorMsg}`);
    return {
      success: false,
      rounds: 0,
      errorCount: 1,
      errors: [errorMsg],
      durationMs,
      buildSystem,
      buildCwd,
    };
  }

  const session = await harness.session('fix-website-fixer');

  // Phase 2+: Fix loop
  for (round = 1; round <= maxRounds; round++) {
    console.log(`\n[fix-website] Phase ${round + 1}: Fix attempt ${round}/${maxRounds}`);

    if (currentErrors.length === 0) {
      console.log('[fix-website] ✓ No errors remaining, build successful');
      break;
    }

    // Prepare error list for fixer
    const errorList = currentErrors.map((e) => `  ${e}`).join('\n');

    const fixPrompt = `Fix the following documentation website build errors in ${projectRoot}.

Errors to fix:
${errorList}

For each error:
1. Read the relevant file(s) mentioned in the error
2. Identify the root cause (broken link, syntax error, missing file, etc.)
3. Fix the content or file reference
4. Verify the fix is reasonable

Report each fix as:
  ✓ Fixed <file>: <description>
or
  Could not fix <file>: <reason>

Focus on fixing the actual build errors. Be pragmatic—if a link is broken, fix the link; if a file is missing, remove the reference.`;

    const fixResult = await session.prompt(fixPrompt);

    console.log(`[fix-website] Fixer response received, re-checking build...`);

    // Re-check after fix attempt
    try {
      const buildResult = await runBuild(docsDir);
      buildSystem = buildResult.buildSystem;
      buildCwd = buildResult.buildCwd;
      currentErrors = parseWebsiteBuildErrors(buildResult.output);

      const errorsFixed = currentErrors.length;

      if (errorsFixed === 0) {
        console.log('[fix-website] ✓ All errors fixed, build successful');
        break;
      }

      console.log(`[fix-website] Still ${errorsFixed} error(s) remaining`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[fix-website] Build check failed: ${errorMsg}`);
      currentErrors = [errorMsg];
    }
  }

  const durationMs = Date.now() - startMs;
  const finalSuccess = currentErrors.length === 0;

  console.log(`\n[fix-website] ${finalSuccess ? '✓ SUCCESS' : '⚠ PARTIAL'} (${round} round(s))`);
  if (currentErrors.length > 0) {
    console.log(`  Remaining errors (${currentErrors.length}):`);
    currentErrors.slice(0, 5).forEach((e) => console.log(`    ${e}`));
    if (currentErrors.length > 5) {
      console.log(`    ... and ${currentErrors.length - 5} more`);
    }
  }

  return {
    success: finalSuccess,
    rounds: round,
    errorCount: currentErrors.length,
    errors: currentErrors,
    durationMs,
    buildSystem,
    buildCwd,
  } satisfies FixWebsiteResult;
}
