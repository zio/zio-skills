import * as v from 'valibot';
import 'dotenv/config.js';
import * as path from 'node:path';
import { defineWorkflow } from '@flue/runtime';
import docsWriterAgent from '../agents/docs-writer.js';
import { runBuild } from '../lib/build-runner.js';

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
  run: organizeTypesRun as (ctx: any) => any,
});

async function organizeTypesRun({ harness, input }: { harness: any; input: any }) {
  const {
    projectRoot,
    types,
    category,
    auto = false,
    minConfidence = 'high',
    skipPhases = [],
  } = input as {
    projectRoot: string;
    types?: string[];
    category?: string;
    auto?: boolean;
    minConfidence?: 'high' | 'medium' | 'low';
    skipPhases?: string[];
  };

  if (!projectRoot) throw new Error('input.projectRoot is required');

  const isManual = !auto && (types || category);
  const isAuto = auto === true;

  if (!isManual && !isAuto) {
    throw new Error(
      'input requires either {types, category} for manual mode, or {auto: true} for automatic mode'
    );
  }
  if (isManual && (!types || !category)) {
    throw new Error('Manual mode requires both input.types (array) and input.category (string)');
  }
  if (auto && (types || category)) {
    throw new Error('Cannot combine auto mode with types/category — use one mode at a time');
  }

  const mode = isAuto ? 'auto' : 'manual';
  const docsDir = path.join(projectRoot, 'docs');
  const sidebarsPath = path.join(docsDir, 'sidebars.js');
  const phasesCompleted: string[] = [];

  console.log(`[organize-types] Starting sidebar organization (${mode} mode)`);
  console.log(`  Project root: ${projectRoot}`);
  if (mode === 'manual') {
    console.log(`  Types: ${types!.join(', ')}`);
    console.log(`  Category: ${category}`);
  } else {
    console.log(`  Min confidence: ${minConfidence}`);
  }

  try {
    process.env.FLUE_PROJECT_ROOT = projectRoot;

    const session = await harness.session('organize-types');

    // Phase 1: Prepare — validate types (manual) or scan all docs (auto)
    if (skipPhases.includes('prepare')) {
      console.log('\n[Phase 1] ⏭ Prepare skipped');
      phasesCompleted.push('prepare');
    } else {
      console.log('\n[Phase 1] Prepare: Analyzing current docs structure...');

      let preparePrompt: string;
      if (mode === 'manual') {
        preparePrompt = `**Phase 1: Validate Types for Manual Categorization**

Validate each type in the list below by checking for a corresponding .md file in ${docsDir}/reference/.

Types to validate: ${types!.join(', ')}

Steps:
1. For each type name, check if \`${docsDir}/reference/<type-name>.md\` exists
2. Read \`${sidebarsPath}\` to understand the current sidebar structure — specifically the Reference section
3. Check whether a category named "${category}" already exists in sidebars.js

Report:
- Which types were found (file exists)
- Which types are missing (no .md file found)
- Whether category "${category}" already exists and its current contents

If any types are missing, stop here and list them — do not proceed to Phase 2.`;
      } else {
        preparePrompt = `**Phase 1: Scan Documentation for Automatic Categorization**

Scan \`${docsDir}/reference/\` for all .md files (top-level only, exclude subdirectories).

For each file found:
1. Extract the \`id\` from the YAML frontmatter (format: \`id: <name>\`)
2. Extract the \`title\` from the frontmatter
3. Read the first 2-3 sentences of the body (after frontmatter) as the type description
4. Find any cross-references to other types (links in format \`[TypeName](./type-name.md)\`)

Also read \`${sidebarsPath}\` to understand which types are already in categories vs. uncategorized.

Build and report a summary:
- Total types found
- List of type names with titles and 1-sentence descriptions
- Cross-reference relationship map (type A links to type B)
- Types already in categories vs. types that are uncategorized

This analysis guides Phase 2.`;
      }

      await session.prompt(preparePrompt);
      console.log('[Phase 1] ✓ Prepare complete');
      phasesCompleted.push('prepare');
    }

    // Phase 2: Organize — create index.md files and update sidebars.js
    if (skipPhases.includes('organize')) {
      console.log('\n[Phase 2] ⏭ Organize skipped');
      phasesCompleted.push('organize');
    } else {
      console.log('\n[Phase 2] Organize: Applying categorization...');

      let organizePrompt: string;
      if (mode === 'manual') {
        const categoryKebab = category!
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const indexPath = path.join(docsDir, 'reference', categoryKebab, 'index.md');

        organizePrompt = `**Phase 2: Apply Manual Categorization**

Category: ${category}
Types to group: ${types!.join(', ')}

Apply these changes now:

**Step 1: Create category index file at \`${indexPath}\`**

Use this structure:
\`\`\`markdown
---
id: ${categoryKebab}
title: "${category}"
---

## Introduction

[2-3 sentences explaining what this category covers and why these types are grouped together]

**Related Types:**
[For each type: - [\`TypeName\`](./<type-name>.md) — one-sentence description extracted from the type's .md file]

## Overview

[Additional context about how these types work together and when to use them as a group]
\`\`\`

Extract each type's description from its \`${docsDir}/reference/<type-name>.md\` file (first sentence of body after frontmatter).

**Step 2: Update \`${sidebarsPath}\`**

Add (or update if it already exists) the category entry in the Reference section:
\`\`\`javascript
{
  type: "category",
  label: "${category}",
  link: { type: "doc", id: "reference/${categoryKebab}/index" },
  items: [
    ${types!.map((t) => `"reference/${categoryKebab}/${t}"`).join(',\n    ')}
  ]
}
\`\`\`

Maintain:
- Alphabetical order of types within the items array
- Alphabetical order of categories within the Reference section

Apply all changes and report: index file path created, types added, category status (new vs. updated).`;
      } else {
        const confidenceInstruction =
          minConfidence === 'high'
            ? 'Apply only HIGH confidence groupings. List MEDIUM and LOW as "suggested but not applied".'
            : minConfidence === 'medium'
              ? 'Apply HIGH and MEDIUM confidence groupings. List LOW as "suggested but not applied".'
              : 'Apply HIGH, MEDIUM, and LOW confidence groupings.';

        organizePrompt = `**Phase 2: Apply Automatic Categorization**

Based on your Phase 1 analysis, propose and apply category groupings.

**Categorization guidance** (from docs-organize-types skill):

| Category | Signal | Example Types |
|---|---|---|
| Collections | name contains "chunk", "list", "vector", "sequence", "collection" | Chunk, List, Vector, NonEmptyList |
| Type System & Schemas | name contains "schema", "type", "dynamic", "validation" | Schema, TypeId, DynamicValue |
| Resource Management & DI | name contains "resource", "scope", "wire", "finalizer", "context" | Resource, Scope, Wire |
| Error & Validation | content mentions error handling, constraints | SchemaError, Validation |
| Utilities & Formats | type is a format or utility (not a core abstraction) | MediaType, Syntax, Docs |

**Confidence levels:**
- HIGH (90%+): Clear semantic signal — name AND description both align with a category
- MEDIUM (70-89%): Some signal — description or relationships align, but not both
- LOW (<70%): Weak signal — prefer leaving uncategorized

**Instructions:**
1. Propose all category groupings with confidence levels
2. ${confidenceInstruction}
3. For each approved category:
   a. Create \`${docsDir}/reference/<category-kebab>/index.md\` with: frontmatter (id, title), Introduction (2-3 sentences), Related Types list with descriptions, Overview section
   b. Update \`${sidebarsPath}\`: add { type: "category", label, link, items } in alphabetical order
4. Report:
   - Categories created (with grouped types and confidence)
   - Proposals not applied (confidence below threshold)
   - Types that fit no category

Apply all approved changes now.`;
      }

      await session.prompt(organizePrompt);
      console.log('[Phase 2] ✓ Organization complete');
      phasesCompleted.push('organize');
    }

    // Phase 3: Verify sidebars.js syntax
    if (skipPhases.includes('verify')) {
      console.log('\n[Phase 3] ⏭ Verify skipped');
      phasesCompleted.push('verify');
    } else {
      console.log('\n[Phase 3] Verify: Checking sidebars.js syntax...');

      const verifyPrompt = `**Phase 3: Verify sidebars.js Syntax**

Run the following command to verify \`${sidebarsPath}\` has valid JavaScript syntax:
\`\`\`bash
node -e "require('${sidebarsPath}')"
\`\`\`

If the command succeeds (exit code 0): report "✅ Syntax valid" and stop.

If the command fails:
1. Read the error message to identify the exact line and problem (unmatched brace, trailing comma, stray quote)
2. Read \`${sidebarsPath}\` around that line
3. Fix the specific syntax issue
4. Run the command again
5. Repeat until valid (max 3 attempts)

Report: final syntax status, any fixes applied, and the remaining error if still invalid after 3 attempts.`;

      await session.prompt(verifyPrompt);
      console.log('[Phase 3] ✓ Verify complete');
      phasesCompleted.push('verify');
    }

    // Phase 4: Build Verification with auto-fix loop
    const MAX_BUILD_FIX_ROUNDS = 3;
    let buildVerifyResult = {
      success: false,
      buildSystem: 'unknown',
      durationMs: 0,
      skipped: false,
      rounds: 0,
    };
    const buildStartMs = Date.now();

    if (skipPhases.includes('verifyBuild')) {
      console.log('\n[Phase 4] ⏭ Build verification skipped');
      buildVerifyResult = {
        success: true,
        buildSystem: 'skipped',
        durationMs: 0,
        skipped: true,
        rounds: 0,
      };
    } else {
      console.log(
        `\n[Phase 4] Build Verification: Verifying docs build (max ${MAX_BUILD_FIX_ROUNDS} fix rounds)...`
      );
      try {
        const initialBuild = await runBuild(docsDir);
        buildVerifyResult.buildSystem = initialBuild.buildSystem;

        if (initialBuild.success && parseBuildErrors(initialBuild.output).length === 0) {
          console.log(`[Phase 4] ✓ Build passed on first attempt (${initialBuild.buildSystem})`);
          buildVerifyResult = {
            success: true,
            buildSystem: initialBuild.buildSystem,
            durationMs: Date.now() - buildStartMs,
            skipped: false,
            rounds: 0,
          };
        } else {
          let currentErrors = parseBuildErrors(initialBuild.output);
          console.log(`[Phase 4] Found ${currentErrors.length} error(s), starting fix loop`);

          let round = 0;
          for (round = 1; round <= MAX_BUILD_FIX_ROUNDS; round++) {
            if (currentErrors.length === 0) break;

            console.log(
              `[Phase 4] Fix attempt ${round}/${MAX_BUILD_FIX_ROUNDS} (${currentErrors.length} error(s))`
            );
            const errorList = currentErrors.map((e) => `  ${e}`).join('\n');
            await session.prompt(
              `Fix the following documentation website build errors in ${projectRoot}.\n\nErrors:\n${errorList}\n\nFor each error: read the file, identify the root cause (broken link, missing file, wrong sidebar path), fix it. If a sidebar entry points to a file that doesn't exist, either create the missing file or remove the entry. Report each fix applied.`
            );

            const reBuild = await runBuild(docsDir);
            currentErrors = parseBuildErrors(reBuild.output);
            buildVerifyResult.buildSystem = reBuild.buildSystem;

            if (currentErrors.length === 0) {
              console.log(`[Phase 4] ✓ All errors fixed after ${round} round(s)`);
              break;
            }
            console.log(`[Phase 4] Still ${currentErrors.length} error(s) after round ${round}`);
          }

          buildVerifyResult = {
            success: currentErrors.length === 0,
            buildSystem: buildVerifyResult.buildSystem,
            durationMs: Date.now() - buildStartMs,
            skipped: false,
            rounds: round,
          };
          console.log(
            `[Phase 4] ${buildVerifyResult.success ? '✓' : '⚠'} Build verification complete (${buildVerifyResult.rounds} fix round(s))`
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('No supported documentation build system detected')) {
          console.log('[Phase 4] ⚠ No documentation build system detected, skipping');
          buildVerifyResult = {
            success: true,
            buildSystem: 'none',
            durationMs: Date.now() - buildStartMs,
            skipped: true,
            rounds: 0,
          };
        } else {
          console.log(`[Phase 4] ⚠ Build verification failed: ${msg}`);
          buildVerifyResult.durationMs = Date.now() - buildStartMs;
        }
      }
    }
    phasesCompleted.push('verifyBuild');

    const expectedPhases = 4;
    const success = phasesCompleted.length === expectedPhases && buildVerifyResult.success;

    console.log(`\n[organize-types] ${success ? '✓ SUCCESS' : '⚠ PARTIAL'}`);
    console.log(`  Mode: ${mode}`);
    console.log(`  Phases completed: ${phasesCompleted.join(', ')}`);
    console.log(`  Project root: ${projectRoot}`);

    return {
      projectRoot,
      mode,
      status: success ? 'success' : 'partial',
      phasesCompleted,
      success,
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
      `[organize-types] Error: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      projectRoot,
      mode,
      status: 'failed',
      phasesCompleted,
      error: error instanceof Error ? error.message : String(error),
      success: false,
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
