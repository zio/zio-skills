import * as v from 'valibot';
import 'dotenv/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineWorkflow } from '@flue/runtime';
import docsWriterAgent from '../agents/docs-writer.js';
import {
  toKebabCase,
  normalizeDataTypePath,
  validatePathsAndResolve,
  inferSourceDirs,
} from '../lib/scala-source-discovery.js';
import { runResearchPhase } from './phases/research.js';
import { runReviewPhase } from './phases/review.js';
import { runStylePhase } from './phases/style.js';
import { verifyBuild } from './phases/verify.js';
import { runExamplesPhase } from './phases/examples.js';
import { runDiagramPhase } from './phases/diagram.js';
import { createRunMdoc } from '../tools/run_mdoc.js';

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
        if (entry.name.startsWith('.')) continue; // Skip hidden files/dirs
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
  run: writeDataTypeRefRun as (ctx: any) => any,
});

async function writeDataTypeRefRun({ harness, input }: { harness: any; input: any }) {
  const {
    projectRoot,
    outputPath,
    dataTypePath,
    examples: examplesPayload,
    diagram: diagramPayload,
  } = input as {
    projectRoot: string;
    outputPath: string;
    dataTypePath?: string;
    /** Optional: generate companion Scala examples after writing the article. */
    examples?: { moduleName: string; packageName?: string; parentModule?: string };
    /** Optional: generate an interactive JSX diagram and embed it in the article. */
    diagram?: { outputPath?: string; prompt?: string };
  };

  // Validate inputs
  if (!projectRoot) throw new Error('input.projectRoot is required');
  if (!outputPath) throw new Error('input.outputPath is required');

  // Validate paths and resolve relative output path
  const resolvedOutputPath = validatePathsAndResolve(projectRoot, outputPath);

  // Infer possible source directories from project root
  const sourceDirs = inferSourceDirs(projectRoot);

  // Normalize data type path input (if provided)
  const dataTypeInfo = normalizeDataTypePath(dataTypePath);

  // Extract type name from output path (e.g., docs/reference/chunk.md -> chunk)
  const outputFileName = path.basename(outputPath, '.md');
  const outputTypeNameCandidate = outputFileName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  // Use dataTypePath type name if provided, otherwise infer from output path
  const typeName = dataTypeInfo.typeName || outputTypeNameCandidate;

  console.log(`[docs-write-data-type-ref] Starting documentation generation`);
  console.log(`  Type name: ${typeName}`);
  console.log(`  Output path (relative): ${outputPath}`);
  console.log(`  Output path (resolved): ${resolvedOutputPath}`);
  console.log(`  Project root: ${projectRoot}`);
  if (dataTypeInfo.filePath) {
    console.log(`  Data type path: ${dataTypeInfo.filePath}`);
  }
  console.log(`  Possible source dirs (discovered):`);
  sourceDirs.forEach((dir, i) => {
    console.log(`    [${i + 1}] ${dir}`);
  });

  const phasesCompleted: string[] = [];
  let mdocErrors = 0;
  let methodsCovered = 0;

  try {
    // Set environment variable for agents' sandbox cwd
    process.env.FLUE_PROJECT_ROOT = projectRoot;

    // Phase 1: Research (in separate researcher agent)
    console.log('\n[Phase 1] Research: Understanding the data type...');
    const researchResult = await runResearchPhase(harness, {
      projectRoot,
      typeName,
      resolvedOutputPath,
      sourceDirs,
      dataTypeInfo,
      focus: 'data-type-ref',
    });
    console.log('[Phase 1] ✓ Research complete');
    phasesCompleted.push('research');

    // Phase 2-4: Initialize writer session
    const session = await harness.session('docs-write-data-type-ref');

    // Phase 2: Write Documentation
    console.log('\n[Phase 2] Writing: Generating documentation...');
    const phase2StartTime = Date.now();
    const writePrompt = `**Research Findings (from research phase):**
${researchResult}

---

**Phase 2: Write Documentation**

Based on the research findings above, now write comprehensive reference documentation for ${typeName}.

**Requirements:**
- Output file path: ${resolvedOutputPath}
- File must have proper frontmatter with id, title, description, and keywords
  - description: one sentence, ≤150 characters, describes what the type does
  - keywords: 3-7 meaningful phrases (1-3 words each), e.g. feature names, patterns, synonyms
- Follow the exact section structure provided in the docs-data-type-ref skill
- Every public method MUST be documented
- All code examples MUST use mdoc syntax
- No blank lines between consecutive code blocks
- Include explanatory paragraphs between code block groups

**Writing guidance:**
- Use the docs-data-type-ref skill for detailed conventions
- Opening definition: NO markdown heading, start immediately after frontmatter
- Structure sections precisely as documented: Opening → Motivation → Quick Showcase → Installation → Construction → Core Operations → (Optional: Subtypes/Comparison/Advanced) → (Integration: only when non-trivial cross-module wiring with runnable example)
- For each method, provide: name + description → signature → usage example
- All mdoc examples should use \`mdoc:reset\` for isolated blocks

Write the complete markdown file and save it to the specified output path.`;

    const writeResult = await session.prompt(writePrompt);
    console.log('[Phase 2] ✓ Documentation written');
    phasesCompleted.push('write');

    // Phase 2.5: Examples (optional — only when `examples` payload provided)
    let examplesResult: Awaited<ReturnType<typeof runExamplesPhase>> | null = null;
    if (examplesPayload) {
      console.log('\n[Phase 2.5] Examples: Generating companion Scala examples...');
      examplesResult = await runExamplesPhase(harness, {
        projectRoot,
        moduleName: examplesPayload.moduleName,
        packageName: examplesPayload.packageName,
        parentModule: examplesPayload.parentModule,
        topic: typeName,
        docType: 'data-type-ref',
        outputDocPath: resolvedOutputPath,
        session, // reuse the writer session
      });
      console.log(
        `[Phase 2.5] ${examplesResult.success ? '✓' : '⚠'} Examples phase complete ` +
          `(${examplesResult.exampleFiles.length} files, compile: ${examplesResult.compileSuccess ? '✓' : '✗'}, run: ${examplesResult.runSuccess ? '✓' : '✗'})`
      );
      phasesCompleted.push('examples');
    }

    // Phase 2.6: Diagram (optional — only when `diagram` payload provided)
    let diagramResult: Awaited<ReturnType<typeof runDiagramPhase>> | null = null;
    if (diagramPayload) {
      console.log('\n[Phase 2.6] Diagram: Generating interactive JSX diagram...');
      const jsxRelPath =
        diagramPayload.outputPath ?? path.join(path.dirname(outputPath), `${typeName}Diagram.jsx`);
      const resolvedJsxPath = path.resolve(projectRoot, jsxRelPath);
      diagramResult = await runDiagramPhase(harness, {
        projectRoot,
        typeName,
        resolvedJsxPath,
        sourceDirs,
        dataTypeInfo,
        researchResult,
        userPrompt: diagramPayload.prompt,
        session, // reuse writer session for article patching
        articlePath: resolvedOutputPath,
      });
      console.log(
        `[Phase 2.6] ${diagramResult.success ? '✓' : '⚠'} Diagram phase complete ` +
          `(component: ${diagramResult.componentName}, article patched: ${diagramResult.articlePatched})`
      );
      phasesCompleted.push('diagram');
    }

    // Detect all changed/new markdown files since Phase 2 started
    const docsDir = path.join(projectRoot, 'docs');
    const changedFiles = findRecentlyModifiedMarkdownFiles(projectRoot, docsDir, phase2StartTime);
    console.log(`\n[Phase 2→3] Found ${changedFiles.length} changed/new markdown files:`);
    changedFiles.forEach((file) => console.log(`  - ${file}`));

    // Phase 3: Verify
    console.log('\n[Phase 3] Verifying: Checking documentation and code...');
    const changedFilesStr =
      changedFiles.length > 0
        ? `\n\n**Files to compile with mdoc** (detected as new/changed):\n${changedFiles.map((f) => `- ${f}`).join('\n')}`
        : '\n\n**Note:** No additional markdown files were changed. Compile the main output file only.';

    const verifyPrompt = `**Phase 3: Verify Documentation**

Verify the documentation you just wrote for ${typeName} at ${resolvedOutputPath}

**Verification steps:**

1. **Check method coverage**
   - Extract the list of all public methods from the source
   - Verify that each method documented in the file has an explanation
   - Note the total method count and coverage percentage

2. **Compile with run_mdoc**${changedFilesStr}
   - **CRITICAL: Use ONLY the run_mdoc tool for compilation** (do not use bash/sbt directly)
   - The run_mdoc tool provides structured error parsing and proper error handling
   - Call run_mdoc with paths: ${JSON.stringify(changedFiles)}
   - If run_mdoc returns errors, fix the markdown and call it again
   - Iterate until all code blocks compile with zero errors
   - Record the final mdoc error count (should be 0)

3. **Check documentation compliance**
   - Verify no blank lines between consecutive code blocks
   - Check that each section follows the required structure
   - Ensure method signatures are in plain scala blocks (no mdoc)
   - Verify examples are in mdoc:reset blocks

Report:
- Method coverage percentage
- Final mdoc error count
- Any fixes applied
- Status: success/partial/failed`;

    const verifyResult = await session.prompt(verifyPrompt, {
      tools: [createRunMdoc(projectRoot)],
    });

    console.log('[Phase 3] ✓ Verification complete');
    phasesCompleted.push('verify');

    // Phase 4: Format and Integrate
    console.log('\n[Phase 4] Integrating: Finalizing documentation...');
    const integratePrompt = `**Phase 4: Format and Integrate**

Finalize the documentation for ${typeName} and integrate it into the docs structure.

**Integration steps:**

1. **Format Scala code**
   - Run: sbt scalafmtAll
   - Ensure all generated Scala files are properly formatted

2. **Run lint checks**
   - Run: sbt check
   - Verify all lint checks pass

3. **Update sidebars.js** (if it exists)
   - Add entry for ${typeName} in the appropriate section
   - Ensure proper nesting and alphabetical ordering

4. **Update docs/index.md** (if it exists)
   - Add cross-reference to the new documentation
   - Link to: reference/${toKebabCase(typeName)}

5. **Update related documentation**
   - Check if other reference pages should link to ${typeName}
   - Add reciprocal cross-references

Report final status and any updates made.`;

    const integrateResult = await session.prompt(integratePrompt);
    console.log('[Phase 4] ✓ Integration complete');
    phasesCompleted.push('integrate');

    // Phase 5: Review and Fix
    console.log('\n[Phase 5] Reviewing: Critique and fix loop...');
    const reviewResult = await runReviewPhase(harness, {
      outputPath: resolvedOutputPath,
      projectRoot,
      typeName,
      session, // reuse writer session for fixes
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

    // Phase 6: Style Validation
    console.log('\n[Phase 6] Validating: Checking prose style...');
    const styleResult = await runStylePhase(harness, {
      outputPath: resolvedOutputPath,
      projectRoot,
      typeName,
      session, // reuse writer session for fixes
    });
    console.log(
      `[Phase 6] ${styleResult.passed ? '✓' : '⚠'} Style validation complete (${styleResult.rounds} round(s))`
    );
    if (!styleResult.passed && styleResult.unresolvedViolations.length > 0) {
      console.log(`  Unresolved violations (${styleResult.unresolvedViolations.length}):`);
      styleResult.unresolvedViolations.forEach((violation) => console.log(`    - ${violation}`));
    }
    phasesCompleted.push('style');

    // Phase 7: Verify Build
    console.log('\n[Phase 7] Build Verification: Verifying documentation builds...');
    let buildVerifyResult = {
      success: false,
      buildSystem: 'unknown',
      durationMs: 0,
      skipped: false,
    };
    try {
      const buildResult = await verifyBuild(docsDir);
      buildVerifyResult = { ...buildResult, skipped: false };
      console.log(
        `[Phase 7] ${buildResult.success ? '✓' : '⚠'} Build verification complete (${buildResult.buildSystem}, ${buildResult.durationMs}ms)`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('No supported documentation build system detected')) {
        console.log('[Phase 7] ⚠ No documentation build system detected, skipping');
        buildVerifyResult = { success: true, buildSystem: 'none', durationMs: 0, skipped: true };
      } else {
        console.log(`[Phase 7] ⚠ Build verification failed: ${msg}`);
      }
    }
    phasesCompleted.push('verifyBuild');

    // Build final result — base 7 phases + optional examples and diagram phases
    const expectedPhases = 7 + (examplesPayload ? 1 : 0) + (diagramPayload ? 1 : 0);
    const success = phasesCompleted.length === expectedPhases;
    console.log(`\n[docs-write-data-type-ref] ${success ? '✓ SUCCESS' : '⚠ PARTIAL'}`);
    console.log(`  Phases completed: ${phasesCompleted.join(', ')}`);
    console.log(`  Output file: ${resolvedOutputPath}`);
    console.log(`  File exists: ${fs.existsSync(resolvedOutputPath)}`);

    return {
      typeName,
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
      diagram: diagramResult
        ? {
            success: diagramResult.success,
            componentName: diagramResult.componentName,
            jsxOutputPath: diagramResult.jsxOutputPath,
            articlePatched: diagramResult.articlePatched,
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
      },
    };
  } catch (error) {
    console.error(
      `[docs-write-data-type-ref] Error: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      typeName,
      outputPath,
      resolvedOutputPath,
      projectRoot,
      status: 'failed',
      phasesCompleted,
      error: error instanceof Error ? error.message : String(error),
      success: false,
      examples: null,
      diagram: null,
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
      },
    };
  }
}
