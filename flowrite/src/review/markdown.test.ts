// Structure extraction for the mechanical style checks. Pure string work — no Flue runtime, no model
// calls, so `npm test` runs these in milliseconds.
//
// Worth testing directly rather than only through the graders: every grader trusts these functions,
// so a mistake here becomes a false violation in fourteen places at once, and a false violation costs
// the writer a turn "fixing" something that was already correct.
import assert from 'node:assert/strict';
import test from 'node:test';

import { at, fenceMask, fences, frontmatterEnd, frontmatterFields, headings, stripInlineCode } from './markdown.ts';

const lines = (...content: string[]): string[] => content;

test('fences finds every block with its info string', () => {
  const page = lines(
    'Intro prose:',
    '```scala mdoc',
    'val x = 1',
    '```',
    'More prose:',
    '```',
    'plain',
    '```',
  );
  assert.deepEqual(fences(page), [
    { start: 1, end: 3, info: 'scala mdoc' },
    { start: 5, end: 7, info: '' },
  ]);
});

test('a fence closes only on its own marker character', () => {
  // A tilde line inside a backtick block is content, not a close — otherwise a block that documents
  // markdown itself would appear to end early and prose rules would fire on the code inside it.
  const page = lines('```scala', '~~~', 'val x = 1', '```');
  assert.deepEqual(fences(page), [{ start: 0, end: 3, info: 'scala' }]);
});

test('an unterminated fence runs to the end of the file', () => {
  // Truncated output should not make prose rules start firing inside Scala code.
  const page = lines('Prose:', '```scala', 'val x = 1');
  assert.deepEqual(fences(page), [{ start: 1, end: 2, info: 'scala' }]);
});

test('fenceMask covers the fence lines themselves', () => {
  const page = lines('prose', '```scala', 'code', '```', 'prose');
  assert.deepEqual(fenceMask(page), [false, true, true, true, false]);
});

test('headings ignores anything inside a code block', () => {
  const page = lines('## Real Heading', '```md', '## Not A Heading', '```', '### Also Real');
  assert.deepEqual(headings(page), [
    { line: 0, level: 2, text: 'Real Heading' },
    { line: 4, level: 3, text: 'Also Real' },
  ]);
});

test('headings requires a space after the hashes', () => {
  // `#tag` is not a heading, and neither is a bare `#`.
  assert.deepEqual(headings(lines('#tag', '#', '# Title')), [{ line: 2, level: 1, text: 'Title' }]);
});

test('frontmatterFields decodes the JSON-encoded values buildFrontmatter writes', () => {
  const page = lines(
    '---',
    'id: prism',
    'title: "Prism"',
    'description: "A Prism, with a \\"quoted\\" word"',
    'keywords:',
    '  - "optics"',
    '---',
    '',
    '## Overview',
  );
  const fields = frontmatterFields(page);
  assert.equal(fields.id, 'prism');
  assert.equal(fields.title, 'Prism');
  assert.equal(fields.description, 'A Prism, with a "quoted" word');
  // `keywords:` has no scalar value, so it is skipped rather than recorded as an empty string.
  assert.ok(!('keywords' in fields));
});

test('frontmatterFields returns nothing when there is no frontmatter', () => {
  assert.deepEqual(frontmatterFields(lines('## Overview', 'prose')), {});
  // An opening --- with no close is not frontmatter either.
  assert.deepEqual(frontmatterFields(lines('---', 'title: "x"')), {});
});

test('frontmatterEnd locates the closing delimiter', () => {
  assert.equal(frontmatterEnd(lines('---', 'id: prism', '---', '', '## Overview')), 2);
  assert.equal(frontmatterEnd(lines('## Overview')), -1);
});

test('stripInlineCode removes code spans so identifiers never trip prose rules', () => {
  assert.equal(stripInlineCode('Call `Chunk#map` to transform elements'), 'Call  to transform elements');
  assert.equal(stripInlineCode('no code here'), 'no code here');
});

test('at converts a 0-based index to the line number a model is shown', () => {
  assert.equal(at(0), 1);
  assert.equal(at(41), 42);
});
