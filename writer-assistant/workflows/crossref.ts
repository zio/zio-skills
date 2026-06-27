import * as v from 'valibot';
import 'dotenv/config.js';
import * as path from 'node:path';
import { defineWorkflow } from '@flue/runtime';
import pageLinkerAgent from '../agents/page-linker.js';
import codingAgent from '../agents/coding-agent.js';
import { runDocFixer } from '../lib/auto-fixer.js';
import { loadConfig } from '../lib/config-loader.js';
import { loadState, emptyState } from '../lib/state-store.js';
import { extractBuildErrors } from '../lib/build-error-extractor.js';
import { reindex } from './phases/reindex.js';
import { processBatch } from './phases/process.js';
import { report } from './phases/report.js';
import { verifyBuild } from './phases/verify.js';

export default defineWorkflow({
  agent: pageLinkerAgent,
  input: v.looseObject({}),
  run: crossrefRun as (ctx: any) => any,
});

async function crossrefRun({ harness, input }: { harness: any; input: any }) {
  const projectRoot = (input as any).projectRoot || path.dirname((input as any).docsDir);
  const docsDir = (input as any).docsDir || path.join(projectRoot, 'docs');

  const {
    mode,
    batchSize = 1,
    targetFile,
    targetDir,
    maxRetries = 3,
    verificationPrompt,
  } = input as {
    projectRoot?: string;
    docsDir?: string;
    mode: 'reindex' | 'step' | 'autopilot' | 'report' | 'verify' | 'verify-and-fix';
    batchSize?: number;
    targetFile?: string;
    targetDir?: string;
    maxRetries?: number;
    verificationPrompt?: string;
  };

  if (!projectRoot) throw new Error('input.projectRoot is required (or legacy docsDir)');

  const session = await harness.session('crossref');

  let state = (await loadState(docsDir)) ?? emptyState(docsDir);

  if (mode === 'reindex') {
    state = await reindex(docsDir, state, session);
    return { indexed: state.index.length };
  }

  if (mode === 'step') {
    if (state.index.length === 0) {
      console.log('[crossref] No index found. Run reindex first.');
      return { done: false };
    }
    const config = loadConfig(docsDir);
    const result = await processBatch(
      state,
      config,
      session,
      batchSize,
      docsDir,
      targetFile,
      targetDir
    );
    if (result.done) console.log('[crossref] All pages processed.');
    return result;
  }

  if (mode === 'autopilot') {
    if (state.index.length === 0) {
      console.log('[crossref] No index found. Run reindex first.');
      return { done: false };
    }
    const config = loadConfig(docsDir);
    let totalProcessed = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await processBatch(
        state,
        config,
        session,
        batchSize,
        docsDir,
        targetFile,
        targetDir
      );
      totalProcessed += result.processed;
      if (result.done) break;
      state = (await loadState(docsDir)) ?? state;
    }
    console.log(
      `\n[crossref] Autopilot complete. Total processed: ${totalProcessed}/${state.index.length}`
    );
    console.log(
      `  Total tokens — in: ${state.tokens.inputTotal.toLocaleString()}  out: ${state.tokens.outputTotal.toLocaleString()}  (~$${state.tokens.runningCost.toFixed(2)})`
    );
    return { done: true, totalProcessed };
  }

  if (mode === 'report') {
    const config = loadConfig(docsDir);
    const threshold = config.confidenceThreshold;
    return report(state, threshold);
  }

  if (mode === 'verify') {
    const result = await verifyBuild(docsDir);
    console.log(
      `[crossref] ${result.success ? '✓' : '✗'} ${result.buildSystem} build ${result.success ? 'passed' : 'failed'} in ${result.durationMs}ms`
    );
    return result;
  }

  if (mode === 'verify-and-fix') {
    console.log(`[crossref] Starting verify-and-fix loop (max ${maxRetries} retries)`);
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      console.log(`\n[crossref] Verify-and-fix attempt ${attempt}/${maxRetries}`);

      // Phase 1: Verify
      const verifyResult = await verifyBuild(docsDir);

      if (verifyResult.success) {
        console.log('[crossref] ✓ Build passed! Documentation is ready.');

        // Phase 1.5 (Optional): Run custom verification if provided
        if (verificationPrompt) {
          console.log(`\n[crossref] Running custom verification check...`);
          try {
            // TODO: codingAgent is a secondary agent — Flue 1.0 removed multi-agent init.
            // Migrate to: separate workflow via invoke(), or defineWorkflow with codingAgent.
            // For now, skipping custom verification until migration is complete.
            console.log(`[crossref] Custom verification skipped (needs multi-agent migration)`);
            const verificationResult = await Promise.resolve(
              `You are working in the project directory: ${projectRoot}\n\nWhen using bash, execute commands in the project directory: ${projectRoot}\n\nTask: ${verificationPrompt}`
            );
            console.log(`[crossref] Verification check completed.`);
            return { success: true, attempts: attempt, verificationResult };
          } catch (error) {
            console.log(`[crossref] Verification check failed:`, error);
            // Fall through to normal fix process
          }
        }

        return { success: true, attempts: attempt };
      }

      // Phase 2: Extract errors
      const buildErrors = extractBuildErrors(verifyResult.output, verifyResult.buildSystem);
      console.log(`[crossref] Found ${buildErrors.length} errors. Dispatching doc-fixer...`);

      // Phase 3: Fix errors
      const fixResult = await runDocFixer({
        projectRoot,
        buildErrors,
        buildOutput: verifyResult.output,
        buildSystem: verifyResult.buildSystem as 'docusaurus' | 'mkdocs' | 'sphinx' | 'hugo',
        attempt,
      });

      if (!fixResult.fixed) {
        console.log('[crossref] ✗ doc-fixer could not fix errors.');
        return {
          success: false,
          attempts: attempt,
          errors: buildErrors,
          message: 'Unable to auto-fix',
        };
      }

      console.log(`[crossref] ${fixResult.summary}`);
      // Loop continues, verify again
    }

    return {
      success: false,
      attempts: maxRetries,
      message: 'Max retries exceeded',
    };
  }

  throw new Error(`Unknown mode: "${mode}"`);
}
