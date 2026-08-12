// What each document kind's review is made of. Pure data assertions — no model calls.
import assert from 'node:assert/strict';
import test from 'node:test';

import { idsOf } from './check.ts';
import { CODE_CHECKS } from './code/index.ts';
import { buildChecks, type KindReview } from './registry.ts';

const kind = (over: Partial<KindReview> = {}): KindReview => ({
  checklistDoc: '- An item',
  promptNoun: 'page',
  headerLabel: 'PAGE',
  coverageTypes: [],
  pagePathFor: () => 'docs/reference/prism.md',
  ...over,
});

test('every check id in a kind is unique', () => {
  // Two checks sharing an id would make narrowing ambiguous and let one silently shadow the other in
  // the carried-forward verdict.
  for (const types of [[], ['Prism'], ['Prism', 'Lens', 'Optional']]) {
    const ids = buildChecks(kind({ coverageTypes: types })).map((check) => check.id);
    assert.deepEqual([...new Set(ids)].sort(), [...ids].sort(), `duplicate id with ${types.length} types`);
  }
});

test('a reference kind gets one coverage check per type, a tutorial gets none', () => {
  const withTypes = buildChecks(kind({ coverageTypes: ['Prism', 'Lens'] })).map((check) => check.id);
  assert.ok(withTypes.includes('coverage:Prism'));
  assert.ok(withTypes.includes('coverage:Lens'));

  const tutorial = buildChecks(kind()).map((check) => check.id);
  assert.deepEqual(tutorial.filter((id) => id.startsWith('coverage:')), []);
});

test('only two checks ever delegate, whatever the kind', () => {
  // The count is the cost. Deterministic checks are free, so a kind may add as many as it likes; the
  // delegating ones are the batched style check and the checklist, and that must stay true.
  for (const types of [[], ['Prism', 'Lens', 'Optional', 'Traversal']]) {
    const delegating = buildChecks(kind({ coverageTypes: types })).filter((check) => check.kind === 'llm');
    assert.deepEqual(delegating.map((check) => check.id), ['style-llm', 'checklist']);
  }
});

test('the deterministic checks run before anything reaches a model', () => {
  const checks = buildChecks(kind({ coverageTypes: ['Prism'] }));
  const firstLlm = checks.findIndex((check) => check.kind === 'llm');
  assert.ok(
    checks.slice(0, firstLlm).every((check) => check.kind === 'code'),
    'a delegating check is ordered before a free one',
  );
});

test('fifteen mechanical rules are decided in code', () => {
  // A model judged 28 style rules before this; it now judges 14. If a grader is removed from
  // CODE_CHECKS, its rule must move back into LLM_RULES or it stops being checked at all.
  assert.equal(CODE_CHECKS.length, 15);
  assert.deepEqual(
    CODE_CHECKS.flatMap(idsOf).sort(),
    [
      'style-10', 'style-11', 'style-12', 'style-13', 'style-14', 'style-15', 'style-18',
      'style-21-form', 'style-22', 'style-23', 'style-25', 'style-27', 'style-28', 'style-4', 'style-5',
    ],
  );
});
