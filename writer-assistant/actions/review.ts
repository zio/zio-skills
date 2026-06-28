import { defineAction } from '@flue/runtime';
import * as v from 'valibot';
import * as fs from 'node:fs';

export interface ReviewConfig {
  outputPath: string;
  projectRoot: string;
  typeName: string;
  sourceFiles?: string[];
  relatedDocs?: string[];
}

export interface ReviewResult {
  approved: boolean;
  rounds: number;
  findingsFixed: { HIGH: number; MEDIUM: number; LOW: number };
  unresolvedIssues: string[];
}

const MAX_ROUNDS = 5;

export async function runReviewPhase(harness: any, config: ReviewConfig): Promise<ReviewResult> {
  const { outputPath, projectRoot, typeName, sourceFiles = [], relatedDocs = [] } = config;

  const result: ReviewResult = {
    approved: false,
    rounds: 0,
    findingsFixed: { HIGH: 0, MEDIUM: 0, LOW: 0 },
    unresolvedIssues: [],
  };

  if (!fs.existsSync(outputPath)) {
    return {
      ...result,
      approved: false,
      unresolvedIssues: [`Documentation file not found: ${outputPath}`],
    };
  }

  // Fixer session created once — shared across all rounds
  const fixerSession = await harness.session('docs-writer-fixer');

  const unresolvable = new Set<string>();

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    result.rounds = round;
    console.log(`\n[Phase 5] Round ${round}/${MAX_ROUNDS}: Spawning critic...`);

    const criticSession = await harness.session(`docs-reviewer-round-${round}`);

    const sourceFilesList =
      sourceFiles.length > 0 ? sourceFiles.map((f) => `  - ${f}`).join('\n') : '  (none provided)';
    const relatedDocsList =
      relatedDocs.length > 0 ? relatedDocs.map((f) => `  - ${f}`).join('\n') : '  (none provided)';

    const criticPrompt = `Review the documentation file for ${typeName}.

**Documentation file to review:**
${outputPath}

**Source files to verify accuracy against:**
${sourceFilesList}

**Related documentation to check consistency against:**
${relatedDocsList}

**Your task:**
Read the documentation file using the Read tool. If source files are provided, read them too to verify technical accuracy.

Analyze the documentation for:
- Technical accuracy against source code
- Completeness of explanations and examples
- Consistency with related documentation
- Clarity and organization

Output format MUST include two sections:

### Findings

For each finding, use this format:
**<SEVERITY>/<dimension>** — <title>
- Location: <file>:<line-range>
- Problem: <description>
- Impact: <why this matters>
- Suggestion: <how to fix>

Use SEVERITY: HIGH, MEDIUM, LOW
Use dimension: accuracy, completeness, consistency, clarity, structure

${
  unresolvable.size > 0
    ? `\n**Exclude these previously unresolvable issues (do not re-flag):**\n${Array.from(unresolvable)
        .map((u) => `- ${u}`)
        .join('\n')}\n`
    : ''
}

### Verdict

**APPROVED** or **ITERATE**`;

    let criticResult = await criticSession.prompt(criticPrompt);
    let criticText = criticResult.text || String(criticResult);

    if (!criticText.includes('### Findings') || !criticText.includes('### Verdict')) {
      console.log('  ⚠ Invalid critic response format, retrying...');
      const retryResult = await criticSession.prompt(
        'Your response was incomplete. Please re-run the analysis and ensure your output includes both "### Findings" and "### Verdict" sections.'
      );
      criticText = retryResult.text || String(retryResult);

      if (!criticText.includes('### Findings') || !criticText.includes('### Verdict')) {
        console.log('  ✗ Critic failed to produce valid format after retry');
        return {
          ...result,
          approved: false,
          unresolvedIssues: ['Critic agent failed to produce properly formatted review'],
        };
      }
    }

    const findingsSection = criticText.split('### Verdict')[0];
    const verdictSection = criticText.split('### Verdict')[1] || '';

    const findings = parseFindings(findingsSection);
    const verdict = verdictSection.toLowerCase().includes('**approved**') ? 'APPROVED' : 'ITERATE';

    const actionableCount = findings.HIGH.length + findings.MEDIUM.length;
    console.log(
      `  Found: ${findings.HIGH.length} HIGH, ${findings.MEDIUM.length} MEDIUM, ${findings.LOW.length} LOW (actionable: ${actionableCount})`
    );
    if (unresolvable.size > 0) {
      console.log(`  Unresolvable issues tracked: ${unresolvable.size}`);
    }

    if (verdict === 'APPROVED') {
      console.log(`  ✓ Documentation approved`);
      return {
        approved: true,
        rounds: round,
        findingsFixed: result.findingsFixed,
        unresolvedIssues: [],
      };
    }

    const actionable = [...findings.HIGH, ...findings.MEDIUM];

    if (actionable.length === 0) {
      console.log(`  ✓ No actionable findings (only LOW severity)`);
      return {
        approved: true,
        rounds: round,
        findingsFixed: result.findingsFixed,
        unresolvedIssues: [],
      };
    }

    if (round === MAX_ROUNDS) {
      console.log(`  ⚠ Max rounds reached (${MAX_ROUNDS}). Returning unresolved issues.`);
      return {
        approved: false,
        rounds: round,
        findingsFixed: result.findingsFixed,
        unresolvedIssues: actionable.map((f) => f.title),
      };
    }

    console.log(`  Spawning fixer for ${actionable.length} findings...`);

    const previousFeedbackSection =
      unresolvable.size > 0
        ? `\n**Issues that persisted in previous rounds** (be extra careful with these):\n${Array.from(unresolvable)
            .map((u) => `- ${u}`)
            .join('\n')}\n`
        : '';

    const fixerPrompt = `Fix the following documentation issues in ${outputPath}:

${actionable
  .map(
    (f, i) => `${i + 1}. **${f.severity}/${f.dimension}** — ${f.title}
   Location: ${f.location}
   Problem: ${f.problem}
   Suggestion: ${f.suggestion}`
  )
  .join('\n\n')}
${previousFeedbackSection}
**Critical verification steps for each fix:**

1. **Read the affected section** — Understand context and surrounding text
2. **Apply the fix carefully** — Make minimal, targeted changes
3. **Verify no regressions:**
   - Check adjacent paragraphs/examples aren't broken
   - Confirm related code examples still work
   - Verify links and cross-references still point to valid locations
   - Check the fix aligns with source code facts
4. **Only save if all checks pass** — Skip the fix if verification fails
5. **Report comprehensively:**
   - List each issue: "✓ Fixed: [title]" or "Could not fix: [title] (reason)"
   - Explain any skipped fixes briefly

Focus on quality over quantity. Better to skip a fix than introduce new problems.`;

    const fixerResult = await fixerSession.prompt(fixerPrompt);
    const fixerText = fixerResult.text || String(fixerResult);

    const fixedMatches = fixerText.match(/✓\s*Fixed:\s*(.+?)(?=\n|✓|Could not|$)/gi) || [];
    const couldNotFixMatches =
      fixerText.match(/Could not fix:\s*(.+?)(?=\n|✓|Could not|$)/gi) || [];

    console.log(`    Fixed: ${fixedMatches.length}, Could not fix: ${couldNotFixMatches.length}`);

    couldNotFixMatches.forEach((match: string) => {
      const title = match.replace(/Could not fix:\s*/i, '').trim();
      if (title.length > 0) unresolvable.add(title);
    });

    const numFixed = fixedMatches.length;
    if (numFixed > 0) {
      const highProp = findings.HIGH.length / actionable.length;
      const mediumProp = findings.MEDIUM.length / actionable.length;
      result.findingsFixed.HIGH += Math.ceil(numFixed * highProp);
      result.findingsFixed.MEDIUM += Math.ceil(numFixed * mediumProp);
    }
  }

  return result;
}

export const reviewAction = defineAction({
  name: 'review_docs',
  description:
    'Critique documentation and iteratively fix issues (critic → fixer loop) until approved or max rounds reached.',
  input: v.object({
    outputPath: v.string(),
    projectRoot: v.string(),
    typeName: v.string(),
    sourceFiles: v.optional(v.array(v.string())),
    relatedDocs: v.optional(v.array(v.string())),
  }),
  run: (async ({ harness, input }: { harness: any; input: any }) => {
    return runReviewPhase(harness, input);
  }) as (ctx: any) => any,
});

interface Finding {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  dimension: string;
  title: string;
  location: string;
  problem: string;
  suggestion: string;
}

interface ParsedFindings {
  HIGH: Finding[];
  MEDIUM: Finding[];
  LOW: Finding[];
}

function parseFindings(findingsText: string): ParsedFindings {
  const result: ParsedFindings = { HIGH: [], MEDIUM: [], LOW: [] };

  const findingPattern =
    /\*\*(HIGH|MEDIUM|LOW)\/(\w+)\*\*\s*—\s*(.+?)\n\s*-\s*Location:\s*(.+?)\n\s*-\s*Problem:\s*(.+?)\n\s*-\s*(?:Impact:.*?\n\s*)?-\s*Suggestion:\s*(.+?)(?=\n\*\*|$)/gs;

  let match: RegExpExecArray | null;
  while ((match = findingPattern.exec(findingsText)) !== null) {
    const [, severity, dimension, title, location, problem, suggestion] = match;
    result[severity as keyof ParsedFindings].push({
      severity: severity as 'HIGH' | 'MEDIUM' | 'LOW',
      dimension,
      title,
      location,
      problem,
      suggestion,
    });
  }

  return result;
}
