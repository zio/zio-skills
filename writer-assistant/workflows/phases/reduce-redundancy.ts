import * as fs from 'node:fs';
import type { FlueHarness } from '@flue/runtime';

export interface ReduceRedundancyConfig {
  outputPath: string;
  projectRoot: string;
  typeName: string;
  maxRounds?: number;
}

export interface RedundancyFinding {
  type: 'lexical' | 'structural' | 'semantic';
  section: string;
  description: string;
  raw: string;
}

export interface ReduceRedundancyResult {
  passed: boolean;
  rounds: number;
  findingsCount: { lexical: number; structural: number; semantic: number };
  fixed: number;
  unresolvedItems: string[];
}

const DEFAULT_MAX_ROUNDS = 3;

/**
 * Run the reduce-redundancy phase: scan → fix loop until no findings or max rounds.
 * Each round spawns a fresh scanner to detect remaining redundancies, then fixes them.
 * The same session is reused across rounds to preserve fixer context.
 */
export async function runReduceRedundancyPhase(
  harness: FlueHarness,
  config: ReduceRedundancyConfig
): Promise<ReduceRedundancyResult> {
  const { outputPath, projectRoot, typeName } = config;
  const maxRounds = config.maxRounds ?? DEFAULT_MAX_ROUNDS;

  const result: ReduceRedundancyResult = {
    passed: false,
    rounds: 0,
    findingsCount: { lexical: 0, structural: 0, semantic: 0 },
    fixed: 0,
    unresolvedItems: [],
  };

  if (!fs.existsSync(outputPath)) {
    return {
      ...result,
      passed: false,
      unresolvedItems: [`Documentation file not found: ${outputPath}`],
    };
  }

  const unresolvable = new Set<string>();

  const fixerSession = await harness.session('docs-redundancy-fixer');

  for (let round = 1; round <= maxRounds; round++) {
    result.rounds = round;
    console.log(`\n[ReduceRedundancy] Round ${round}/${maxRounds}: Scanning for redundancies...`);

    const scannerSession = await harness.session(`redundancy-scanner-round-${round}`);

    const scanPrompt = `Scan the documentation file for redundancies.

File: ${outputPath}
Type/Topic: ${typeName}

Read the full file. Then identify all redundancies using the docs-reduce-redundancy skill.

${
  unresolvable.size > 0
    ? `**Skip these previously unresolvable items (do not re-flag):**\n${Array.from(unresolvable)
        .map((u) => `- ${u}`)
        .join('\n')}\n`
    : ''
}

Report each finding on its own line in this exact format:
[REDUNDANCY] Type: <lexical|structural|semantic> | Section: <section-name> | <description of the redundancy>

After listing all findings, output:
### Summary
Total: <N> redundancies found (Lexical: <n>, Structural: <n>, Semantic: <n>)`;

    const scanResult = await scannerSession.prompt(scanPrompt);
    const scanText = scanResult.text || String(scanResult);

    const findings = parseFindings(scanText);
    const actionable = findings.filter((f) => {
      const key = redundancyKey(f);
      return !unresolvable.has(key);
    });

    result.findingsCount.lexical += findings.filter((f) => f.type === 'lexical').length;
    result.findingsCount.structural += findings.filter((f) => f.type === 'structural').length;
    result.findingsCount.semantic += findings.filter((f) => f.type === 'semantic').length;

    console.log(
      `  Found: ${actionable.length} actionable (Lexical: ${findings.filter((f) => f.type === 'lexical').length}, ` +
        `Structural: ${findings.filter((f) => f.type === 'structural').length}, ` +
        `Semantic: ${findings.filter((f) => f.type === 'semantic').length})`
    );

    if (actionable.length === 0) {
      console.log(`  ✓ No redundancies found`);
      return {
        ...result,
        passed: true,
        unresolvedItems: [],
      };
    }

    if (round === maxRounds) {
      console.log(`  ⚠ Max rounds reached (${maxRounds}). Returning unresolved items.`);
      return {
        ...result,
        passed: false,
        unresolvedItems: actionable.map((f) => f.raw),
      };
    }

    // Phase B: Fix using the reused fixer session
    console.log(`  Spawning fixer for ${actionable.length} redundancies...`);

    const fixPrompt = `Fix the following redundancies in ${outputPath}:

${actionable.map((f, i) => `${i + 1}. [${f.type.toUpperCase()}] Section: ${f.section}\n   ${f.description}`).join('\n\n')}

For each redundancy:
1. Read the affected section in ${outputPath} first
2. Apply the fix from the docs-reduce-redundancy skill's Fixing Strategies table
3. Preserve all meaning — only remove what is genuinely redundant
4. For repeated definitions: keep the first occurrence, replace later ones with a cross-reference link
5. Re-read the edited section to confirm it flows naturally

Report each fix as one line:
- "✓ Fixed: [section] – [description]" for successful fixes
- "Could not fix: [section] – [description] (reason)" for failures`;

    const fixResult = await fixerSession.prompt(fixPrompt);
    const fixText = fixResult.text || String(fixResult);

    const fixedMatches = fixText.match(/✓\s*Fixed:\s*(.+?)(?=\n|✓|Could not|$)/gi) || [];
    const couldNotFixMatches = fixText.match(/Could not fix:\s*(.+?)(?=\n|✓|Could not|$)/gi) || [];

    console.log(`    Fixed: ${fixedMatches.length}, Could not fix: ${couldNotFixMatches.length}`);
    result.fixed += fixedMatches.length;

    couldNotFixMatches.forEach((match: string) => {
      const key = match.replace(/Could not fix:\s*/i, '').trim();
      if (key.length > 0) unresolvable.add(key);
    });
  }

  const finalSession = await harness.session('redundancy-final-check');

  const finalScanResult = await finalSession.prompt(
    `Scan ${outputPath} for any remaining redundancies using the docs-reduce-redundancy skill.\n\nReport each finding as:\n[REDUNDANCY] Type: <lexical|structural|semantic> | Section: <section-name> | <description>\n\nIf none found, output: No redundancies found.`
  );
  const finalText = finalScanResult.text || String(finalScanResult);
  const remaining = parseFindings(finalText);

  result.passed = remaining.length === 0;
  result.unresolvedItems = [
    ...remaining.map((f) => f.raw),
    ...Array.from(unresolvable).map((key) => `${key} (fixer could not fix)`),
  ];

  console.log(`  [Final scan] ${remaining.length} redundancies remaining`);

  return result;
}

function parseFindings(text: string): RedundancyFinding[] {
  const findings: RedundancyFinding[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const match = line.match(
      /\[REDUNDANCY\]\s*Type:\s*(lexical|structural|semantic)\s*\|\s*Section:\s*([^|]+)\s*\|\s*(.+)/i
    );
    if (match) {
      findings.push({
        type: match[1].toLowerCase() as 'lexical' | 'structural' | 'semantic',
        section: match[2].trim(),
        description: match[3].trim(),
        raw: line.trim(),
      });
    }
  }

  return findings;
}

function redundancyKey(f: RedundancyFinding): string {
  return `${f.type}:${f.section}:${f.description.slice(0, 60)}`;
}
