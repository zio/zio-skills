import * as v from 'valibot';
import 'dotenv/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineWorkflow } from '@flue/runtime';
import docsWriterAgent from '../agents/docs-writer.js';
import {
  toKebabCase,
  validatePathsAndResolve,
  inferSourceDirs,
} from '../lib/scala-source-discovery.js';
import { runResearchPhase } from './phases/research.js';
import { runReviewPhase } from './phases/review.js';
import { runStylePhase } from './phases/style.js';
import { verifyBuild } from './phases/verify.js';
import { runExamplesPhase } from './phases/examples.js';
import { runBuild } from '../lib/build-runner.js';
import { createRunMdoc } from '../tools/run_mdoc.js';

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

function findRecentlyModifiedMarkdownFiles(
  projectRoot: string,
  docsDir: string,
  sinceTime: number
): string[] {
  if (!fs.existsSync(docsDir)) {
    return [];
  }

  const result: string[] = [];
  const walk = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.mtimeMs >= sinceTime) {
              result.push(path.relative(projectRoot, fullPath));
            }
          } catch {
            // Ignore files that can't be stat'd
          }
        }
      }
    } catch {
      // Ignore directories that can't be read
    }
  };

  walk(docsDir);
  return result;
}

export default defineWorkflow({
  agent: docsWriterAgent,
  input: v.looseObject({}),
  run: writeTutorialRun as (ctx: any) => any,
});

async function writeTutorialRun({ harness, input }: { harness: any; input: any }) {
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
    /** Optional: generate companion Scala examples after writing the tutorial. */
    examples?: { moduleName: string; packageName?: string; parentModule?: string };
    /**
     * Phase names to skip. Skipped phases are counted as completed without running.
     * Valid values: "research" | "write" | "examples" | "verify" | "integrate" | "review" | "style" | "verifyBuild"
     * Example: ["research","write","verify","integrate","review","style"] to run only the build phase.
     */
    skipPhases?: string[];
  };

  // Validate inputs
  if (!projectRoot) throw new Error('input.projectRoot is required');
  if (!outputPath) throw new Error('input.outputPath is required');
  if (!topic) throw new Error('input.topic is required');

  // Validate paths and resolve relative output path
  const resolvedOutputPath = validatePathsAndResolve(projectRoot, outputPath);

  // Infer possible source directories from project root
  const sourceDirs = inferSourceDirs(projectRoot);

  // Extract tutorial name from output path (e.g., docs/guides/getting-started.md -> getting-started)
  const outputFileName = path.basename(outputPath, '.md');

  console.log(`[docs-write-tutorial] Starting tutorial documentation generation`);
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
    // Set environment variable for agents' sandbox cwd
    process.env.FLUE_PROJECT_ROOT = projectRoot;

    // Phase 1: Research (in separate researcher agent)
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
        focus: 'tutorial',
      });
      console.log('[Phase 1] ✓ Research complete');
      phasesCompleted.push('research');
    }

    // Phase 2-6: Initialize writer agent only if at least one of these phases will run
    const writerPhases = ['write', 'verify', 'integrate', 'review', 'style'];
    const needsWriterSession = writerPhases.some((p) => !skipPhases.includes(p));
    let session: any = null;
    if (needsWriterSession) {
      session = await harness.session('docs-write-tutorial');
    }

    // Phase 2: Write Documentation
    let phase2StartTime = Date.now();
    if (skipPhases.includes('write')) {
      console.log('\n[Phase 2] ⏭ Write skipped');
      phasesCompleted.push('write');
    } else {
      console.log('\n[Phase 2] Writing: Generating tutorial...');
      phase2StartTime = Date.now();
      const writePrompt = `**Research Findings (from research phase):**
${researchResult}

---

**Phase 2: Write Tutorial Documentation**

Based on the research findings above, now write a comprehensive tutorial for learning about ${topic}.

**Requirements:**
- Output file path: ${resolvedOutputPath}
- File must be in docs/guides/ directory
- File must have proper frontmatter with id, title, description, and keywords
  - description: one sentence, ≤150 characters, describes what the tutorial teaches
  - keywords: 3-7 meaningful phrases (1-3 words each), e.g. feature names, patterns, learning outcomes
- Follow the exact 7-section structure provided in the docs-tutorial skill
- Every code example MUST use mdoc syntax
- No blank lines between consecutive code blocks
- Include explanatory paragraphs between code block groups
- Tutorial must follow a strict linear path (no branching, no "alternatively")

**Section structure (in order):**
1. Introduction (with Learning Objectives and section outline)
2. Background / Big Picture (optional, no code)
3. Concept sections (3-6 sections, one concept each)
4. Putting It Together (complete runnable example)
5. Running the Examples (### per example: narrative + mdoc:embed source in <details> + "Observe X:" + bash run command)
6. What You've Learned (recap of objectives)
7. Where to Go Next (links to how-to guides and reference pages)

**Writing guidance:**
- Use the docs-tutorial skill for detailed conventions
- Use warm, welcoming tone: "Welcome", "Let's", "notice that"
- Use present tense: "we learn", "we see", "we observe"
- Address learner directly: "you now understand", "you can now do"
- Line-by-line annotation after each code block
- Show intermediate output when meaningful
- Every section must have code
- No pseudo-code or fake error messages
- Use \`mdoc\` for output-producing examples, \`mdoc:compile-only\` for complete final example

Write the complete markdown file and save it to the specified output path.`;

      await session!.prompt(writePrompt);
      console.log('[Phase 2] ✓ Tutorial written');
      phasesCompleted.push('write');
    }

    // Phase 2.5: Examples (optional — only when `examples` payload provided)
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
          docType: 'tutorial',
          outputDocPath: resolvedOutputPath,
          session: session!, // reuse the writer session
        });
        console.log(
          `[Phase 2.5] ${examplesResult.success ? '✓' : '⚠'} Examples phase complete ` +
            `(${examplesResult.exampleFiles.length} files, compile: ${examplesResult.compileSuccess ? '✓' : '✗'}, run: ${examplesResult.runSuccess ? '✓' : '✗'})`
        );
        phasesCompleted.push('examples');
      }
    }

    // Detect all changed/new markdown files since Phase 2 started
    const changedFiles = findRecentlyModifiedMarkdownFiles(projectRoot, docsDir, phase2StartTime);
    console.log(`\n[Phase 2→3] Found ${changedFiles.length} changed/new markdown files:`);
    changedFiles.forEach((file) => console.log(`  - ${file}`));

    // Phase 3: Verify
    if (skipPhases.includes('verify')) {
      console.log('\n[Phase 3] ⏭ Verify skipped');
      phasesCompleted.push('verify');
    } else {
      console.log('\n[Phase 3] Verifying: Checking documentation and code...');
      const changedFilesStr =
        changedFiles.length > 0
          ? `\n\n**Files to compile with mdoc** (detected as new/changed):\n${changedFiles.map((f) => `- ${f}`).join('\n')}`
          : '\n\n**Note:** No additional markdown files were changed. Compile the main output file only.';

      const verifyPrompt = `**Phase 3: Verify Tutorial**

Verify the tutorial you just wrote for ${topic} at ${resolvedOutputPath}

**Verification steps:**

1. **Verify structure compliance**
   - Check that all 7 sections are present and in correct order
   - Verify section headings use numbered format (## 1. Topic, ## 2. Topic, etc.)
   - Ensure Introduction has Learning Objectives
   - Confirm "What You've Learned" mirrors Learning Objectives
   - Check that "Where to Go Next" links to how-to guides

2. **Compile with run_mdoc**${changedFilesStr}
   - **CRITICAL: Use ONLY the run_mdoc tool for compilation** (do not use bash/sbt directly)
   - The run_mdoc tool provides structured error parsing
   - Call run_mdoc with paths: ${JSON.stringify(changedFiles)}
   - If run_mdoc returns errors, fix the markdown and call it again
   - Iterate until all code blocks compile with zero errors

3. **Check line-by-line annotations**
   - Verify every code block is followed by bullet-point line-by-line explanation
   - Check that intermediate results are shown after major steps
   - Ensure no blank lines between consecutive code blocks

4. **Review CHECKLIST.md**
   - Use the checklist in the docs-tutorial skill to self-verify all 38 items
   - Focus on Content Quality, Technical Accuracy, and Style sections

Report:
- Structure compliance status
- Final mdoc error count (should be 0)
- Any fixes applied
- CHECKLIST status`;

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

Finalize the tutorial for ${topic} and integrate it into the docs structure.

**Integration steps:**

1. **Format Scala code**
   - Run: sbt scalafmtAll
   - Ensure all generated Scala files are properly formatted

2. **Run lint checks**
   - Run: sbt check
   - Verify all lint checks pass

3. **Update sidebars.js** (if it exists)
   - Add entry for ${outputFileName} under the "Guides" category (not "Reference")
   - Ensure proper nesting and alphabetical ordering
   - The entry should link to docs/guides/${outputFileName}.md

4. **Update docs/index.md** (if it exists)
   - Add cross-reference to the new tutorial
   - Link to: guides/${outputFileName}

5. **Update related documentation**
   - Check if other reference pages or how-to guides should link to this tutorial
   - Add reciprocal cross-references where appropriate
   - Tutorials should link from "Where to Go Next" to related how-to guides

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
        session: session!, // reuse writer session for fixes
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
        session: session!, // reuse writer session for fixes
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

        // Ensure a writer session is available for fixing
        if (!session) {
          session = await harness.session('fix-website-fixer');
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
    phasesCompleted.push('verifyBuild');

    // Build final result — base 7 phases + optional examples phase
    const expectedPhases = 7 + (examplesPayload ? 1 : 0);
    const success =
      phasesCompleted.length === expectedPhases &&
      buildVerifyResult.success &&
      reviewResult.approved &&
      styleResult.passed;
    console.log(`\n[docs-write-tutorial] ${success ? '✓ SUCCESS' : '⚠ PARTIAL'}`);
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
      `[docs-write-tutorial] Error: ${error instanceof Error ? error.message : String(error)}`
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
