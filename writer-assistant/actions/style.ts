import { defineAction } from '@flue/runtime';
import * as v from 'valibot';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export interface StyleConfig {
  outputPath: string;
  projectRoot: string;
  typeName: string;
  maxRounds?: number;
}

export interface StyleResult {
  passed: boolean;
  rounds: number;
  violations: { [rule: string]: number };
  unresolvedViolations: string[];
}

const DEFAULT_MAX_ROUNDS = 1;

function resolveCheckStyleScript(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), 'skills/docs-writing-style/check-docs-style.sh'),
    path.resolve(
      process.env.FLUE_PROJECT_ROOT || '',
      'skills/docs-writing-style/check-docs-style.sh'
    ),
    path.resolve(
      process.env.FLUE_PROJECT_ROOT || '',
      '../../plugins/documentation/skills/docs-writing-style/check-docs-style.sh'
    ),
  ];
  return possiblePaths.find(fs.existsSync) ?? possiblePaths[0];
}

function resolveCheckMdocScript(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), 'skills/docs-mdoc-conventions/check-mdoc-conventions.sh'),
    path.resolve(
      process.env.FLUE_PROJECT_ROOT || '',
      'skills/docs-mdoc-conventions/check-mdoc-conventions.sh'
    ),
    path.resolve(
      process.env.FLUE_PROJECT_ROOT || '',
      '../../plugins/documentation/skills/docs-mdoc-conventions/check-mdoc-conventions.sh'
    ),
  ];
  return possiblePaths.find(fs.existsSync) ?? possiblePaths[0];
}

const CHECK_STYLE_SCRIPT = resolveCheckStyleScript();
const CHECK_MDOC_SCRIPT = resolveCheckMdocScript();

function runMechanicalCheck(outputPath: string, projectRoot: string): string {
  const outputs: string[] = [];

  try {
    outputs.push(
      execSync(`bash "${CHECK_STYLE_SCRIPT}" "${outputPath}"`, {
        cwd: projectRoot,
        encoding: 'utf-8',
      })
    );
  } catch (error: any) {
    outputs.push(error.stdout || String(error));
  }

  try {
    outputs.push(
      execSync(`bash "${CHECK_MDOC_SCRIPT}" "${outputPath}"`, {
        cwd: projectRoot,
        encoding: 'utf-8',
      })
    );
  } catch (error: any) {
    outputs.push(error.stdout || String(error));
  }

  return outputs.join('\n');
}

export async function runStylePhase(harness: any, config: StyleConfig): Promise<StyleResult> {
  const { outputPath, projectRoot, typeName } = config;
  const maxRounds = config.maxRounds ?? DEFAULT_MAX_ROUNDS;

  const result: StyleResult = {
    passed: false,
    rounds: 0,
    violations: {},
    unresolvedViolations: [],
  };

  if (!fs.existsSync(outputPath)) {
    return {
      ...result,
      passed: false,
      unresolvedViolations: [`Documentation file not found: ${outputPath}`],
    };
  }

  const hasStyleChecker = fs.existsSync(CHECK_STYLE_SCRIPT);
  const hasMdocChecker = fs.existsSync(CHECK_MDOC_SCRIPT);

  if (!hasStyleChecker && !hasMdocChecker) {
    console.log(`  ⚠ No style checkers found, skipping style validation`);
    return { ...result, passed: true, rounds: 0 };
  }

  // Fixer session created once for all rounds
  const fixerSession = await harness.session('docs-style-fixer');

  const unresolvable = new Set<string>();

  for (let round = 1; round <= maxRounds; round++) {
    result.rounds = round;
    console.log(`\n[Style] Round ${round}/${maxRounds}: Checking documentation style...`);

    const checkOutput = runMechanicalCheck(outputPath, projectRoot);
    const mechanicalLines = extractViolationLines(checkOutput);
    console.log(`  [Mechanical] Found ${mechanicalLines.length} violation(s)`);
    logRuleCounts(countByRule(mechanicalLines));

    // LLM-based judgment check
    let llmLines: string[] = [];
    try {
      const checkerSession = await harness.session(`docs-style-checker-round-${round}`);
      const checkerPrompt = `Review the documentation file for prose style rule violations:

File: ${outputPath}

Use the docs-writing-style skill to understand all 25 rules. Focus on these judgment-based rules that require language understanding:
- Rule 1: Person pronouns ("we" vs "you")
- Rule 5: No manual line breaks in prose
- Rule 8: Always qualify method names (e.g., Chunk#map, not map)
- Rule 12: No bare subheaders (need intro between ## and ###)
- Rule 14: When to use #### for topic organization
- Rule 17: One concept per code block
- Rule 19: Show method signatures within containing type
- Rule 20: Contextualized descriptions for code blocks

Read the file and report violations in this format:
[Rule N] <file>:<line>: <description>

Then output:
### Verdict
**APPROVED** or **ITERATE**`;

      const checkerResult = await checkerSession.prompt(checkerPrompt);
      const checkerText = checkerResult.text || String(checkerResult);
      llmLines = extractViolationLines(checkerText);
      console.log(`  [LLM Review] Found ${llmLines.length} violation(s)`);
      logRuleCounts(countByRule(llmLines));
    } catch (error) {
      console.log(`  [LLM Review] Skipped (${error instanceof Error ? error.message : 'error'})`);
    }

    const allLines = [...mechanicalLines, ...llmLines].filter((line) => {
      const key = extractLocationKey(line);
      return key === null || !unresolvable.has(key);
    });

    result.violations = countByRule(allLines);

    if (allLines.length === 0) {
      console.log(`  ✓ Documentation style validated`);
      return { passed: true, rounds: round, violations: result.violations, unresolvedViolations: [] };
    }

    console.log(`  Spawning fixer for ${allLines.length} violation(s)...`);

    const RULE_HINTS: Record<string, string> = {
      '19':
        'Rule 19 (signatures within containing type): bare `def`, `val`, or `var` in a code block must be wrapped inside its owning `trait`/`class`/`object`. Never show a standalone signature at top level of a code block.\nExample fixes:\n  Bad:  ```scala\n  def foo: Unit\n  ```\n  Good: ```scala\n  trait Foo {\n    def foo: Unit\n  }\n  ```\n\n  Bad:  ```scala\n  val live: ZLayer[Any, Nothing, Service]\n  ```\n  Good: ```scala\n  object Service {\n    val live: ZLayer[Any, Nothing, Service]\n  }\n  ```',
    };

    const violatedRuleNums = [
      ...new Set(allLines.map((l) => l.match(/\[Rule (\d+)\]/)?.[1]).filter(Boolean)),
    ];
    const ruleHints = violatedRuleNums
      .filter((r) => RULE_HINTS[r!])
      .map((r) => RULE_HINTS[r!])
      .join('\n\n');

    const fixerPrompt = `Fix the following style violations in ${outputPath}.
${ruleHints ? `\nRule guidance for the violations below:\n${ruleHints}\n` : ''}
The exact violations, with locations:

${allLines.join('\n')}

Process:

1. For each violation, Read the surrounding section of the file first.
2. Base every fix on the actual content at that location. For intro sentences before code blocks, read the code block and write a sentence describing what that specific code demonstrates.
3. Fix each violation independently — each location has different content, so read it before writing.
4. Verify adjacent prose, code examples, links, and heading hierarchy still hold after each fix.
5. Report each violation as one line:
   - "✓ Fixed ${path.basename(outputPath)}:<line>" or
   - "Could not fix ${path.basename(outputPath)}:<line> (reason)"

Better to skip a fix than introduce new problems.`;

    const fixerResult = await fixerSession.prompt(fixerPrompt);
    const fixerText = fixerResult.text || String(fixerResult);

    const fixedMatches = fixerText.match(/✓\s*Fixed\s+\S+:\d+/gi) || [];
    const couldNotFixMatches = fixerText.match(/Could not fix\s+\S+:\d+/gi) || [];

    console.log(`    Fixed: ${fixedMatches.length}, Could not fix: ${couldNotFixMatches.length}`);

    couldNotFixMatches.forEach((match: string) => {
      const key = extractLocationKey(match);
      if (key) unresolvable.add(key);
    });

    if (unresolvable.size > 0) {
      console.log(`  Unresolvable locations tracked: ${unresolvable.size}`);
    }
  }

  // Final mechanical re-check
  const finalOutput = runMechanicalCheck(outputPath, projectRoot);
  const finalLines = extractViolationLines(finalOutput).filter((line) => {
    const key = extractLocationKey(line);
    return key === null || !unresolvable.has(key);
  });
  result.violations = countByRule(finalLines);
  result.passed = finalLines.length === 0;
  result.unresolvedViolations = [
    ...finalLines,
    ...Array.from(unresolvable).map((key) => `${key} (fixer could not fix)`),
  ];

  console.log(`  [Final check] ${finalLines.length} mechanical violation(s) remaining`);

  return result;
}

export const styleAction = defineAction({
  name: 'validate_style',
  description:
    'Validate documentation prose style using mechanical checks and LLM review, then iteratively fix violations.',
  input: v.object({
    outputPath: v.string(),
    projectRoot: v.string(),
    typeName: v.string(),
    maxRounds: v.optional(v.number()),
  }),
  run: (async ({ harness, input }: { harness: any; input: any }) => {
    return runStylePhase(harness, input);
  }) as (ctx: any) => any,
});

function extractViolationLines(checkOutput: string): string[] {
  return checkOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\[Rule (\d+|mdoc)\]/.test(line));
}

function extractLocationKey(line: string): string | null {
  const match = line.match(/(\S+):(\d+)/);
  return match ? `${path.basename(match[1])}:${match[2]}` : null;
}

function countByRule(lines: string[]): { [rule: string]: number } {
  const counts: { [rule: string]: number } = {};
  for (const line of lines) {
    const match = line.match(/\[Rule (\d+)\]/);
    if (match) counts[match[1]] = (counts[match[1]] || 0) + 1;
  }
  return counts;
}

function logRuleCounts(counts: { [rule: string]: number }): void {
  Object.entries(counts).forEach(([rule, count]) => {
    if (count > 0) console.log(`    - Rule ${rule}: ${count}`);
  });
}
