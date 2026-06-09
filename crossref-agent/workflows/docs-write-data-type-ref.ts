import 'dotenv/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FlueContext } from '@flue/runtime';
import docsWriterAgent from '../agents/docs-writer.js';

/**
 * Convert a type name to kebab-case
 * Examples: Chunk -> chunk, TypeId -> type-id, ZRef -> z-ref
 */
function toKebabCase(name: string): string {
  return name
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

/**
 * Normalize data type path input
 * Accepts: full path, relative path, filename, or type name
 * Examples:
 *   core/shared/src/main/scala/zio/Chunk.scala -> { filePath: "...", typeName: "Chunk" }
 *   Chunk.scala -> { fileName: "Chunk.scala", typeName: "Chunk" }
 *   Chunk -> { typeName: "Chunk" }
 */
function normalizeDataTypePath(dataTypePath: string | undefined): {
  filePath?: string;
  fileName?: string;
  typeName?: string;
} {
  if (!dataTypePath) {
    return {};
  }

  // If it looks like a type name (no dots, no slashes, starts with capital)
  if (!dataTypePath.includes('.') && !dataTypePath.includes('/') && /^[A-Z]/.test(dataTypePath)) {
    return { typeName: dataTypePath };
  }

  // If it's a file path or filename
  if (dataTypePath.includes('.scala') || dataTypePath.endsWith('.scala')) {
    const fileName = path.basename(dataTypePath);
    const typeName = fileName.replace('.scala', '');
    return { filePath: dataTypePath, fileName, typeName };
  }

  // If it contains slashes, treat as file path
  if (dataTypePath.includes('/')) {
    const fileName = path.basename(dataTypePath);
    const typeName = fileName.replace('.scala', '').replace(/\.[^/.]+$/, '');
    return { filePath: dataTypePath, fileName, typeName };
  }

  // Default: treat as type name
  return { typeName: dataTypePath };
}

/**
 * Validate that paths are accessible and resolve relative output path
 */
function validatePathsAndResolve(projectRoot: string, outputPath: string): string {
  if (!fs.existsSync(projectRoot)) {
    throw new Error(`Project root does not exist: ${projectRoot}`);
  }
  if (!fs.statSync(projectRoot).isDirectory()) {
    throw new Error(`projectRoot is not a directory: ${projectRoot}`);
  }

  // Resolve output path relative to project root
  const resolvedOutputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(projectRoot, outputPath);

  // Ensure output directory exists
  const outputDir = path.dirname(resolvedOutputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return resolvedOutputPath;
}

/**
 * Infer possible source directories from the project root
 * Supports common Scala project layouts:
 * - Standard SBT: src/main/scala, src/test/scala
 * - Multi-platform: shared/src, jvm/src, js/src, native/src
 * - Multi-module: modules/*/src, packages/*/src
 * - Custom nested: any top-level dir with src structure
 *
 * Patterns are tried in priority order until sources are found.
 */
function inferSourceDirs(projectRoot: string): string[] {
  const sourceDirs: string[] = [];

  // Patterns to search, in priority order
  // Tries to match common Scala project structures across different build tools and layouts
  const patterns = [
    // Standard SBT layout: src/main/scala
    'src/main/scala',
    // Multi-platform Scala projects (shared + platform-specific variants)
    // Examples: shared/src, jvm/src, js/src, native/src
    '*/shared/src/main/scala',
    '*/shared/src',
    '*/jvm/src/main/scala',
    '*/jvm/src',
    '*/js/src/main/scala',
    '*/js/src',
    '*/native/src/main/scala',
    '*/native/src',
    // Single source directories at various nesting levels
    '*/src/main/scala',
    '*/src',
  ];

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      // Handle glob patterns
      const baseDir = path.dirname(pattern);
      const glob = path.basename(pattern);
      const fullBaseDir = path.join(projectRoot, baseDir);

      if (fs.existsSync(fullBaseDir)) {
        try {
          const entries = fs.readdirSync(fullBaseDir);
          for (const entry of entries) {
            const fullPath = path.join(fullBaseDir, entry);
            if (fs.statSync(fullPath).isDirectory()) {
              const globRegex = new RegExp('^' + glob.replace(/\*/g, '.*') + '$');
              if (globRegex.test(entry)) {
                const srcPath = path.join(fullPath, 'src');
                if (fs.existsSync(srcPath)) {
                  sourceDirs.push(fs.realpathSync(srcPath));
                }
              }
            }
          }
        } catch (e) {
          // Ignore read errors
        }
      }
    } else {
      // Direct path
      const fullPattern = path.join(projectRoot, pattern);
      if (fs.existsSync(fullPattern)) {
        try {
          sourceDirs.push(fs.realpathSync(fullPattern));
        } catch (e) {
          // Ignore
        }
      }
    }
  }

  // Remove duplicates while preserving order
  const unique = Array.from(new Set(sourceDirs));

  // Fallback: include project root if nothing found
  if (unique.length === 0) {
    unique.push(projectRoot);
  }

  return unique;
}

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
    const sourceDirList = sourceDirs.map((dir, i) => `[${i + 1}] ${dir}`).join('\n  ');

    let researchPromptPrefix = `You are tasked with writing comprehensive reference documentation for the ZIO data type: ${typeName}

`;

    if (dataTypeInfo.filePath) {
      researchPromptPrefix += `**Direct source file location provided:**
${dataTypeInfo.filePath}

Start by examining this file. If it's not in the project root, resolve it relative to projectRoot: ${projectRoot}

If the type has platform-specific variants (shared + jvm/js/native), search for those as well.

`;
    } else {
      researchPromptPrefix += `**Possible source code locations** (search across all of these):
  ${sourceDirList}

`;
    }

    const researchPrompt = researchPromptPrefix + `Documentation will be written to: ${resolvedOutputPath}
Project root: ${projectRoot}

Scala projects often have multiple source directories (multi-platform, multi-module, or nested layouts). The type may be defined in one or more of these directories. Search across all of them to find the complete definition.

**Phase 1: Research**

Your first task is to deeply research this data type:

1. **Locate the type definition** in the source directories
   - Search across all provided source directories
   - Find the source file(s) containing ${typeName}
   - Read the complete type definition and understand its structure
   - If defined in multiple directories (e.g., shared + platform-specific), document all variants
   - Note type parameters, variance, and base classes/traits

2. **Study the tests and examples**
   - Find test files for ${typeName} (in test directories across all platforms)
   - Identify common usage patterns and test cases
   - Look for realistic examples in the test suite

3. **Locate all public methods**
   - Extract all public methods on the type
   - Extract all companion object methods
   - If there are platform-specific methods, document all variants
   - List them with signatures
   - Note any deprecated methods

4. **Understand integration points**
   - How does ${typeName} integrate with other types?
   - What other types depend on it?
   - Are there related subtypes or variants?

5. **Search for documentation and references**
   - Look for existing documentation in the repo
   - Find any GitHub discussions or issues about ${typeName}
   - Understand common pain points and use cases

After completing the research, provide a summary of:
- The complete type definition (including all platform variants if applicable)
- All public methods (with signatures)
- Key use cases and integration points
- Any important design decisions or caveats
`;

    const researchResult = await session.prompt(researchPrompt);
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
