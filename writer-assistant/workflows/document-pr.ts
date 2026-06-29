import * as v from 'valibot';
import 'dotenv/config.js';
import * as path from 'node:path';
import { defineWorkflow } from '@flue/runtime';
import docsWriterAgent from '../agents/docs-writer.js';
import { createRunMdoc } from '../tools/run_mdoc.js';
import { createBuildWebsite } from '../tools/build_website.js';
import { findRecentlyModifiedMarkdownFiles } from '../lib/markdown-utils.js';

export default defineWorkflow({
  agent: docsWriterAgent,
  input: v.looseObject({}),
  run: documentPrRun as (ctx: any) => any,
});

async function documentPrRun({ harness, input }: { harness: any; input: any }) {
  const {
    projectRoot,
    prNumber,
    repo,
    skipPhases = [],
    // Allow callers to supply pre-collected data when skipping earlier phases
    prData: prDataInput,
    decision: decisionInput,
    scalaExamplesGlob = 'src/main/scala/**/*.scala',
  } = input as {
    projectRoot: string;
    prNumber: string | number;
    repo?: string;
    /** Phase names to skip: "collect" | "decide" | "write" | "integrate" | "lint" */
    skipPhases?: string[];
    /** Pre-supplied PR summary — used when skipping the collect phase */
    prData?: string;
    /** Pre-supplied decision — used when skipping the decide phase */
    decision?: string;
    /** Glob for Scala example files relative to projectRoot (default: src/main/scala/**\/*.scala) */
    scalaExamplesGlob?: string;
  };

  if (!projectRoot) throw new Error('input.projectRoot is required');
  if (!prNumber) throw new Error('input.prNumber is required');

  const prStr = String(prNumber).replace(/^#/, '');
  const docsDir = path.join(projectRoot, 'docs');
  const phasesCompleted: string[] = [];
  let prData = prDataInput ?? '';
  let decision = decisionInput ?? 'no-docs-needed';
  let outputPath: string | null = null;
  let parentPage: string | null = null;
  let integratedIntoSidebar = false;
  let lintPassed: boolean | null = null;
  let writeRan = false;
  let writeStartTime = 0;

  console.log(`[document-pr] Documenting PR #${prStr}`);
  console.log(`  Project root: ${projectRoot}`);

  process.env.FLUE_PROJECT_ROOT = projectRoot;

  try {
    // Phase 1: Collect PR Data
    if (skipPhases.includes('collect')) {
      console.log('\n[Phase 1] ⏭ Collect skipped');
      if (!prData) {
        console.warn('[Phase 1] Warning: prData is empty — collect skipped with no pre-supplied data; Phase 2 will have no PR context');
      }
      phasesCompleted.push('collect');
    } else {
      console.log('\n[Phase 1] Collect: Fetching PR metadata from GitHub...');
      const collectSession = await harness.session('document-pr-collect');

      const repoInstruction = repo
        ? `Use repo: ${repo}`
        : `Auto-detect repo: run \`git -C ${projectRoot} remote -v\` and extract the "owner/repo" portion from the GitHub remote URL.`;

      prData = await collectSession.prompt(`**Phase 1: Collect PR Data**

${repoInstruction}

Run the following commands (all in ${projectRoot}):

1. Fetch PR metadata:
\`\`\`bash
gh pr view ${prStr} --json title,body,labels,commits,closingIssuesReferences --repo <owner/repo>
\`\`\`

2. Regex-scan the PR body for issue references (keywords: Closes/Fixes/Resolves/Relates to/see #).
   Merge with any issues in \`closingIssuesReferences\`. For each unique issue (max 5), fetch:
\`\`\`bash
gh issue view <ISSUE_NUMBER> --json title,body,labels --repo <owner/repo>
\`\`\`

Return a structured summary with:
- **PR Title**: the title
- **PR Body**: key motivation, context, notes (summarize if long)
- **Labels**: list of label names
- **Commits**: list of commit messages
- **Linked Issues**: for each issue — title, body summary, labels
- **Repo**: the owner/repo used`);

      console.log('[Phase 1] ✓ PR data collected');
      phasesCompleted.push('collect');
    }

    // Phase 2: Decide doc type
    // Phase 3: Write documentation
    // Single writer session across both phases so the agent retains decision context.
    const writerPhases = ['decide', 'write'];
    const needsWriterSession = writerPhases.some((p) => !skipPhases.includes(p));
    let writerSession: any = null;
    if (needsWriterSession) {
      writerSession = await harness.session('document-pr-write');
    }

    if (skipPhases.includes('decide')) {
      console.log('\n[Phase 2] ⏭ Decide skipped');
      if (!decisionInput) {
        console.warn('[Phase 2] Warning: decide skipped with no pre-supplied decision; write phase will use default "no-docs-needed"');
      }
      phasesCompleted.push('decide');
    } else {
      console.log('\n[Phase 2] Decide: Analyzing PR to determine documentation type...');

      const decideResult = await writerSession.prompt(`**Phase 2: Decide Documentation Type**

Project root: ${projectRoot}

**PR Data:**
${prData}

**Task:**
1. Scan \`${docsDir}/reference/\` and \`${docsDir}/guides/\` for all \`.md\` files.
   Read the \`id\` frontmatter field from each file to build the list of existing doc IDs.

2. Choose ONE decision:
   - \`new-reference-page\` — PR introduces a new data type, module, codec, or substantial API with no existing page
   - \`new-how-to-guide\` — PR introduces a workflow, pattern, or technique that deserves a step-by-step guide
   - \`subsection\` — PR enhances or fixes an existing feature; content fits under an existing page
   - \`no-docs-needed\` — PR is purely internal (CI, infra, refactor) with no user-visible change

   Heuristics:
   - Labels \`feat\`, \`new-module\` → lean toward new page
   - Labels \`enhancement\`, \`fix\` → lean toward subsection
   - Existing doc ID matches PR topic → subsection
   - Brand-new feature with no parent doc → new page

3. Propose the target path:
   - New page: e.g. \`docs/reference/schema-xml.md\` or \`docs/guides/using-schema-xml.md\`
   - Subsection: the existing page path to edit (e.g. \`docs/reference/schema.md\`)

Reply with EXACTLY this format (no extra text on these lines):
DECISION: <new-reference-page|new-how-to-guide|subsection|no-docs-needed>
OUTPUT_PATH: <relative path from projectRoot for new page, or "none">
PARENT_PAGE: <relative path from projectRoot for subsection target, or "none">
REASONING: <2-3 sentences>`);

      const decisionMatch = decideResult.match(/^DECISION:\s*(\S+)/m);
      const outputPathMatch = decideResult.match(/^OUTPUT_PATH:\s*(\S+)/m);
      const parentPageMatch = decideResult.match(/^PARENT_PAGE:\s*(\S+)/m);

      decision = decisionMatch?.[1] ?? 'no-docs-needed';
      outputPath = outputPathMatch?.[1] !== 'none' ? (outputPathMatch?.[1] ?? null) : null;
      parentPage = parentPageMatch?.[1] !== 'none' ? (parentPageMatch?.[1] ?? null) : null;

      console.log(`[Phase 2] ✓ Decision: ${decision}`);
      if (outputPath) console.log(`  New page: ${outputPath}`);
      if (parentPage) console.log(`  Edit page: ${parentPage}`);
      phasesCompleted.push('decide');
    }

    if (skipPhases.includes('write')) {
      console.log('\n[Phase 3] ⏭ Write skipped');
      phasesCompleted.push('write');
    } else if (decision === 'no-docs-needed') {
      console.log('\n[Phase 3] ⏭ Write skipped — no user-visible docs needed for this PR');
      phasesCompleted.push('write');
    } else {
      console.log(`\n[Phase 3] Write: Generating documentation (${decision})...`);

      let writePrompt: string;

      if (decision === 'new-reference-page') {
        const resolvedOut = outputPath ? path.resolve(projectRoot, outputPath) : '<output path>';
        writePrompt = `**Phase 3: Write Reference Page**

Output file: ${resolvedOut}

Using the PR data and your decision from Phase 2, write a comprehensive reference page.

Requirements:
- Frontmatter: \`id\` (kebab-case), \`title\`, \`description\` (≤150 chars), \`keywords\` (3-7 phrases)
- Follow the docs-data-type-ref skill structure:
  Opening definition (no heading) → Motivation → Quick Showcase → Installation → Construction → Core Operations → optional sections
- Document every public method/type introduced by this PR
- All code examples MUST use mdoc syntax (\`mdoc\`, \`mdoc:reset\`, \`mdoc:compile-only\` as appropriate)
- No blank lines between consecutive code blocks
- Source content from PR: title → doc title, PR body + issues → motivation and use-cases, commits → changelog

Write the complete markdown file and save it to the output path.`;
      } else if (decision === 'new-how-to-guide') {
        const resolvedOut = outputPath ? path.resolve(projectRoot, outputPath) : '<output path>';
        writePrompt = `**Phase 3: Write How-To Guide**

Output file: ${resolvedOut}

Using the PR data and your decision from Phase 2, write a goal-oriented how-to guide.

Requirements:
- Frontmatter: \`id\`, \`title\` (starts with "How to…"), \`description\` (≤150 chars), \`keywords\`
- Follow the docs-how-to-guide skill structure:
  Goal statement → Prerequisites → Numbered steps → Complete runnable example → Next steps
- Each step must include a concrete code example
- All code examples MUST use mdoc syntax
- Imperative mood, second person ("you"), numbered steps
- Extract motivation and use-cases from PR body and linked issues

Write the complete markdown file and save it to the output path.`;
      } else {
        // subsection
        const resolvedParent = parentPage ? path.resolve(projectRoot, parentPage) : '<parent page>';
        writePrompt = `**Phase 3: Add Subsection to Existing Page**

File to edit: ${resolvedParent}

Using the PR data and your decision from Phase 2, append a new subsection to the existing page.

Use this structure:

\`\`\`markdown
## <Feature Name from PR Title>

<Context: what problem does this solve? Source from linked issues.>

### Changes in this PR

- <bullet: what changed — source from commit messages>

### Example

\`\`\`scala
// brief mdoc example showing the new feature
\`\`\`

### API Reference

<list new types/methods if applicable>
\`\`\`

Requirements:
- Use PR title for the section heading
- Source motivation from PR body and linked issues
- Source change bullets from commit messages
- Follow docs-writing-style for prose
- Follow docs-mdoc-conventions for code block syntax
- Insert at the logical position in the existing page (append unless a better position is clear)

Edit the existing page file.`;
      }

      writeStartTime = Date.now();
      await writerSession.prompt(writePrompt);
      writeRan = true;
      console.log('[Phase 3] ✓ Documentation written');
      phasesCompleted.push('write');
    }

    // Phase 4: Integrate — only for new pages
    if (skipPhases.includes('integrate')) {
      console.log('\n[Phase 4] ⏭ Integrate skipped');
      phasesCompleted.push('integrate');
    } else if (writeRan && (decision === 'new-reference-page' || decision === 'new-how-to-guide')) {
      console.log('\n[Phase 4] Integrate: Wiring new page into Docusaurus site...');
      const integrateSession = await harness.session('document-pr-integrate');

      await integrateSession.prompt(
        `Integrate the newly written documentation page into the Docusaurus site.

Project root: ${projectRoot}
New page path: ${outputPath}

Follow the docs-integrate checklist:
1. Add to sidebars.js under the correct category
2. Add link in docs/index.md under the correct section
3. Run run_mdoc to verify compilation — fix any errors before continuing
4. Run build_website to verify the full site builds — fix any errors before continuing

Do not proceed to the next step until the current one succeeds.`,
        { tools: [createRunMdoc(projectRoot), createBuildWebsite(projectRoot)] }
      );

      integratedIntoSidebar = true;
      console.log('[Phase 4] ✓ Integration complete');
      phasesCompleted.push('integrate');
    } else {
      console.log('\n[Phase 4] ⏭ Integrate skipped — subsection or no-docs-needed');
      phasesCompleted.push('integrate');
    }

    // Phase 5: Verify Lint — only if write actually ran and Scala files may have been touched
    if (skipPhases.includes('lint')) {
      console.log('\n[Phase 5] ⏭ Lint skipped');
      phasesCompleted.push('lint');
    } else if (!writeRan) {
      console.log('\n[Phase 5] ⏭ Lint skipped — write did not run');
      phasesCompleted.push('lint');
    } else {
      const changedMarkdownFiles = findRecentlyModifiedMarkdownFiles(
        projectRoot,
        docsDir,
        writeStartTime
      );

      if (changedMarkdownFiles.length > 0 || outputPath || parentPage) {
        console.log('\n[Phase 5] Lint: Checking Scala example formatting...');
        const lintSession = await harness.session('document-pr-lint');

        const lintResult = await lintSession.prompt(`**Phase 5: Verify Scala Lint (if applicable)**

Project root: ${projectRoot}

Check whether any \`.scala\` files were created or modified during documentation writing:
\`\`\`bash
git -C ${projectRoot} diff --name-only HEAD
\`\`\`

If any files matching \`${scalaExamplesGlob}\` appear in the diff:
\`\`\`bash
cd ${projectRoot} && git add ${scalaExamplesGlob} && sbt fmtChanged
cd ${projectRoot} && sbt check
\`\`\`

Reply with one of:
- NO_SCALA_FILES — if no scala files were created or modified
- LINT_PASSED — if scalafmt and sbt check both passed
- LINT_FAILED: <error details> — if either check failed`);

        if (lintResult.includes('NO_SCALA_FILES')) {
          lintPassed = null;
          console.log('[Phase 5] ✓ No Scala files — lint not applicable');
        } else if (lintResult.includes('LINT_PASSED')) {
          lintPassed = true;
          console.log('[Phase 5] ✓ Lint passed');
        } else {
          lintPassed = false;
          console.log('[Phase 5] ✗ Lint failed — check session output for details');
        }
        phasesCompleted.push('lint');
      } else {
        console.log('\n[Phase 5] ⏭ Lint skipped — no files modified');
        phasesCompleted.push('lint');
      }
    }

    console.log(`\n[document-pr] Done. Phases: ${phasesCompleted.join(' → ')}`);

    return {
      prNumber: prStr,
      decision,
      outputPath,
      parentPage,
      phasesCompleted,
      integratedIntoSidebar,
      lintPassed,
    };
  } catch (error) {
    console.error(`\n[document-pr] ✗ Failed in phase ${phasesCompleted.length + 1}`);
    return {
      prNumber: prStr,
      decision,
      outputPath,
      parentPage,
      phasesCompleted,
      integratedIntoSidebar,
      lintPassed,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
