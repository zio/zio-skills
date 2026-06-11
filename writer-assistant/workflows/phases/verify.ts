import { runBuild } from '../../lib/build-runner.js';

export interface VerifyResult {
  success: boolean;
  buildSystem: string;
  buildCwd: string;
  durationMs: number;
  output: string;
}

/**
 * Verify that documentation builds successfully after cross-reference additions
 */
export async function verifyBuild(docsDir: string): Promise<VerifyResult> {
  console.log('[verify] Starting documentation build verification...\n');

  try {
    const result = await runBuild(docsDir);

    if (result.success) {
      console.log(`\n[verify] ✓ Build passed in ${result.durationMs}ms`);
    } else {
      console.error(`\n[verify] ✗ Build failed (exit code ${result.exitCode})`);
    }

    return {
      success: result.success,
      buildSystem: result.buildSystem,
      buildCwd: result.buildCwd,
      durationMs: result.durationMs,
      output: result.output,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[verify] ✗ Build verification failed: ${errorMessage}`);
    throw error;
  }
}
