// Run the mechanical style checks against a page from the command line.
//
//   node --experimental-strip-types scripts/grade-page.ts <path-to-page.md>
//
// Same graders the review phase uses, so this is how you see what review will say about a page without
// paying for a run — and how a new grader gets sanity-checked against real output rather than a fixture.
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import type { FlueHarness, FlueLogger } from '@flue/runtime';
import type { CheckContext } from '../src/review/check.ts';
import { CODE_CHECKS } from '../src/review/code/index.ts';
import { referencesCheck } from '../src/review/code/references.ts';
import { applyFixes } from '../src/review/fix.ts';
import { setRunContext } from '../src/shared/run-context.ts';

const path = process.argv[2];
if (path === undefined) {
  console.error(
    'usage: [REPO_PATH=<repo>] node --experimental-strip-types scripts/grade-page.ts <page.md>\n' +
      '  REPO_PATH defaults to the page\'s repo root, inferred by walking up past docs/.',
  );
  process.exit(2);
}

/**
 * The checkout the page belongs to, which the reference check resolves paths against.
 *
 * Inferred by walking up from the page past its `docs/` directory, so grading an archived run needs no
 * flag — the archive's `tinyoptics-final/` tree is a standalone project.
 */
const repoRoot =
  process.env.REPO_PATH ??
  (() => {
    const parts = nodePath.resolve(path).split(nodePath.sep);
    const docs = parts.lastIndexOf('docs');
    return docs > 0 ? parts.slice(0, docs).join(nodePath.sep) : process.cwd();
  })();
setRunContext({ projectPath: repoRoot, request: 'grade-page', skipPhases: [] });

const content = readFileSync(path, 'utf8');
const ctx: CheckContext = {
  // Repo-relative, because the reference check resolves relative links from the page's directory.
  path: nodePath.relative(repoRoot, nodePath.resolve(path)),
  content,
  lines: content.split('\n'),
  harness: undefined as unknown as FlueHarness,
  log: { info() {} } as unknown as FlueLogger,
};

console.log(`repo root: ${repoRoot}\npage: ${ctx.path}\n`);

let failures = 0;
for (const check of [...CODE_CHECKS, referencesCheck]) {
  for (const item of await check.run(ctx)) {
    if (item.pass) continue;
    failures++;
    console.log(`FAIL ${item.item}\n     ${item.issue}`);
  }
}

const fixed = applyFixes(content);
console.log(`\n${failures} mechanical violation(s) in ${path}`);
console.log(`auto-fixable now: ${fixed.fixed.length > 0 ? fixed.fixed.join(', ') : 'none'}`);
