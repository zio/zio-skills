import 'dotenv/config.js';
import * as fs from 'node:fs';
import {
  MdocError,
  resolvePaths,
  buildMdocCommand,
  runMdocCommand,
  parseMdocErrors,
} from './utils/mdoc-runner.js';

export interface CheckMdocResult {
  success: boolean;
  command: string;
  errorCount: number;
  errors: MdocError[];
  durationMs: number;
  resolvedPaths: string[];
}

// TODO: defineWorkflow requires an agent — assign one when migrating fully to Flue 1.0
export async function run({ input }: { input: any }) {
  const { projectRoot, paths: rawPaths } = input as {
    projectRoot: string;
    paths?: string | string[];
  };

  if (!projectRoot) throw new Error('input.projectRoot is required');
  if (!fs.existsSync(projectRoot)) throw new Error(`projectRoot not found: ${projectRoot}`);

  const { resolvedPaths, missing } = resolvePaths(projectRoot, rawPaths);

  if (missing.length > 0) {
    throw new Error(
      `Paths not found (relative to projectRoot):\n${missing.map((p) => `  - ${p}`).join('\n')}`
    );
  }

  const command = buildMdocCommand(resolvedPaths);

  console.log(`[check-mdoc] Starting mdoc compilation`);
  console.log(`  Project root: ${projectRoot}`);
  if (resolvedPaths.length > 0) {
    console.log(`  Files to compile (${resolvedPaths.length}):`);
    resolvedPaths.forEach((p) => console.log(`    - ${p}`));
  } else {
    console.log(`  Scope: entire docs project`);
  }
  console.log(`  Command: ${command}`);

  const startMs = Date.now();
  const { stdout, stderr, exitCode } = runMdocCommand(command, projectRoot);
  const durationMs = Date.now() - startMs;
  const fullOutput = stdout + stderr;
  const errors = parseMdocErrors(fullOutput);
  const success = exitCode === 0 && errors.length === 0;

  console.log(`\n[check-mdoc] ${success ? '✓ PASSED' : '✗ FAILED'} (${durationMs}ms)`);
  if (errors.length > 0) {
    console.log(`  Errors (${errors.length}):`);
    errors.forEach((e) => {
      const loc = e.file ? `${e.file}${e.line != null ? `:${e.line}` : ''}` : '(general)';
      console.log(`    [${loc}] ${e.message}`);
    });
  }

  return {
    success,
    command,
    errorCount: errors.length,
    errors,
    durationMs,
    resolvedPaths,
  } satisfies CheckMdocResult;
}
