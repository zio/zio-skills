// The deterministic repairs the write phase applies before anything reads the page.
//
// Idempotence is the property that matters most here and is tested twice — per fixer and for the whole
// pass. `applyFixes` loops until the text settles, so a fix that oscillates instead of converging would
// silently burn its pass budget and leave the page in whichever state the cap stopped on.
import assert from 'node:assert/strict';
import test from 'node:test';

import type { FlueHarness, FlueLogger } from '@flue/runtime';
import type { Check, CheckContext } from './check.ts';
import { FIXABLE } from './code/index.ts';
import { style21Form } from './code/style-21-form.ts';
import { applyFixes } from './fix.ts';

const page = (...lines: string[]): string => lines.join('\n');

const context = (content: string): CheckContext => ({
  path: 'docs/reference/prism.md',
  content,
  lines: content.split('\n'),
  harness: undefined as unknown as FlueHarness,
  log: undefined as unknown as FlueLogger,
});

const failures = async (check: Check, content: string) =>
  (await check.run(context(content))).filter((item) => !item.pass);

/** One page violating every repairable rule at once. */
const MESSY = page(
  '---',
  'title: "Prism"',
  '---',
  '',
  '## Overview',
  '',
  'A prism focuses on one case',
  'of a sum type, so it may fail.',
  '',
  'Members:',
  '',
  '- One',
  '',
  '- Two',
  '',
  'Import it:',
  '',
  '```scala',
  'import tinyoptics.*',
  '```',
  '',
  'Add the dependency:',
  '',
  '```scala',
  'libraryDependencies += "dev.zio" %% "tinyoptics" % "1.2.3"',
  '```',
  '',
);

test('only the four provably-safe rules carry a fix', () => {
  // Title Case (28) must stay detect-only: a naive title-caser mangles `## Working with Chunk#map`.
  assert.deepEqual(
    FIXABLE.map((check) => check.id).sort(),
    ['style-21-form', 'style-23', 'style-25', 'style-5'],
  );
});

test('applyFixes repairs every mechanical violation and names what it changed', () => {
  const result = applyFixes(MESSY);
  assert.deepEqual(result.fixed.sort(), ['style-21-form', 'style-23', 'style-25', 'style-5']);
  assert.match(result.content, /A prism focuses on one case of a sum type, so it may fail\./);
  assert.match(result.content, /import tinyoptics\._/);
  assert.match(result.content, /% "@VERSION@"/);
  assert.match(result.content, /- One\n- Two/);
});

test('applyFixes is idempotent as a whole pass', () => {
  const once = applyFixes(MESSY).content;
  const twice = applyFixes(once);
  assert.equal(twice.content, once);
  assert.deepEqual(twice.fixed, []);
});

test('every individual fix is idempotent', () => {
  for (const check of FIXABLE) {
    const once = check.fix?.(MESSY) ?? MESSY;
    assert.equal(check.fix?.(once), once, `${check.id} is not idempotent`);
  }
});

test('a clean page passes through untouched', () => {
  const clean = applyFixes(MESSY).content;
  assert.equal(applyFixes(clean).content, clean);
  assert.deepEqual(applyFixes(clean).fixed, []);
});

test('style-21-form flags blank lines between siblings', async () => {
  const found = await failures(style21Form, page('Members:', '', '- One', '', '- Two', ''));
  assert.equal(found.length, 1);
  assert.match(found[0].item, /^style-21-form @ line 3$/);
});

test('style-21-form leaves multi-paragraph list items alone', async () => {
  // A blank line followed by indented prose is a second paragraph of the same item, not a loose list.
  const found = await failures(
    style21Form,
    page('Members:', '', '- One', '', '  Its second paragraph.', '', '- Two', ''),
  );
  assert.deepEqual(found, []);
});

test('style-21-form leaves a list that simply ends alone', async () => {
  const found = await failures(style21Form, page('Members:', '', '- One', '', 'Closing prose.', ''));
  assert.deepEqual(found, []);
});
