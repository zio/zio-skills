// The mechanical style graders. Pure string work — no Flue runtime, no model calls.
//
// Every grader gets two tests: one page that violates its rule, and one clean page that must stay
// silent. The clean case is the important one. A grader that fires on correct prose is worse than no
// grader at all, because the writer spends a turn "fixing" something that was already right — and,
// unlike a missed violation, nothing downstream catches it.
import assert from 'node:assert/strict';
import test from 'node:test';

import type { FlueHarness, FlueLogger } from '@flue/runtime';
import type { Check, CheckContext, ReviewItem } from '../check.ts';
import { style4 } from './style-4.ts';
import { style5 } from './style-5.ts';
import { style10 } from './style-10.ts';
import { style11 } from './style-11.ts';
import { style12 } from './style-12.ts';
import { style13 } from './style-13.ts';
import { style14 } from './style-14.ts';
import { style15 } from './style-15.ts';
import { style18 } from './style-18.ts';
import { style22 } from './style-22.ts';
import { style23 } from './style-23.ts';
import { style25 } from './style-25.ts';
import { style27 } from './style-27.ts';
import { style28 } from './style-28.ts';

const page = (...lines: string[]): string => lines.join('\n');

/** Code checks never touch the harness or the logger, so the test supplies neither. */
const context = (content: string): CheckContext => ({
  path: 'docs/reference/prism.md',
  content,
  lines: content.split('\n'),
  harness: undefined as unknown as FlueHarness,
  log: undefined as unknown as FlueLogger,
});

const failures = async (check: Check, content: string): Promise<ReviewItem[]> =>
  (await check.run(context(content))).filter((item) => !item.pass);

/**
 * One correct page, checked against every grader in this file.
 *
 * It is deliberately realistic — frontmatter, two sibling subsections, an mdoc code block, a padded
 * table, a bullet list mixing fragments and sentences — because the graders' risk is not missing a
 * violation, it is inventing one on ordinary prose.
 */
const CLEAN = page(
  '---',
  'id: prism',
  'title: "Prism"',
  '---',
  '',
  '## Overview',
  '',
  'A prism focuses on one case of a sum type, so it may fail to match.',
  '',
  '### Creating a Prism',
  '',
  'Build one from a pair of functions:',
  '',
  '```scala',
  'import tinyoptics._',
  '',
  'val first = Prism[Either[Int, String], Int](_.left.toOption)(Left(_))',
  '```',
  '',
  '### Using a Prism',
  '',
  'The operations:',
  '',
  '| Method      | Description                   |',
  '|-------------|-------------------------------|',
  '| `getOption` | Returns the focused value     |',
  '| `set`       | Replaces it                   |',
  '',
  'Two of them matter here:',
  '',
  '- Fragments in a list need no capital',
  '- Full sentences start with a capital letter.',
  '',
);

const ALL = [
  style4, style5, style10, style11, style12, style13, style14,
  style15, style18, style22, style23, style25, style27, style28,
];

test('every grader stays silent on a correct page', async () => {
  for (const check of ALL) {
    const items = await check.run(context(CLEAN));
    assert.deepEqual(
      items.filter((item) => !item.pass),
      [],
      `${check.id} fired on the clean page`,
    );
    assert.equal(items.length, 1, `${check.id} should report exactly one passing item`);
  }
});

test('style-4 flags a full-sentence bullet that starts lowercase', async () => {
  const found = await failures(
    style4,
    page('## Overview', '', 'Two things matter:', '', '- this bullet is a whole sentence.', ''),
  );
  assert.equal(found.length, 1);
  assert.match(found[0].item, /^style-4 @ line 5$/);
});

test('style-4 ignores bullets that open with code, links or digits', async () => {
  // Capitalizing an identifier would be wrong, so these must never be reported.
  const found = await failures(
    style4,
    page(
      '## Overview',
      '',
      'Members:',
      '',
      '- `getOption` returns the focused value.',
      '- [Lens](./lens.md) always succeeds.',
      '- 2 arguments are required.',
      '',
    ),
  );
  assert.deepEqual(found, []);
});

test('style-5 flags a hard-wrapped paragraph and reports its first line', async () => {
  const found = await failures(
    style5,
    page('## Overview', '', 'A prism focuses on one case', 'of a sum type, so it may fail.', ''),
  );
  assert.equal(found.length, 1);
  assert.match(found[0].item, /^style-5 @ line 3$/);
  assert.match(found[0].issue ?? '', /hard-wrapped across 2 lines/);
});

test('style-5 does not mistake a wrapped bullet for a wrapped paragraph', async () => {
  // List continuations are indented; real top-level prose in this corpus never is.
  const found = await failures(
    style5,
    page(
      '## Overview',
      '',
      'Members:',
      '',
      '- `getOption` returns the focused value when the case matches,',
      '  and nothing when it does not, which is the whole point',
      '  of a prism.',
      '',
    ),
  );
  assert.deepEqual(found, []);
});

test('style-5 fix joins the paragraph and is idempotent', async () => {
  const wrapped = page('## Overview', '', 'A prism focuses on one case', 'of a sum type.', '');
  const once = style5.fix?.(wrapped) ?? wrapped;
  assert.equal(once, page('## Overview', '', 'A prism focuses on one case of a sum type.', ''));
  assert.equal(style5.fix?.(once), once);
  assert.deepEqual(await failures(style5, once), []);
});

test('style-10 flags a heading repeating the frontmatter title', async () => {
  const found = await failures(
    style10,
    page('---', 'title: "Prism"', '---', '', '# Prism', '', 'Prose.', ''),
  );
  assert.equal(found.length, 1);
  assert.match(found[0].item, /^style-10 @ line 5$/);
});

test('style-10 compares titles ignoring markup and case', async () => {
  const found = await failures(
    style10,
    page('---', 'title: "Prism"', '---', '', '## `prism`', '', 'Prose.', ''),
  );
  assert.equal(found.length, 1);
});

test('style-11 flags a level-1 body heading that is not the title', async () => {
  const found = await failures(
    style11,
    page('---', 'title: "Prism"', '---', '', '# Something Else', '', 'Prose.', ''),
  );
  assert.equal(found.length, 1);
  assert.match(found[0].issue ?? '', /body headings start at/);
});

test('style-11 leaves a title-repeating h1 to style-10', async () => {
  // One line must not draw two differently-worded complaints.
  const duplicate = page('---', 'title: "Prism"', '---', '', '# Prism', '', 'Prose.', '');
  assert.deepEqual(await failures(style11, duplicate), []);
  assert.equal((await failures(style10, duplicate)).length, 1);
});

test('style-11 flags a skipped heading level', async () => {
  const found = await failures(
    style11,
    page('## Overview', '', 'Prose.', '', '#### Too Deep', '', 'More prose.', ''),
  );
  assert.equal(found.length, 1);
  assert.match(found[0].issue ?? '', /jumps from "##" to "####"/);
});

test('style-12 flags a heading stacked straight onto its subheading', async () => {
  const found = await failures(
    style12,
    page('## Overview', '', '### Creating a Prism', '', 'Prose.', ''),
  );
  assert.equal(found.length, 1);
  assert.match(found[0].item, /^style-12 @ line 1$/);
});

test('style-12 ignores two headings at the same level', async () => {
  // An empty section is a different problem; this rule is about nesting only.
  const found = await failures(style12, page('## First', '', '## Second', '', 'Prose.', ''));
  assert.deepEqual(found, []);
});

test('style-13 flags a section with exactly one subsection', async () => {
  const found = await failures(
    style13,
    page('## Overview', '', 'Prose.', '', '### Only Child', '', 'More prose.', ''),
  );
  assert.equal(found.length, 1);
  assert.match(found[0].item, /^style-13 @ line 5$/);
});

test('style-13 honours the Core Operations exception', async () => {
  const found = await failures(
    style13,
    page('## Core Operations', '', 'Prose.', '', '### getOption', '', 'More prose.', ''),
  );
  assert.deepEqual(found, []);
});

test('style-14 flags a lone subsubsection, and style-13 stays out of it', async () => {
  const lone = page(
    '## Overview',
    '',
    'Prose.',
    '',
    '### Accessors',
    '',
    'Prose.',
    '',
    '#### Only One',
    '',
    'More prose.',
    '',
    '### Combinators',
    '',
    'Prose.',
    '',
  );
  const found = await failures(style14, lone);
  assert.equal(found.length, 1);
  assert.match(found[0].item, /^style-14 @ line 9$/);
  // The lone heading is reported once, by the rule that names its level.
  assert.deepEqual(await failures(style13, lone), []);
});

test('style-15 flags a code block after a heading, after another block, and after a bare sentence', async () => {
  const found = await failures(
    style15,
    page(
      '## Overview',
      '```scala',
      'val a = 1',
      '```',
      '',
      '```scala',
      'val b = 2',
      '```',
      '',
      'Some prose without a colon.',
      '',
      '```scala',
      'val c = 3',
      '```',
      '',
    ),
  );
  assert.equal(found.length, 3);
  assert.match(found[0].issue ?? '', /follows the heading/);
  assert.match(found[1].issue ?? '', /follows another code block/);
  assert.match(found[2].issue ?? '', /does not end with a colon/);
});

test('style-15 accepts a block introduced by a tab wrapper or a directive', async () => {
  // Rule 24 asks for tabbed blocks; punishing the tab wrapper would penalize following another rule.
  const found = await failures(
    style15,
    page(
      'Pick your Scala version:',
      '',
      '<TabItem value="scala-2">',
      '```scala',
      'implicit val x = 1',
      '```',
      '</TabItem>',
      '',
      ':::note',
      '```scala',
      'val y = 2',
      '```',
      ':::',
      '',
    ),
  );
  assert.deepEqual(found, []);
});

test('style-18 flags var in a Scala block but not in a comment or another word', async () => {
  const found = await failures(
    style18,
    page(
      'An example:',
      '',
      '```scala',
      '// never use var here',
      'val variance = 1',
      'var count = 0',
      '```',
      '',
    ),
  );
  assert.equal(found.length, 1);
  assert.match(found[0].item, /^style-18 @ line 6$/);
});

test('style-18 ignores var outside Scala blocks', async () => {
  const found = await failures(
    style18,
    page('Config:', '', '```bash', 'var=1', '```', '', 'Prose mentioning var in passing.', ''),
  );
  assert.deepEqual(found, []);
});

test('style-22 flags an unpadded column', async () => {
  const found = await failures(
    style22,
    page(
      'The operations:',
      '',
      '| Method | Description |',
      '|--------|-------------|',
      '| `set` | Replaces it |',
      '',
    ),
  );
  assert.equal(found.length, 1);
  assert.match(found[0].issue ?? '', /Column 1 of this table is not padded/);
});

test('style-22 flags a ragged table', async () => {
  const found = await failures(
    style22,
    page('The operations:', '', '| A | B |', '|---|---|', '| 1 |', ''),
  );
  assert.equal(found.length, 1);
  assert.match(found[0].issue ?? '', /do not all have 2 columns/);
});

test('style-23 flags a Scala 3 wildcard import, and its fix is idempotent', async () => {
  const scala3 = page('An example:', '', '```scala', 'import tinyoptics.*', 'val a = 1', '```', '');
  const found = await failures(style23, scala3);
  assert.equal(found.length, 1);
  assert.match(found[0].item, /^style-23 @ line 4$/);

  const once = style23.fix?.(scala3) ?? scala3;
  assert.match(once, /import tinyoptics\._/);
  assert.equal(style23.fix?.(once), once);
  assert.deepEqual(await failures(style23, once), []);
});

test('style-25 flags a pinned dependency version but not scalaVersion', async () => {
  const build = page(
    'Add the dependency:',
    '',
    '```scala',
    'scalaVersion := "2.13.12"',
    'libraryDependencies += "dev.zio" %% "tinyoptics" % "1.2.3"',
    '```',
    '',
  );
  const found = await failures(style25, build);
  assert.equal(found.length, 1);
  assert.match(found[0].item, /^style-25 @ line 5$/);
  assert.match(found[0].issue ?? '', /"1\.2\.3"/);

  const once = style25.fix?.(build) ?? build;
  assert.match(once, /% "@VERSION@"/);
  // The real scalaVersion is left alone — it is a version, not a placeholder.
  assert.match(once, /scalaVersion := "2\.13\.12"/);
  assert.equal(style25.fix?.(once), once);
  assert.deepEqual(await failures(style25, once), []);
});

test('style-27 flags planning vocabulary in prose, not in code', async () => {
  const found = await failures(
    style27,
    page(
      '## Overview',
      '',
      'The Tracing sub-domain wraps the exporter.',
      '',
      'A type literally named `SubDomain` is fair game:',
      '',
      '```scala',
      'val d: SubDomain = ???',
      '```',
      '',
    ),
  );
  assert.equal(found.length, 1);
  assert.match(found[0].item, /^style-27 @ line 3$/);
  assert.match(found[0].issue ?? '', /name the area directly/);
});

test('style-28 flags lowercase heading words, leaving the small ones alone', async () => {
  const found = await failures(style28, page('## Open a span and record work', '', 'Prose.', ''));
  assert.equal(found.length, 1);
  // "a" and "and" stay lowercase in title case; the content words do not.
  assert.match(found[0].issue ?? '', /capitalize "span", "record", "work"/);
});

test('style-28 leaves identifiers, acronyms and conventional names alone', async () => {
  // The grader most likely to invent a violation, so its restraint is what gets tested.
  const found = await failures(
    style28,
    page(
      '## Working with Chunk#map',
      '',
      'Prose.',
      '',
      '### Building with mdoc and sbt',
      '',
      'Prose.',
      '',
      '#### JSON and HTTP Codecs',
      '',
      'Prose.',
      '',
    ),
  );
  assert.deepEqual(found, []);
});
