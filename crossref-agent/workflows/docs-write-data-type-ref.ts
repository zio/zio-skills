import 'dotenv/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FlueContext } from '@flue/runtime';
import docsWriterAgent from '../agents/docs-writer.js';
import {
  toKebabCase,
  normalizeDataTypePath,
  validatePathsAndResolve,
  inferSourceDirs,
} from '../lib/scala-source-discovery.js';
import { runResearchPhase } from './phases/research.js';



export async function run({ init, payload }: FlueContext) {
  const {
    projectRoot,
    outputPath,
    dataTypePath,
  } = payload as {
    projectRoot: string;
    outputPath: string;
    dataTypePath?: string;
  };

  // Validate inputs
  if (!projectRoot) throw new Error('payload.projectRoot is required');
  if (!outputPath) throw new Error('payload.outputPath is required');

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
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
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

  // Initialize agent and start session
  const harness = await init(docsWriterAgent, { name: 'docs-write-data-type-ref' });
  const session = await harness.session();

  const phasesCompleted: string[] = [];
  let mdocErrors = 0;
  let methodsCovered = 0;

  try {
    // Phase 1: Research
    console.log('\n[Phase 1] Research: Understanding the data type...');
    const researchResult = await runResearchPhase(session, {
      projectRoot,
      typeName,
      resolvedOutputPath,
      sourceDirs,
      dataTypeInfo,
      focus: 'data-type-ref',
    });
    console.log('[Phase 1] ✓ Research complete');
    phasesCompleted.push('research');

    // Phase 2: Write Documentation
    console.log('\n[Phase 2] Writing: Generating documentation...');
    const writePrompt = `**Phase 2: Write Documentation**

Based on your research from Phase 1, now write comprehensive reference documentation for ${typeName}.

**Requirements:**
- Output file path: ${resolvedOutputPath}
- File must have proper frontmatter with id and title
- Follow the exact section structure provided in the docs-data-type-ref skill
- Every public method MUST be documented
- All code examples MUST use mdoc syntax
- No blank lines between consecutive code blocks
- Include explanatory paragraphs between code block groups

**Writing guidance:**
- Use the docs-data-type-ref skill for detailed conventions
- Opening definition: NO markdown heading, start immediately after frontmatter
- Structure sections precisely as documented: Opening → Motivation → Quick Showcase → Installation → Construction → Core Operations → (Optional: Subtypes/Comparison/Advanced/Integration)
- For each method, provide: name + description → signature → usage example
- All mdoc examples should use \`mdoc:reset\` for isolated blocks

Write the complete markdown file and save it to the specified output path.`;

    const writeResult = await session.prompt(writePrompt);
    console.log('[Phase 2] ✓ Documentation written');
    phasesCompleted.push('write');

    // Phase 3: Verify
    console.log('\n[Phase 3] Verifying: Checking documentation and code...');
    const verifyPrompt = `**Phase 3: Verify Documentation**

Verify the documentation you just wrote for ${typeName} at ${resolvedOutputPath}

**Verification steps:**

1. **Check method coverage**
   - Extract the list of all public methods from the source
   - Verify that each method documented in the file has an explanation
   - Note the total method count and coverage percentage

2. **Verify mdoc compilation**
   - Run mdoc to compile all code examples
   - Fix any compilation errors
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

    const verifyResult = await session.prompt(verifyPrompt);
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

    // Build final result
    const success = phasesCompleted.length === 4;
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
    };
  } catch (error) {
    console.error(`[docs-write-data-type-ref] Error: ${error instanceof Error ? error.message : String(error)}`);
    return {
      typeName,
      outputPath,
      resolvedOutputPath,
      projectRoot,
      status: 'failed',
      phasesCompleted,
      error: error instanceof Error ? error.message : String(error),
      success: false,
    };
  }
}
