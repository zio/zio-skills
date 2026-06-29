import * as v from 'valibot';
import 'dotenv/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineWorkflow } from '@flue/runtime';
import docsWriterAgent from '../agents/docs-writer.js';
import { validatePathsAndResolve, inferSourceDirs } from '../lib/scala-source-discovery.js';
import { runResearchPhase } from './phases/research.js';
import { runReviewPhase } from './phases/review.js';
import { runStylePhase } from './phases/style.js';
import { runExamplesPhase } from './phases/examples.js';
import { runBuild } from '../lib/build-runner.js';
import { createRunMdoc } from '../tools/run_mdoc.js';
import { findRecentlyModifiedMarkdownFiles } from '../lib/markdown-utils.js';

function parseBuildErrors(output: string): string[] {
  const errors: string[] = [];
  for (const line of output.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (
      t.includes('[info]') ||
      t.includes('[success]') ||
      t.includes('download') ||
      t.includes('Downloading') ||
      t.includes('yarn add') ||
      t.includes('npm notice') ||
      t.match(/^\d+%|Working/)
    )
      continue;
    if (
      t.toLowerCase().includes('error:') ||
      t.toLowerCase().includes('[error]') ||
      t.toLowerCase().includes('failed') ||
      t.toLowerCase().includes('error ts') ||
      t.includes('ERROR -') ||
      t.includes('broken link') ||
      t.includes('✖')
    ) {
      errors.push(line);
    }
  }
  return errors;
}

export default defineWorkflow({
  agent: docsWriterAgent,
  input: v.looseObject({}),
  run: writeHowToGuideRun as (ctx: any) => any,
});

async function writeHowToGuideRun({ harness, input }: { harness: any; input: any }) {
  const {
    projectRoot,
    outputPath,
    topic,
    examples: examplesPayload,
    skipPhases = [],
  } = input as {
    projectRoot: string;
    outputPath: string;
    topic: string;
    /** Optional: generate companion Scala examples after writing the guide. */
    examples?: { moduleName: string; packageName?: string; parentModule?: string };
    /**
     * Phase names to skip. Skipped phases are counted as completed without running.
     * Valid values: "research" | "write" | "examples" | "verify" | "integrate" | "review" | "style" | "verifyBuild"
     */
    skipPhases?: string[];
  };

  if (!projectRoot) throw new Error('input.projectRoot is required');
  if (!outputPath) throw new Error('input.outputPath is required');
  if (!topic) throw new Error('input.topic is required');

  const resolvedOutputPath = validatePathsAndResolve(projectRoot, outputPath);
  const sourceDirs = inferSourceDirs(projectRoot);
  const outputFileName = path.basename(outputPath, '.md');

  console.log(`[docs-write-how-to-guide] Starting how-to guide generation`);
  console.log(`  Topic: ${topic}`);
  console.log(`  Output path (relative): ${outputPath}`);
  console.log(`  Output path (resolved): ${resolvedOutputPath}`);
  console.log(`  Project root: ${projectRoot}`);
  console.log(`  Possible source dirs (discovered):`);
  sourceDirs.forEach((dir, i) => {
    console.log(`    [${i + 1}] ${dir}`);
  });

  const docsDir = path.join(projectRoot, 'docs');
  const phasesCompleted: string[] = [];

  try {
    process.env.FLUE_PROJECT_ROOT = projectRoot;

    // Phase 1: Research
    let researchResult = '';
    if (skipPhases.includes('research')) {
      console.log('\n[Phase 1] ⏭ Research skipped');
      phasesCompleted.push('research');
    } else {
      console.log('\n[Phase 1] Research: Understanding the topic...');
      researchResult = await runResearchPhase(harness, {
        projectRoot,
        typeName: topic,
        resolvedOutputPath,
        sourceDirs,
        focus: 'guide',
      });
      console.log('[Phase 1] ✓ Research complete');
      phasesCompleted.push('research');
    }

    // Phase 2-6: Initialize writer session only if needed
    const writerPhases = ['write', 'verify', 'integrate', 'review', 'style'];
    const needsWriterSession = writerPhases.some((p) => !skipPhases.includes(p));
    let session: any = null;
    if (needsWriterSession) {
      session = await harness.session('docs-write-how-to-guide');
    }

    // Phase 2: Write Guide
    let phase2StartTime = Date.now();
    if (skipPhases.includes('write')) {
      console.log('\n[Phase 2] ⏭ Write skipped');
      phasesCompleted.push('write');
    } else {
      console.log('\n[Phase 2] Writing: Generating how-to guide...');
      phase2StartTime = Date.now();
      const writePrompt = `**Research Findings (from research phase):**
${researchResult}

---

**Phase 2: Write How-To Guide**

Based on the research findings above, now write a comprehensive how-to guide for: ${topic}

**What makes a how-to guide different from a tutorial:**
- Goal-oriented, not pedagogical — reader wants to accomplish a specific task, not learn concepts
- Assumes basic familiarity with the library — skip conceptual preambles
- Shows practical, realistic examples close to production use
- Introduces types and APIs only as needed to achieve the goal

**Requirements:**
- Output file path: ${resolvedOutputPath}
- File must be in docs/guides/ directory
- File must have proper frontmatter with id, title, description, and keywords
  - description: one sentence, ≤150 characters, describes the concrete goal the guide achieves
  - keywords: 3-7 meaningful phrases (1-3 words each), e.g. feature names, patterns, use cases
- Follow this exact 8-section structure:

**Section structure (in order):**
1. **Introduction** — 1 paragraph: what the reader will accomplish, why it's useful, the approach in one sentence
2. **The Problem** — concrete problem statement + why it matters + "before" code showing the pain
3. **Prerequisites** — sbt dependency, base imports in \`mdoc:silent\`, assumed knowledge
4. **The Core Model** — domain types in \`mdoc:silent\`, brief explanation of choices
5. **Step-by-step sections** (3-6 sections) — one new concept each: 1-3 sentence intro → code → result/output
6. **Putting It Together** — complete working example combining all steps
7. **Running the Examples** — follow the docs-examples skill "Running the Examples" section template
8. **Going Further** (optional) — links to reference pages, variations, related guides

**Writing guidance:**
- Use the docs-how-to-guide skill for detailed conventions
- Start immediately with the goal — no warm-up, no "in this guide we will"
- Use direct imperative prose: "Define a Schema", "Create a codec", "Run the effect"
- Show intermediate results (printed output, types) after major steps
- The Problem section MUST include a short code example showing the painful/boilerplate approach
- Each step-by-step section covers exactly one concept — split if two things are happening
- "Putting It Together" should be copy-paste runnable

Write the complete markdown file and save it to the specified output path.`;

      await session!.prompt(writePrompt);
      console.log('[Phase 2] ✓ Guide written');
      phasesCompleted.push('write');
    }

    // Phase 2.5: Examples (optional)
    let examplesResult: Awaited<ReturnType<typeof runExamplesPhase>> | null = null;
    if (examplesPayload) {
      if (skipPhases.includes('examples')) {
        console.log('\n[Phase 2.5] ⏭ Examples skipped');
        phasesCompleted.push('examples');
      } else {
        console.log('\n[Phase 2.5] Examples: Generating companion Scala examples...');
        examplesResult = await runExamplesPhase(harness, {
          projectRoot,
          moduleName: examplesPayload.moduleName,
          packageName: examplesPayload.packageName,
          parentModule: examplesPayload.parentModule,
          topic,
          docType: 'how-to-guide',
          outputDocPath: resolvedOutputPath,
          session: session ?? undefined,
        });
        console.log(
          `[Phase 2.5] ${examplesResult.success ? '✓' : '⚠'} Examples phase complete ` +
            `(${examplesResult.exampleFiles.length} files, compile: ${examplesResult.compileSuccess ? '✓' : '✗'}, run: ${examplesResult.runSuccess ? '✓' : '✗'})`
        );
        phasesCompleted.push('examples');
      }
    }

    const changedFiles = findRecentlyModifiedMarkdownFiles(projectRoot, docsDir, phase2StartTime);
    console.log(`\n[Phase 2→3] Found ${changedFiles.length} changed/new markdown files:`);
    changedFiles.forEach((file) => console.log(`  - ${file}`));

    // Phase 3: Verify
    if (skipPhases.includes('verify')) {
      console.log('\n[Phase 3] ⏭ Verify skipped');
      phasesCompleted.push('verify');
    } else {
      console.log('\n[Phase 3] Verifying: Checking guide and code...');
      const changedFilesStr =
        changedFiles.length > 0
          ? `\n\n**Files to compile with mdoc** (detected as new/changed):\n${changedFiles.map((f) => `- ${f}`).join('\n')}`
          : '\n\n**Note:** No additional markdown files were changed. Compile the main output file only.';

      const verifyPrompt = `**Phase 3: Verify How-To Guide**

Verify the how-to guide you just wrote for ${topic} at ${resolvedOutputPath}

**Verification steps:**

1. **Verify structure compliance**
   - Check that all required sections are present: Introduction, The Problem, Prerequisites, The Core Model, step-by-step sections, Putting It Together, Running the Examples
   - Confirm The Problem section includes: concrete problem statement + why it matters + a "before" code example
   - Verify each step-by-step section covers exactly one concept with at least one code example
   - Confirm "Putting It Together" is a complete, copy-paste runnable example
   - Check that no section is pure prose — every section must have at least one code block

2. **Compile with run_mdoc**${changedFilesStr}
   - **CRITICAL: Use ONLY the run_mdoc tool for compilation** (do not use bash/sbt directly)
   - Call run_mdoc with paths: ${JSON.stringify(changedFiles)}
   - If run_mdoc returns errors, fix the markdown and call it again
   - Iterate until all code blocks compile with zero errors

3. **Check how-to guide style**
   - Verify prose is direct and imperative (not warm/tutorial-style)
   - Check that there is no conceptual preamble before The Problem section
   - Ensure intermediate results are shown after major steps
   - Verify no blank lines between consecutive code blocks
   - Confirm the output file is under docs/guides/ (not docs/reference/ or docs/tutorials/)

4. **Review CHECKLIST.md**
   - Use the checklist in the docs-how-to-guide skill to self-verify all items
   - Focus on Content Quality, Technical Accuracy, and Companion Examples sections
   - Fix any violations found before reporting complete

Report:
- Structure compliance status
- Final mdoc error count (should be 0)
- CHECKLIST status
- Any fixes applied`;

      await session!.prompt(verifyPrompt, {
        tools: [createRunMdoc(projectRoot)],
      });

      console.log('[Phase 3] ✓ Verification complete');
      phasesCompleted.push('verify');
    }

    // Phase 4: Format and Integrate
    if (skipPhases.includes('integrate')) {
      console.log('\n[Phase 4] ⏭ Integrate skipped');
      phasesCompleted.push('integrate');
    } else {
      console.log('\n[Phase 4] Integrating: Finalizing documentation...');
      const integratePrompt = `**Phase 4: Format and Integrate**

Finalize the how-to guide for ${topic} and integrate it into the docs structure.

**Integration steps:**

1. **Format Scala code**
   - Run: sbt scalafmtAll
   - Ensure all generated Scala files are properly formatted

2. **Run lint checks**
   - Run: sbt check
   - Verify all lint checks pass

3. **Update sidebars.js** (if it exists)
   - Add entry for ${outputFileName} under the "Guides" category (not "Reference" or "Tutorials")
   - Create the "Guides" category if it doesn't exist
   - Ensure proper nesting and alphabetical ordering
   - The entry should link to docs/guides/${outputFileName}.md

4. **Update docs/index.md** (if it exists)
   - Add cross-reference to the new guide
   - Link to: guides/${outputFileName}

5. **Update related documentation**
   - Check if reference pages for types used in this guide should link back to the guide
   - Add reciprocal cross-references where appropriate (e.g., if the guide covers Schema, add a "See also" link from docs/reference/schema.md)

Report final status and any updates made.`;

      await session!.prompt(integratePrompt);
      console.log('[Phase 4] ✓ Integration complete');
      phasesCompleted.push('integrate');
    }

    // Phase 5: Review and Fix
    let reviewResult = {
      approved: true,
      rounds: 0,
      findingsFixed: { HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>,
      unresolvedIssues: [] as string[],
    };
    if (skipPhases.includes('review')) {
      console.log('\n[Phase 5] ⏭ Review skipped');
      phasesCompleted.push('review');
    } else {
      console.log('\n[Phase 5] Reviewing: Critique and fix loop...');
      reviewResult = await runReviewPhase(harness, {
        outputPath: resolvedOutputPath,
        projectRoot,
        typeName: topic,
        session: session!,
        sourceFiles: sourceDirs,
      });
      console.log(
        `[Phase 5] ${reviewResult.approved ? '✓' : '⚠'} Review complete (${reviewResult.rounds} round(s))`
      );
      if (!reviewResult.approved && reviewResult.unresolvedIssues.length > 0) {
        console.log(`  Unresolved issues (${reviewResult.unresolvedIssues.length}):`);
        reviewResult.unresolvedIssues.forEach((issue) => console.log(`    - ${issue}`));
      }
      phasesCompleted.push('review');
    }

    // Phase 6: Style Validation
    let styleResult = {
      passed: true,
      rounds: 0,
      violations: {} as Record<string, number>,
      unresolvedViolations: [] as string[],
    };
    if (skipPhases.includes('style')) {
      console.log('\n[Phase 6] ⏭ Style skipped');
      phasesCompleted.push('style');
    } else {
      console.log('\n[Phase 6] Validating: Checking prose style...');
      styleResult = await runStylePhase(harness, {
        outputPath: resolvedOutputPath,
        projectRoot,
        typeName: topic,
        session: session!,
      });
      console.log(
        `[Phase 6] ${styleResult.passed ? '✓' : '⚠'} Style validation complete (${styleResult.rounds} round(s))`
      );
      if (!styleResult.passed && styleResult.unresolvedViolations.length > 0) {
        console.log(`  Unresolved violations (${styleResult.unresolvedViolations.length}):`);
        styleResult.unresolvedViolations.forEach((violation) => console.log(`    - ${violation}`));
      }
      phasesCompleted.push('style');
    }

    // Phase 7: Build Verification with auto-fix loop
    const MAX_BUILD_FIX_ROUNDS = 3;
    console.log(
      `\n[Phase 7] Build Verification: Verifying documentation builds (max ${MAX_BUILD_FIX_ROUNDS} fix rounds)...`
    );
    let buildVerifyResult = {
      success: false,
      buildSystem: 'unknown',
      durationMs: 0,
      skipped: false,
      rounds: 0,
    };
    const buildStartMs = Date.now();

    if (skipPhases.includes('verifyBuild')) {
      console.log('\n[Phase 7] ⏭ Build verification skipped');
      buildVerifyResult = {
        success: true,
        buildSystem: 'skipped',
        durationMs: 0,
        skipped: true,
        rounds: 0,
      };
    } else {
      try {
        const initialBuild = await runBuild(docsDir);
        buildVerifyResult.buildSystem = initialBuild.buildSystem;

        if (initialBuild.success && parseBuildErrors(initialBuild.output).length === 0) {
          console.log(`[Phase 7] ✓ Build passed on first attempt (${initialBuild.buildSystem})`);
          buildVerifyResult = {
            success: true,
            buildSystem: initialBuild.buildSystem,
            durationMs: Date.now() - buildStartMs,
            skipped: false,
            rounds: 0,
          };
        } else {
          let currentErrors = parseBuildErrors(initialBuild.output);
          console.log(`[Phase 7] Found ${currentErrors.length} error(s), starting fix loop`);

          if (!session) {
            session = await harness.session('fix-website-build-errors');
          }

          let round = 0;
          for (round = 1; round <= MAX_BUILD_FIX_ROUNDS; round++) {
            if (currentErrors.length === 0) break;

            console.log(
              `[Phase 7] Fix attempt ${round}/${MAX_BUILD_FIX_ROUNDS} (${currentErrors.length} error(s))`
            );
            const errorList = currentErrors.map((e) => `  ${e}`).join('\n');
            await session.prompt(
              `Fix the following documentation website build errors in ${projectRoot}.\n\nErrors:\n${errorList}\n\nFor each error: read the file, identify the root cause (broken link, missing file, wrong path), fix it. If a link target doesn't exist, either correct the path or remove the link. Report each fix applied.`
            );

            const reBuild = await runBuild(docsDir);
            currentErrors = parseBuildErrors(reBuild.output);
            buildVerifyResult.buildSystem = reBuild.buildSystem;

            if (currentErrors.length === 0) {
              console.log(`[Phase 7] ✓ All errors fixed after ${round} round(s)`);
              break;
            }
            console.log(`[Phase 7] Still ${currentErrors.length} error(s) after round ${round}`);
          }

          buildVerifyResult = {
            success: currentErrors.length === 0,
            buildSystem: buildVerifyResult.buildSystem,
            durationMs: Date.now() - buildStartMs,
            skipped: false,
            rounds: round,
          };
          console.log(
            `[Phase 7] ${buildVerifyResult.success ? '✓' : '⚠'} Build verification complete (${buildVerifyResult.rounds} fix round(s))`
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('No supported documentation build system detected')) {
          console.log('[Phase 7] ⚠ No documentation build system detected, skipping');
          buildVerifyResult = {
            success: true,
            buildSystem: 'none',
            durationMs: Date.now() - buildStartMs,
            skipped: true,
            rounds: 0,
          };
        } else {
          console.log(`[Phase 7] ⚠ Build verification failed: ${msg}`);
          buildVerifyResult.durationMs = Date.now() - buildStartMs;
        }
      }
    }
    phasesCompleted.push('verifyBuild');

    const expectedPhases = 7 + (examplesPayload ? 1 : 0);
    const success =
      phasesCompleted.length === expectedPhases &&
      buildVerifyResult.success &&
      reviewResult.approved &&
      styleResult.passed;

    console.log(`\n[docs-write-how-to-guide] ${success ? '✓ SUCCESS' : '⚠ PARTIAL'}`);
    console.log(`  Phases completed: ${phasesCompleted.join(', ')}`);
    console.log(`  Output file: ${resolvedOutputPath}`);
    console.log(`  File exists: ${fs.existsSync(resolvedOutputPath)}`);

    return {
      topic,
      outputPath,
      resolvedOutputPath,
      projectRoot,
      status: success ? 'success' : 'partial',
      phasesCompleted,
      success,
      examples: examplesResult
        ? {
            success: examplesResult.success,
            moduleName: examplesResult.moduleName,
            exampleFiles: examplesResult.exampleFiles,
            compileSuccess: examplesResult.compileSuccess,
            runSuccess: examplesResult.runSuccess,
            lintSuccess: examplesResult.lintSuccess,
            documentationAdded: examplesResult.documentationAdded,
          }
        : null,
      review: {
        approved: reviewResult.approved,
        rounds: reviewResult.rounds,
        findingsFixed: reviewResult.findingsFixed,
        unresolvedIssues: reviewResult.unresolvedIssues,
      },
      style: {
        passed: styleResult.passed,
        rounds: styleResult.rounds,
        violations: styleResult.violations,
        unresolvedViolations: styleResult.unresolvedViolations,
      },
      buildVerify: {
        success: buildVerifyResult.success,
        skipped: buildVerifyResult.skipped,
        buildSystem: buildVerifyResult.buildSystem,
        durationMs: buildVerifyResult.durationMs,
        rounds: buildVerifyResult.rounds,
      },
    };
  } catch (error) {
    console.error(
      `[docs-write-how-to-guide] Error: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      topic,
      outputPath,
      resolvedOutputPath,
      projectRoot,
      status: 'failed',
      phasesCompleted,
      error: error instanceof Error ? error.message : String(error),
      success: false,
      examples: null,
      review: {
        approved: false,
        rounds: 0,
        findingsFixed: { HIGH: 0, MEDIUM: 0, LOW: 0 },
        unresolvedIssues: [],
      },
      style: {
        passed: false,
        rounds: 0,
        violations: {},
        unresolvedViolations: [],
      },
      buildVerify: {
        success: false,
        skipped: false,
        buildSystem: 'unknown',
        durationMs: 0,
        rounds: 0,
      },
    };
  }
}
