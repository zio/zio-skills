import 'dotenv/config.js';
import * as v from 'valibot';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineWorkflow } from '@flue/runtime';
import docsWriterAgent from '../agents/docs-writer.js';

// Resolve plugin scripts: compiled output is at dist/workflows/, so three levels up = repo root
const WORKFLOW_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(WORKFLOW_DIR, '../../../');
const EXTRACT_SCRIPT = path.join(
  REPO_ROOT,
  'plugins/documentation/skills/docs-data-type-list-members/extract-members.scala'
);
const COVERAGE_SCRIPT = path.join(
  REPO_ROOT,
  'plugins/documentation/skills/docs-report-method-coverage/check-method-coverage.sh'
);

export interface ReportMethodCoverageResult {
  typeName: string;
  docFile: string;
  fullCoverage: boolean;
  categories: {
    companion?: { total: number; documented: number; missing: string[] };
    publicApi?: { total: number; documented: number; missing: string[] };
    inherited?: { total: number; documented: number; missing: string[] };
  };
  memberExtraction: {
    success: boolean;
    sourceFile: string;
    companion: string[];
    publicApi: string[];
    inherited: string[];
  } | null;
  durationMs: number;
}

export default defineWorkflow({
  agent: docsWriterAgent,
  input: v.looseObject({}),
  run: reportMethodCoverageRun as (ctx: any) => any,
});

async function reportMethodCoverageRun({ input }: { input: any }) {
  const { typeName, docFile, sourceFile, membersFile } = input as {
    typeName: string;
    docFile: string;
    sourceFile?: string;
    membersFile?: string;
  };

  if (!typeName) throw new Error('input.typeName is required');
  if (!docFile) throw new Error('input.docFile is required');
  if (!fs.existsSync(docFile)) throw new Error(`docFile not found: ${docFile}`);

  if (!sourceFile && !membersFile) {
    throw new Error('Either input.sourceFile or input.membersFile is required');
  }
  if (sourceFile && membersFile) {
    throw new Error('Provide either input.sourceFile or input.membersFile — not both');
  }
  if (sourceFile && !fs.existsSync(sourceFile)) {
    throw new Error(`sourceFile not found: ${sourceFile}`);
  }
  if (membersFile && !fs.existsSync(membersFile)) {
    throw new Error(`membersFile not found: ${membersFile}`);
  }

  console.log(`[report-method-coverage] Checking coverage for type: ${typeName}`);
  console.log(`  Doc file: ${docFile}`);
  if (sourceFile) console.log(`  Source file: ${sourceFile}`);
  if (membersFile) console.log(`  Members file: ${membersFile}`);

  const startMs = Date.now();
  let extraction: ReportMethodCoverageResult['memberExtraction'] = null;
  let resolvedMembersFile = membersFile ?? '';
  let tempFile: string | null = null;

  try {
    // Step 1: Extract members from source file (skipped when membersFile is provided directly)
    if (sourceFile) {
      console.log('\n[Step 1] Extracting members from source file...');

      const scriptArgs = ['--json', sourceFile, typeName];

      const result = spawnSync('scala-cli', [EXTRACT_SCRIPT, '--', ...scriptArgs], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });

      // Exit code 2 = invocation error; 0/1 = success/no-members-found (both parseable)
      if (result.status === 2 || result.status === null) {
        const errMsg = result.stderr?.trim() || result.error?.message || 'Unknown error';
        throw new Error(`Member extraction failed (exit ${result.status ?? 'null'}): ${errMsg}`);
      }

      let members = {
        companion: [] as string[],
        publicApi: [] as string[],
        inherited: [] as string[],
      };

      if (result.stdout?.trim()) {
        try {
          const parsed = JSON.parse(result.stdout.trim()) as {
            companion: string[];
            publicApi: string[];
            inherited: string[];
          };
          members = {
            companion: parsed.companion ?? [],
            publicApi: parsed.publicApi ?? [],
            inherited: parsed.inherited ?? [],
          };
        } catch {
          throw new Error(
            `Failed to parse extraction output as JSON: ${result.stdout.slice(0, 200)}`
          );
        }
      }

      extraction = { success: result.status === 0, sourceFile, ...members };

      // Write members to temp file in the sectioned format expected by check-method-coverage.sh
      const sections: string[] = [];
      if (members.companion.length > 0) {
        sections.push('=== Companion Object Members ===\n' + members.companion.join('\n'));
      }
      if (members.publicApi.length > 0) {
        sections.push('=== Public API ===\n' + members.publicApi.join('\n'));
      }
      if (members.inherited.length > 0) {
        sections.push('=== Inherited Methods ===\n' + members.inherited.join('\n'));
      }

      tempFile = path.join(os.tmpdir(), `coverage-members-${process.pid}.txt`);
      fs.writeFileSync(tempFile, sections.join('\n\n') + '\n', 'utf8');
      resolvedMembersFile = tempFile;

      const total = members.companion.length + members.publicApi.length + members.inherited.length;
      console.log(
        `[Step 1] ✓ Extracted ${total} members` +
          ` (companion: ${members.companion.length}, publicApi: ${members.publicApi.length}, inherited: ${members.inherited.length})`
      );
    }

    // Step 2: Cross-check members against the documentation file
    console.log('\n[Step 2] Checking documentation coverage...');

    const coverageResult = spawnSync(
      'bash',
      [COVERAGE_SCRIPT, '--json', typeName, docFile, resolvedMembersFile],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    // Exit code 2 = invocation error, null = process did not start
    if (coverageResult.status === 2 || coverageResult.status === null) {
      const errMsg =
        coverageResult.stderr?.trim() || coverageResult.error?.message || 'Unknown error';
      throw new Error(`Coverage check failed (exit ${coverageResult.status ?? 'null'}): ${errMsg}`);
    }

    let coverage: {
      typeName: string;
      docFile: string;
      categories: ReportMethodCoverageResult['categories'];
      fullCoverage: boolean;
    };

    try {
      coverage = JSON.parse(coverageResult.stdout.trim());
    } catch {
      throw new Error(
        `Failed to parse coverage output as JSON: ${coverageResult.stdout.slice(0, 200)}`
      );
    }

    const durationMs = Date.now() - startMs;

    if (coverage.fullCoverage) {
      console.log(`[Step 2] ✓ Full coverage — all members documented`);
    } else {
      const allMissing = Object.values(coverage.categories).flatMap((c) => c?.missing ?? []);
      console.log(`[Step 2] ⚠ Incomplete coverage — ${allMissing.length} member(s) missing`);
      const comp = coverage.categories.companion;
      const api = coverage.categories.publicApi;
      const inh = coverage.categories.inherited;
      if (comp?.missing && comp.missing.length > 0)
        console.log(`  Companion missing: ${comp.missing.join(', ')}`);
      if (api?.missing && api.missing.length > 0)
        console.log(`  Public API missing: ${api.missing.join(', ')}`);
      if (inh?.missing && inh.missing.length > 0)
        console.log(`  Inherited missing: ${inh.missing.join(', ')}`);
    }

    console.log(
      `\n[report-method-coverage] ${coverage.fullCoverage ? '✓ FULL COVERAGE' : '⚠ INCOMPLETE'} (${durationMs}ms)`
    );

    return {
      typeName: coverage.typeName,
      docFile: coverage.docFile,
      fullCoverage: coverage.fullCoverage,
      categories: coverage.categories,
      memberExtraction: extraction,
      durationMs,
    } satisfies ReportMethodCoverageResult;
  } finally {
    if (tempFile !== null && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}
