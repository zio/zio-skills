import * as v from 'valibot';
import 'dotenv/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineWorkflow } from '@flue/runtime';
import docsRedundancyFixerAgent from '../agents/docs-redundancy-fixer.js';
import { runReduceRedundancyPhase } from '../actions/reduce-redundancy.js';
import { verifyBuild } from './phases/verify.js';

function inferDocsDir(filePath: string): string | null {
  const parts = filePath.split(path.sep);
  const docsIdx = parts.lastIndexOf('docs');
  if (docsIdx === -1) return null;
  return parts.slice(0, docsIdx + 1).join(path.sep);
}

export default defineWorkflow({
  agent: docsRedundancyFixerAgent,
  input: v.looseObject({}),
  run: reduceRedundancyRun as (ctx: any) => any,
});

async function reduceRedundancyRun({ harness, input }: { harness: any; input: any }) {
  const {
    filePath,
    typeName: typeNameInput,
    maxRounds,
  } = input as {
    filePath: string;
    typeName?: string;
    maxRounds?: number;
  };

  if (!filePath) throw new Error('input.filePath is required');
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const typeName = typeNameInput || path.basename(filePath, '.md');

  console.log(`[reduce-redundancy] Reducing redundancy in: ${filePath}`);
  console.log(`  Type name: ${typeName}`);

  const phasesCompleted: string[] = [];

  try {
    // Phase 1: Scan and fix redundancies
    console.log('\n[Phase 1] Redundancy Reduction: Scanning and fixing...');
    const redundancyResult = await runReduceRedundancyPhase(harness, {
      outputPath: filePath,
      projectRoot: path.dirname(filePath),
      typeName,
      maxRounds,
    });

    console.log(
      `[Phase 1] ${redundancyResult.passed ? '✓' : '⚠'} Redundancy reduction complete ` +
        `(${redundancyResult.rounds} round(s), ${redundancyResult.fixed} fixed)`
    );

    if (!redundancyResult.passed && redundancyResult.unresolvedItems.length > 0) {
      console.log(`  Unresolved (${redundancyResult.unresolvedItems.length}):`);
      redundancyResult.unresolvedItems.forEach((item) => console.log(`    - ${item}`));
    }
    phasesCompleted.push('reduceRedundancy');

    // Phase 2: Verify build (optional — skipped if no docs build system detected)
    console.log('\n[Phase 2] Build Verification: Verifying documentation builds...');
    let buildVerifyResult = {
      success: false,
      buildSystem: 'unknown',
      durationMs: 0,
      skipped: false,
    };

    const docsDir = inferDocsDir(filePath);
    if (docsDir) {
      try {
        const buildResult = await verifyBuild(docsDir);
        buildVerifyResult = { ...buildResult, skipped: false };
        console.log(
          `[Phase 2] ${buildResult.success ? '✓' : '⚠'} Build verification complete ` +
            `(${buildResult.buildSystem}, ${buildResult.durationMs}ms)`
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('No supported documentation build system detected')) {
          console.log('[Phase 2] ⚠ No documentation build system detected, skipping');
          buildVerifyResult = { success: true, buildSystem: 'none', durationMs: 0, skipped: true };
        } else {
          console.log(`[Phase 2] ⚠ Build verification failed: ${msg}`);
        }
      }
    } else {
      console.log(
        '[Phase 2] ⚠ Could not infer docs directory from file path, skipping build verification'
      );
      buildVerifyResult = { success: true, buildSystem: 'none', durationMs: 0, skipped: true };
    }
    phasesCompleted.push('verifyBuild');

    const success = redundancyResult.passed;
    console.log(`\n[reduce-redundancy] ${success ? '✓ SUCCESS' : '⚠ PARTIAL'}`);
    console.log(`  Phases completed: ${phasesCompleted.join(', ')}`);
    console.log(`  File: ${filePath}`);

    return {
      filePath,
      typeName,
      success,
      phasesCompleted,
      redundancy: {
        passed: redundancyResult.passed,
        rounds: redundancyResult.rounds,
        fixed: redundancyResult.fixed,
        findingsCount: redundancyResult.findingsCount,
        unresolvedItems: redundancyResult.unresolvedItems,
      },
      buildVerify: {
        success: buildVerifyResult.success,
        skipped: buildVerifyResult.skipped,
        buildSystem: buildVerifyResult.buildSystem,
        durationMs: buildVerifyResult.durationMs,
      },
    };
  } catch (error) {
    console.error(
      `[reduce-redundancy] Error: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      filePath,
      typeName,
      success: false,
      phasesCompleted,
      error: error instanceof Error ? error.message : String(error),
      redundancy: {
        passed: false,
        rounds: 0,
        fixed: 0,
        findingsCount: { lexical: 0, structural: 0, semantic: 0 },
        unresolvedItems: [],
      },
      buildVerify: {
        success: false,
        skipped: false,
        buildSystem: 'unknown',
        durationMs: 0,
      },
    };
  }
}
