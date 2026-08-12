// The batched llm style check. The model is stubbed — these tests are about how many delegations the
// check makes and how it names what it finds, which is what the cost of the review phase is made of.
import assert from 'node:assert/strict';
import test from 'node:test';

import type { FlueHarness, FlueLogger } from '@flue/runtime';
import type { CheckContext } from './check.ts';
import { LLM_RULES, llmStyleCheck } from './llm.ts';

interface Violation {
  rule: number;
  line: number;
  problem: string;
}

/**
 * A harness whose `prompt` records what it was asked and replies with canned violations.
 *
 * `delegate()` only ever touches `harness.prompt`, so nothing else needs to exist.
 */
function stubHarness(replies: Violation[][], lastLine: number | ((attempt: number) => number) = 3) {
  const prompts: string[] = [];
  const harness = {
    async prompt(text: string) {
      prompts.push(text);
      const attempt = prompts.length;
      return {
        data: {
          lastLine: typeof lastLine === 'function' ? lastLine(attempt) : lastLine,
          violations: replies[attempt - 1] ?? [],
        },
      };
    },
  } as unknown as FlueHarness;
  return { harness, prompts };
}

const log = { info() {} } as unknown as FlueLogger;

const context = (harness: FlueHarness, ...lines: string[]): CheckContext => ({
  path: 'docs/reference/prism.md',
  content: lines.join('\n'),
  lines,
  harness,
  log,
});

test('a full run batches the fourteen model-judged rules into two delegations', () => {
  // 14 rules at the default group size of 10. The count IS the cost: each delegation is about two
  // turns of the phase's accumulating conversation.
  assert.equal(LLM_RULES.length, 14);
});

test('a full run makes one delegation per rule group', async () => {
  const { harness, prompts } = stubHarness([[], []]);
  const items = await llmStyleCheck.run(context(harness, '## Overview', '', 'Prose.'));
  assert.equal(prompts.length, 2);
  assert.deepEqual(items, [{ item: 'Writing style (14 model-judged rules)', pass: true, issue: null }]);
});

test('a targeted re-check of two rules is a single delegation naming only those rules', async () => {
  // This is the property that makes a repeat review cheap enough to need no cap.
  const { harness, prompts } = stubHarness([[]]);
  await llmStyleCheck.run(context(harness, '## Overview', '', 'Prose.'), ['style-7', 'style-9']);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /^7\. /m);
  assert.match(prompts[0], /^9\. /m);
  assert.doesNotMatch(prompts[0], /^1\. /m);
});

test('narrowing onto rules this check does not own makes no delegation at all', async () => {
  const { harness, prompts } = stubHarness([[]]);
  const items = await llmStyleCheck.run(context(harness, 'Prose.'), ['style-15', 'coverage:Prism']);
  assert.equal(prompts.length, 0);
  assert.deepEqual(items, []);
});

test('the page is sent with line-number prefixes', async () => {
  const { harness, prompts } = stubHarness([[], []]);
  await llmStyleCheck.run(context(harness, '## Overview', '', 'Prose.'));
  assert.match(prompts[0], /^1: ## Overview$/m);
  assert.match(prompts[0], /^3: Prose\.$/m);
});

test('violations become items a repeat review can narrow onto', async () => {
  const { harness } = stubHarness([[{ rule: 7, line: 12, problem: 'Sibling type is not linked.' }], []]);
  const items = await llmStyleCheck.run(context(harness, '## Overview', '', 'Prose.'));
  const failing = items.filter((item) => !item.pass);
  assert.equal(failing.length, 1);
  assert.equal(failing[0].item, 'style-7 @ line 12');
  assert.equal(failing[0].issue, 'Sibling type is not linked.');
});

test('the prompt asks the checker to echo the page length', async () => {
  const { harness, prompts } = stubHarness([[], []]);
  await llmStyleCheck.run(context(harness, '## Overview', '', 'Prose.'));
  assert.match(prompts[0], /Report "lastLine" as the number on the final "N:" line/);
});

test('a page that did not arrive intact is retried, and the retry insists on verbatim', async () => {
  // The relay rewrites a payload it has already seen — 1 of 6 delegations in a measured run replaced
  // the whole page with a sentence naming its path. A drop is intermittent, so one retry is enough.
  const { harness, prompts } = stubHarness(
    [[{ rule: 7, line: 2, problem: 'Sibling type is not linked.' }], [{ rule: 7, line: 2, problem: 'Sibling type is not linked.' }]],
    (attempt) => (attempt === 1 ? 0 : 3),
  );
  const items = await llmStyleCheck.run(context(harness, '## Overview', '', 'Prose.'), ['style-7']);

  assert.equal(prompts.length, 2, 'should have retried exactly once');
  assert.match(prompts[1], /do not summarise it and do not replace it with the file path/);
  const failing = items.filter((item) => !item.pass);
  assert.equal(failing.length, 1);
  assert.equal(failing[0].item, 'style-7 @ line 2');
});

test('a group whose page never arrives fails the verdict instead of passing silently', async () => {
  // The dangerous outcome is an EMPTY violations list from a checker that saw nothing: without this
  // guard the code would record it as a clean pass.
  const { harness, prompts } = stubHarness([[], []], 0);
  const items = await llmStyleCheck.run(context(harness, '## Overview', '', 'Prose.'), ['style-7']);

  assert.equal(prompts.length, 2);
  assert.deepEqual(
    items.map((item) => [item.item, item.pass]),
    [['style-llm (payload unverified)', false]],
  );
  assert.match(items[0].issue ?? '', /did not receive the whole page/);
});

test('narrowing onto the check\'s own id re-runs every model-judged rule', async () => {
  // What a payload-unverified item narrows to. If this returned nothing, runChecks would carry forward
  // no items for the check and the unverified failure would vanish into a passing verdict.
  const { harness, prompts } = stubHarness([[], []]);
  const items = await llmStyleCheck.run(context(harness, '## Overview', '', 'Prose.'), ['style-llm']);
  assert.equal(prompts.length, 2, 'both rule groups should run');
  assert.deepEqual(items, [{ item: 'Writing style (14 model-judged rules)', pass: true, issue: null }]);
});

test('a rule number outside the group asked about is clamped into it', async () => {
  // A checker judging rules 1-10 that reports rule 15 would otherwise mint an item id no repeat review
  // could ever narrow onto, silently stranding the finding.
  const { harness } = stubHarness([[{ rule: 15, line: 3, problem: 'Out of scope for this group.' }], []]);
  const items = await llmStyleCheck.run(context(harness, '## Overview', '', 'Prose.'));
  const failing = items.filter((item) => !item.pass);
  assert.equal(failing.length, 1);
  assert.match(failing[0].item, /^style-1 @ line 3$/);
});
