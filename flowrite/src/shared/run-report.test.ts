// The flag thresholds.
//
// `computeFlags` is pure, so these are data in / flags out — no runtime, no model calls. The first
// test is the load-bearing one: a report that cries wolf on a healthy run gets ignored, and then the
// genuine flags go unread too.
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActivityReport, PhaseUsage } from './component-usage.ts';
import { computeFlags, type FlagInput } from './run-report.ts';

/** A phase costing what a healthy phase costs, delegating more than it spends itself. */
const phase = (name: string, over: Partial<PhaseUsage> = {}): PhaseUsage => ({
  phase: name,
  ownTurns: 2,
  ownTokens: 20_000,
  ownCost: 0.01,
  delegateTurns: 10,
  delegateTokens: 200_000,
  delegateCost: 0.1,
  totalTokens: 220_000,
  totalCost: 0.11,
  ...over,
});

const activity = (over: Partial<ActivityReport> = {}): ActivityReport => ({
  tools: { bash: 20, read: 12, edit: 8, report_run_result: 1 },
  toolErrors: {},
  phaseFailures: {},
  skills: ['writing-style'],
  phaseCalls: { research_data_type: 1, design_data_type_structure: 1, write_data_type_reference: 1 },
  cdViolations: 0,
  ...over,
});

const input = (over: Partial<FlagInput> = {}): FlagInput => ({
  phases: [
    phase('research_data_type'),
    phase('design_data_type_structure'),
    phase('write_data_type_reference'),
    // The synthetic bucket is always present in a real run, and must never be judged as a phase:
    // it has no delegates, so it would trip own-exceeds-delegate on every single run.
    phase('(between phases)', { delegateTurns: 0, delegateTokens: 0, delegateCost: 0, ownCost: 0.2 }),
  ],
  activity: activity(),
  refusals: [],
  verdict: { passed: true, failingItems: [] },
  reportCalls: 1,
  ...over,
});

const codes = (over?: Partial<FlagInput>) => computeFlags(input(over)).map((f) => f.code);

test('a clean run produces no flags at all', () => {
  assert.deepEqual(computeFlags(input()), []);
});

test('a phase that ran twice is flagged', () => {
  const flags = codes({ activity: activity({ phaseCalls: { research_data_type: 3 } }) });
  assert.deepEqual(flags, ['phase-repeat']);
});

test('a repeating review is not flagged — that is the design', () => {
  // Review reports, the writer fixes, review confirms. A repeat re-checks only what failed, so it is
  // cheap by construction; flagging every run's normal loop would teach the reader to skip the report.
  // turn17 needed six passes to converge from a rough draft and was flagged for it.
  for (const calls of [2, 4, 6]) {
    assert.deepEqual(
      codes({ activity: activity({ phaseCalls: { review_data_type_ref: calls } }) }),
      [],
      `${calls} review passes should be unremarkable`,
    );
  }
});

test('a review loop past the limit is still flagged, in its own words', () => {
  const flags = computeFlags(input({ activity: activity({ phaseCalls: { review_module_ref: 7 } }) }));
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.code, 'phase-repeat');
  assert.match(flags[0]!.detail, /more review rounds than a page should need/);
});

test('a failed phase is flagged with what it spent', () => {
  const flags = computeFlags(
    input({ activity: activity({ phaseFailures: { design_data_type_structure: 2 } }) }),
  );
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.code, 'phase-failed');
  assert.match(flags[0]!.detail, /2 call\(s\) ended in error/);
  assert.match(flags[0]!.detail, /\$0\.1100/); // the phase's real cost, not a guess
});

test('guard refusals and give-ups are flagged', () => {
  assert.deepEqual(
    codes({ refusals: [{ tool: 'integrate_data_type_reference', parent: 'review_data_type_ref' }] }),
    ['guard-refusal'],
  );
  assert.deepEqual(codes({ activity: activity({ tools: { give_up: 2 } }) }), ['give-up']);
});

test('cd-ing into the repo is flagged', () => {
  assert.deepEqual(codes({ activity: activity({ cdViolations: 76 }) }), ['cd-into-repo']);
});

test('the review verdict drives review-failed and review-not-run', () => {
  assert.deepEqual(codes({ verdict: { passed: false, failingItems: ['writing-style rule 7'] } }), [
    'review-failed',
  ]);
  assert.deepEqual(codes({ verdict: { passed: null, failingItems: [] } }), ['review-not-run']);
});

test('a phase outspending its own delegates is flagged', () => {
  // The measured shape of the review phase: $1.67 coordinating, $0.99 delegated.
  const phases = input().phases.map((p) =>
    p.phase === 'write_data_type_reference' ? { ...p, ownCost: 1.667, delegateCost: 0.989 } : p,
  );
  const flags = computeFlags(input({ phases }));
  assert.deepEqual(flags.map((f) => f.code), ['own-exceeds-delegate']);
  assert.equal(flags[0]!.phase, 'write_data_type_reference');
});

test('a context-bloated phase is flagged, and only that phase', () => {
  // 85k tokens/turn against a 10k median — the review phase's real profile.
  const phases = input().phases.map((p) =>
    p.phase === 'write_data_type_reference'
      ? { ...p, ownTurns: 38, ownTokens: 38 * 85_000, ownCost: 0.05 }
      : { ...p, ownTurns: 2, ownTokens: 20_000 },
  );
  const flags = computeFlags(input({ phases }));
  assert.deepEqual(flags.map((f) => f.code), ['context-bloat']);
  assert.equal(flags[0]!.phase, 'write_data_type_reference');
  assert.match(flags[0]!.detail, /85k tokens per own turn/);
});

test('bloat needs at least three phases to have a baseline', () => {
  // A one-phase run has no median to be an outlier against, so a huge single phase must not flag.
  // This is the only threshold that depends on the rest of the run, so it is the only one that can
  // misfire on a short run.
  const flags = codes({
    phases: [phase('research_data_type', { ownTurns: 1, ownTokens: 900_000 })],
    activity: activity({ phaseCalls: { research_data_type: 1 } }),
  });
  assert.deepEqual(flags, []);
});

test('a refiled report is flagged', () => {
  assert.deepEqual(codes({ reportCalls: 2 }), ['report-refiled']);
});

test('tool errors flag only past the threshold', () => {
  assert.deepEqual(codes({ activity: activity({ toolErrors: { edit: 2 } }) }), []);
  assert.deepEqual(codes({ activity: activity({ toolErrors: { edit: 3 } }) }), ['tool-errors']);
});
