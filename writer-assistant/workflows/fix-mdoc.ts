import 'dotenv/config.js';
import * as fs from 'node:fs';
import { defineWorkflow } from '@flue/runtime';
import docsWriterAgent from '../agents/docs-writer.js';
import { createRunMdoc } from '../tools/run_mdoc.js';
import {
  MdocError,
  resolvePaths,
  buildMdocCommand,
  runMdocCommand,
  parseMdocErrors,
} from './utils/mdoc-runner.js';

export interface FixMdocResult {
  success: boolean;
  rounds: number;
  errorCount: number;
  errors: MdocError[];
  durationMs: number;
  resolvedPaths: string[];
}

const DEFAULT_MAX_ROUNDS = 3;

export default defineWorkflow({
  agent: docsWriterAgent,
  run: fixMdocRun,
});

async function fixMdocRun({ harness, input }: { harness: any; input: any }) {
  const {
    projectRoot,
    paths: rawPaths,
    maxRounds: inputMaxRounds,
  } = input as {
    projectRoot: string;
    paths?: string | string[];
    maxRounds?: number;
  };

  if (!projectRoot) throw new Error('input.projectRoot is required');
  if (!fs.existsSync(projectRoot)) throw new Error(`projectRoot not found: ${projectRoot}`);

  const maxRounds = inputMaxRounds ?? DEFAULT_MAX_ROUNDS;
  const { resolvedPaths, missing } = resolvePaths(projectRoot, rawPaths);

  if (missing.length > 0) {
    throw new Error(
      `Paths not found (relative to projectRoot):\n${missing.map((p) => `  - ${p}`).join('\n')}`
    );
  }

  const command = buildMdocCommand(resolvedPaths);

  console.log(`[fix-mdoc] Starting mdoc compilation with auto-fix (max ${maxRounds} rounds)`);
  console.log(`  Project root: ${projectRoot}`);
  if (resolvedPaths.length > 0) {
    console.log(`  Files to compile (${resolvedPaths.length}):`);
    resolvedPaths.forEach((p) => console.log(`    - ${p}`));
  } else {
    console.log(`  Scope: entire docs project`);
  }
  console.log(`  Command: ${command}`);

  const startMs = Date.now();
  let round = 0;
  let currentErrors: MdocError[] = [];

  // Phase 1: Initial check
  console.log('\n[fix-mdoc] Phase 1: Initial check');
  let result = runMdocCommand(command, projectRoot);
  currentErrors = parseMdocErrors(result.stdout + result.stderr);
  const initialSuccess = result.exitCode === 0 && currentErrors.length === 0;

  if (initialSuccess) {
    console.log('[fix-mdoc] ✓ No errors found, documentation compiles successfully');
    const durationMs = Date.now() - startMs;
    return {
      success: true,
      rounds: 0,
      errorCount: 0,
      errors: [],
      durationMs,
      resolvedPaths,
    } satisfies FixMdocResult;
  }

  console.log(`[fix-mdoc] Found ${currentErrors.length} error(s), starting fix loop`);

  const session = await harness.session('fix-mdoc-fixer');

  // Phase 2+: Fix loop
  for (round = 1; round <= maxRounds; round++) {
    console.log(`\n[fix-mdoc] Phase ${round + 1}: Fix attempt ${round}/${maxRounds}`);

    if (currentErrors.length === 0) {
      console.log('[fix-mdoc] ✓ No errors remaining, compilation successful');
      break;
    }

    // Prepare error list for fixer
    const errorList = currentErrors
      .map((e) => `  ${e.file}${e.line != null ? `:${e.line}` : ''}: ${e.message}`)
      .join('\n');

    const fixPrompt = `Fix the following mdoc compilation errors in ${projectRoot}.

Errors to fix:
${errorList}

For each error:
1. Read the file at that location
2. Find the failing code block
3. Fix the Scala code so it compiles
4. Use the run_mdoc tool to verify your fix compiles

Report each fix as:
  ✓ Fixed <file>:<line>
or
  Could not fix <file>:<line> (reason)

Focus on fixing the actual compilation errors, not cosmetic issues.`;

    const fixResult = await session.prompt(fixPrompt, {
      tools: [createRunMdoc(projectRoot)],
    });

    console.log(`[fix-mdoc] Fixer response received, re-checking compilation...`);

    // Re-check after fix attempt
    result = runMdocCommand(command, projectRoot);
    currentErrors = parseMdocErrors(result.stdout + result.stderr);
    const errorsFixed = currentErrors.length;

    if (errorsFixed === 0) {
      console.log('[fix-mdoc] ✓ All errors fixed, compilation successful');
      break;
    }

    console.log(`[fix-mdoc] Still ${errorsFixed} error(s) remaining`);
  }

  const durationMs = Date.now() - startMs;
  const finalSuccess = currentErrors.length === 0;

  console.log(`\n[fix-mdoc] ${finalSuccess ? '✓ SUCCESS' : '⚠ PARTIAL'} (${round} round(s))`);
  if (currentErrors.length > 0) {
    console.log(`  Remaining errors (${currentErrors.length}):`);
    currentErrors.forEach((e) => {
      const loc = e.file ? `${e.file}${e.line != null ? `:${e.line}` : ''}` : '(general)';
      console.log(`    [${loc}] ${e.message}`);
    });
  }

  return {
    success: finalSuccess,
    rounds: round,
    errorCount: currentErrors.length,
    errors: currentErrors,
    durationMs,
    resolvedPaths,
  } satisfies FixMdocResult;
}
