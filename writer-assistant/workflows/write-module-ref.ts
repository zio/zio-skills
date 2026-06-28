import * as v from 'valibot';
import 'dotenv/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineWorkflow } from '@flue/runtime';
import docsWriterAgent from '../agents/docs-writer.js';
import { inferSourceDirs } from '../lib/scala-source-discovery.js';
import { runResearchPhase } from './phases/research.js';
import { runReviewPhase } from './phases/review.js';
import { runStylePhase } from './phases/style.js';
import { verifyBuild } from './phases/verify.js';
import { runExamplesPhase, type DocType } from './phases/examples.js';
import { runDiagramPhase } from './phases/diagram.js';
import { createRunMdoc } from '../tools/run_mdoc.js';

export type { DocType };

export interface WriteModuleRefResult {
  moduleName: string;
  outputPath: string;
  resolvedOutputPath: string;
  projectRoot: string;
  status: 'success' | 'partial' | 'failed';
  phasesCompleted: string[];
  success: boolean;
  examples: {
    success: boolean;
    moduleName: string;
    exampleFiles: string[];
    compileSuccess: boolean;
    runSuccess: boolean;
    lintSuccess: boolean;
    documentationAdded: boolean;
  } | null;
  diagram: {
    success: boolean;
    componentName: string;
    jsxOutputPath: string;
    articlePatched: boolean;
  } | null;
  review: {
    approved: boolean;
    rounds: number;
    findingsFixed: { HIGH: number; MEDIUM: number; LOW: number };
    unresolvedIssues: string[];
  };
  style: {
    passed: boolean;
    rounds: number;
    violations: Record<string, number>;
    unresolvedViolations: string[];
  };
  buildVerify: {
    success: boolean;
    skipped: boolean;
    buildSystem: string;
    durationMs: number;
  };
}

export default defineWorkflow({
  agent: docsWriterAgent,
  input: v.looseObject({}),
  run: writeModuleRefRun as (ctx: any) => any,
});

async function writeModuleRefRun({ harness, input }: { harness: any; input: any }) {
  const {
    projectRoot,
    moduleName,
    outputPath,
    structure,
    examples: examplesPayload,
    diagram: diagramPayload,
  } = input as {
    projectRoot: string;
    moduleName: string;
    outputPath: string;
    structure?: 'flat' | 'hierarchical';
    examples?: { moduleName: string; packageName?: string; parentModule?: string };
    diagram?: { outputPath?: string; prompt?: string };
  };

  if (!projectRoot) throw new Error('input.projectRoot is required');
  if (!moduleName) throw new Error('input.moduleName is required');
  if (!outputPath) throw new Error('input.outputPath is required');
  if (!fs.existsSync(projectRoot)) throw new Error(`projectRoot not found: ${projectRoot}`);

  const resolvedOutputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(projectRoot, outputPath);

  const sourceDirs = inferSourceDirs(projectRoot);

  console.log(`[write-module-ref] Starting module reference documentation`);
  console.log(`  Module name:            ${moduleName}`);
  console.log(`  Output path (relative): ${outputPath}`);
  console.log(`  Output path (resolved): ${resolvedOutputPath}`);
  console.log(`  Structure override:     ${structure ?? '(agent decides from skill rule)'}`);
  console.log(`  Project root:           ${projectRoot}`);
  console.log(`  Possible source dirs (discovered):`);
  sourceDirs.forEach((dir, i) => {
    console.log(`    [${i + 1}] ${dir}`);
  });

  const phasesCompleted: string[] = [];

  try {
    process.env.FLUE_PROJECT_ROOT = projectRoot;

    // Phase 1: Research
    console.log('\n[Phase 1] Research: Mapping the module...');
    const researchResult = await runResearchPhase(harness, {
      projectRoot,
      typeName: moduleName,
      resolvedOutputPath,
      sourceDirs,
      focus: 'module-ref',
    });
    console.log('[Phase 1] ✓ Research complete');
    phasesCompleted.push('research');

    // Phase 2-4: Initialize writer session
    const session = await harness.session('write-module-ref');

    // Phase 2: Write Documentation
    console.log('\n[Phase 2] Writing: Generating module documentation...');
    const phase2StartTime = Date.now();

    const structureInstruction = structure
      ? `**Structure (user-specified):** Use **${structure}** structure.\n` +
        (structure === 'flat'
          ? `  - Single file at: ${resolvedOutputPath}\n`
          : `  - Output directory: ${resolvedOutputPath}\n` +
            `  - Create index.md + one page per core type\n`)
      : `**Structure:** Apply the default rule from the docs-module-ref skill:\n` +
        `  - ≤ 4 core types or types always used together → flat (single file at ${resolvedOutputPath})\n` +
        `  - ≥ 5 core types OR ≥ 3 types with rich self-contained APIs → hierarchical (directory: ${resolvedOutputPath})\n` +
        `  Tell me which you chose and why before writing.\n`;

    const writePrompt = `**Research Findings (from research phase):**
${researchResult}

---

**Phase 2: Write Module Reference Documentation**

Based on the research findings above, write comprehensive reference documentation for the \`${moduleName}\` module.

${structureInstruction}

**Requirements:**
- Follow the docs-module-ref skill for all section structure and conventions
- Every module-level section is required: Opening Definition, Introduction/Motivation, Installation, How They Work Together (CRITICAL — ASCII diagram + numbered workflow), Common Patterns, Integration Points
- Document every public method on every core type
- All code examples must use mdoc syntax
- No blank lines between consecutive code blocks
- The "How They Work Together" section must include an ASCII diagram of type relationships

**Writing guidance:**
- Use the docs-module-ref skill for section structure and mdoc conventions
- Opening Definition: NO markdown heading, start immediately after frontmatter
- "How They Work Together" is the centerpiece — invest in a clear ASCII diagram and numbered workflow
- For hierarchical: create index.md first, then individual type pages

Write the complete documentation file(s) and save them to the specified output path(s).`;

    await session.prompt(writePrompt);
    console.log('[Phase 2] ✓ Documentation written');
    phasesCompleted.push('write');

    // Phase 2.5: Examples (optional)
    let examplesResult: Awaited<ReturnType<typeof runExamplesPhase>> | null = null;
    if (examplesPayload) {
      console.log('\n[Phase 2.5] Examples: Generating companion Scala examples...');
      examplesResult = await runExamplesPhase(harness, {
        projectRoot,
        moduleName: examplesPayload.moduleName,
        packageName: examplesPayload.packageName,
        parentModule: examplesPayload.parentModule,
        topic: moduleName,
        docType: 'module-ref',
        outputDocPath: resolvedOutputPath,
        session,
      });
      console.log(
        `[Phase 2.5] ${examplesResult.success ? '✓' : '⚠'} Examples phase complete ` +
          `(${examplesResult.exampleFiles.length} files, compile: ${examplesResult.compileSuccess ? '✓' : '✗'}, run: ${examplesResult.runSuccess ? '✓' : '✗'})`
      );
      phasesCompleted.push('examples');
    }

    // Phase 2.6: Diagram (optional)
    let diagramResult: Awaited<ReturnType<typeof runDiagramPhase>> | null = null;
    if (diagramPayload) {
      console.log('\n[Phase 2.6] Diagram: Generating interactive JSX diagram...');
      const jsxRelPath =
        diagramPayload.outputPath ??
        path.join(path.dirname(outputPath), `${moduleName}Diagram.jsx`);
      const resolvedJsxPath = path.resolve(projectRoot, jsxRelPath);
      diagramResult = await runDiagramPhase(harness, {
        projectRoot,
        typeName: moduleName,
        resolvedJsxPath,
        sourceDirs,
        researchResult,
        userPrompt: diagramPayload.prompt,
        session,
        articlePath: resolvedOutputPath,
      });
      console.log(
        `[Phase 2.6] ${diagramResult.success ? '✓' : '⚠'} Diagram phase complete ` +
          `(component: ${diagramResult.componentName}, article patched: ${diagramResult.articlePatched})`
      );
      phasesCompleted.push('diagram');
    }

    // Detect changed markdown files since Phase 2 started
    const docsDir = path.join(projectRoot, 'docs');
    const changedFiles = findRecentlyModifiedMarkdownFiles(projectRoot, docsDir, phase2StartTime);
    console.log(`\n[Phase 2→3] Found ${changedFiles.length} changed/new markdown files:`);
    changedFiles.forEach((file) => console.log(`  - ${file}`));

    // Phase 3: Verify
    console.log('\n[Phase 3] Verifying: Checking mdoc compilation...');
    const changedFilesStr =
      changedFiles.length > 0
        ? `\n\n**Files to compile with mdoc** (detected as new/changed):\n${changedFiles.map((f) => `- ${f}`).join('\n')}`
        : '\n\n**Note:** No additional markdown files were changed. Compile all output files.';

    const verifyPrompt = `**Phase 3: Verify Documentation**

Verify the documentation you just wrote for the \`${moduleName}\` module at ${resolvedOutputPath}

**Verification steps:**

1. **Check method coverage**
   - Extract the list of all public methods from each core type's source
   - Verify every method is documented
   - Note total method count and coverage percentage

2. **Compile with run_mdoc**${changedFilesStr}
   - **CRITICAL: Use ONLY the run_mdoc tool for compilation** (do not use bash/sbt directly)
   - Call run_mdoc with paths: ${JSON.stringify(changedFiles)}
   - If run_mdoc returns errors, fix the markdown and call it again
   - Iterate until all code blocks compile with zero errors
   - Record final mdoc error count (must be 0)

3. **Check documentation compliance**
   - Verify no blank lines between consecutive code blocks
   - Check "How They Work Together" section has ASCII diagram
   - Ensure method signatures are in plain scala blocks (no mdoc)
   - Verify examples are in mdoc:reset blocks

Report:
- Method coverage percentage per type
- Final mdoc error count
- Any fixes applied
- Status: success/partial/failed`;

    await session.prompt(verifyPrompt, {
      tools: [createRunMdoc(projectRoot)],
    });
    console.log('[Phase 3] ✓ Verification complete');
    phasesCompleted.push('verify');

    // Phase 4: Format and Integrate
    console.log('\n[Phase 4] Integrating: Finalizing documentation...');
    const integratePrompt = `**Phase 4: Format and Integrate**

Finalize the documentation for the \`${moduleName}\` module and integrate it into the docs structure.

**Integration steps:**

1. **Format Scala code**
   - Run: sbt scalafmtAll
   - Ensure all generated Scala files are properly formatted

2. **Run lint checks**
   - Run: sbt check
   - Verify all lint checks pass

3. **Update sidebars.js** (if it exists)
   - **Flat structure:** Add \`{ type: "doc", id: "reference/${moduleName}" }\` entry
   - **Hierarchical structure:** Add a category entry with link to index and items for each type page

4. **Update docs/index.md** (if it exists)
   - Add link to the new module documentation under "Reference Documentation"

5. **Update related documentation**
   - Check if other reference pages should link to this module
   - Add reciprocal cross-references

Report final status and any updates made.`;

    await session.prompt(integratePrompt);
    console.log('[Phase 4] ✓ Integration complete');
    phasesCompleted.push('integrate');

    // Phase 5: Review and Fix
    console.log('\n[Phase 5] Reviewing: Critique and fix loop...');
    const reviewResult = await runReviewPhase(harness, {
      outputPath: resolvedOutputPath,
      projectRoot,
      typeName: moduleName,
      session,
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
      typeName: moduleName,
      session,
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

    const expectedPhases = 7 + (examplesPayload ? 1 : 0) + (diagramPayload ? 1 : 0);
    const success = phasesCompleted.length === expectedPhases;
    console.log(`\n[write-module-ref] ${success ? '✓ SUCCESS' : '⚠ PARTIAL'}`);
    console.log(`  Phases completed: ${phasesCompleted.join(', ')}`);
    console.log(`  Output: ${resolvedOutputPath}`);

    return {
      moduleName,
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
    } satisfies WriteModuleRefResult;
  } catch (error) {
    console.error(
      `[write-module-ref] Error: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      moduleName,
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
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  };

  walk(docsDir);
  return result;
}
