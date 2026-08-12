// The reference-existence check. Touches the filesystem, so each test builds a throwaway repo in tmp
// and points the run context at it.
//
// The case that motivated it: a page shipped telling readers to run `sbt "…/runMain optics.DemoApp"`
// with no such main class anywhere, because the examples phase was bypassed and the checklist item that
// should have caught it was answered "N/A" — with the missing files given as the reason.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FlueHarness, FlueLogger } from '@flue/runtime';
import type { CheckContext, ReviewItem } from '../check.ts';
import { setRunContext } from '../../shared/run-context.ts';
import { referencesCheck } from './references.ts';

/** A repo with one real source file, one real sibling page, and one real example main. */
function repo(files: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'flowrite-refs-'));
  const all: Record<string, string> = {
    'src/main/scala/optics/Prism.scala': 'package optics\nfinal case class Prism[S, A]()\n',
    'docs/reference/lens.md': '---\ntitle: "Lens"\n---\n',
    'examples/optics/CompleteExample.scala': 'package optics\nobject DemoApp { def main(a: Array[String]) = () }\n',
    ...files,
  };
  for (const [rel, body] of Object.entries(all)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  setRunContext({ projectPath: root, request: 'test', skipPhases: [] });
  return root;
}

const page = (...lines: string[]): string => lines.join('\n');

const context = (content: string): CheckContext => ({
  path: 'docs/reference/prism.md',
  content,
  lines: content.split('\n'),
  harness: undefined as unknown as FlueHarness,
  log: { info() {} } as unknown as FlueLogger,
});

const failures = async (content: string): Promise<ReviewItem[]> =>
  (await referencesCheck.run(context(content))).filter((item) => !item.pass);

test('a page whose every reference exists passes', async () => {
  repo();
  const found = await failures(
    page(
      '## Overview',
      '',
      'A prism focuses on one case. See [`Lens`](./lens.md) for the total version.',
      '',
      '(source: src/main/scala/optics/Prism.scala:L2-L2)',
      '',
      'Run it:',
      '',
      '```bash',
      'sbt "examples/runMain optics.DemoApp"',
      '```',
      '',
      'The whole example:',
      '',
      '```scala mdoc:embed:examples/optics/CompleteExample.scala',
      '```',
      '',
    ),
  );
  assert.deepEqual(found, []);
});

test('a runMain with no object declaring it fails — the case that shipped', async () => {
  repo();
  const found = await failures(
    page('## Overview', '', 'Run it:', '', '```bash', 'sbt "examples/runMain optics.Missing"', '```', ''),
  );
  assert.equal(found.length, 1);
  assert.match(found[0].issue ?? '', /Main class "optics\.Missing" does not exist/);
  assert.match(found[0].issue ?? '', /the command a reader copies will fail/);
});

test('build output cannot satisfy a main class', async () => {
  // A leftover .class under target/ from an earlier run must not make a missing example look present.
  repo({ 'examples/target/scala-2.13/classes/optics/Ghost.class': 'binary-ish' });
  const found = await failures(page('```bash', 'sbt "examples/runMain optics.Ghost"', '```', ''));
  assert.equal(found.length, 1);
});

test('a citation pointing at a file that does not exist fails', async () => {
  repo();
  const found = await failures(
    page('## Overview', '', 'Prose. (source: src/main/scala/optics/Nope.scala:L1-L9)', ''),
  );
  assert.equal(found.length, 1);
  assert.match(found[0].issue ?? '', /Cited source file "src\/main\/scala\/optics\/Nope\.scala"/);
});

test('a broken relative link fails, and is resolved from the page directory', async () => {
  repo();
  const found = await failures(page('## Overview', '', 'See [`Iso`](./iso.md) for details.', ''));
  assert.equal(found.length, 1);
  assert.match(found[0].issue ?? '', /Linked page "\.\/iso\.md"/);
});

test('a missing mdoc embed fails', async () => {
  repo();
  const found = await failures(
    page('## Overview', '', 'The whole example:', '', '```scala mdoc:embed:examples/optics/Gone.scala', '```', ''),
  );
  assert.equal(found.length, 1);
  assert.match(found[0].issue ?? '', /mdoc fails the build on a missing embed/);
});

test('one broken target repeated many times is one finding', async () => {
  repo();
  const found = await failures(
    page(
      '## Overview',
      '',
      'A. (source: src/main/scala/optics/Nope.scala:L1)',
      '',
      'B. (source: src/main/scala/optics/Nope.scala:L2)',
      '',
      'C. (source: src/main/scala/optics/Nope.scala:L3)',
      '',
    ),
  );
  assert.equal(found.length, 1);
});

test('code blocks are not scanned for citations or links', async () => {
  // A path inside an example is illustrative, not a claim about this repo.
  repo();
  const found = await failures(
    page(
      '## Overview',
      '',
      'An example:',
      '',
      '```scala',
      '// see src/main/scala/optics/Imaginary.scala for the original',
      'val x = 1',
      '```',
      '',
    ),
  );
  assert.deepEqual(found, []);
});
