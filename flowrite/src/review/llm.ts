import * as v from 'valibot';
import type { Check, CheckContext, ReviewItem } from './check.ts';
import { delegate } from '../shared/delegate.ts';
import { reviewSchema } from '../shared/schemas.ts';
import { authorHint } from '../shared/author-hint.ts';
// Single source of truth for the rules, shared with the writing-style skill (its SKILL.md points
// here; only the SKILL.md basename itself is barred from markdown imports by the build).
import rulesMarkdown from '../skills/writing-style/references/rules.md';

/**
 * The style rules that need reading comprehension.
 *
 * Everything absent from this list is decided by a `code` check — see src/review/code/index.ts. Rules
 * 7, 8, 16 and 20 have mechanical halves worth extracting later (link form, dot-prefixed method
 * references, imports present, the generic-phrase list); until then the model judges them whole. Rule
 * 21's mechanical half already lives in code as `style-21-form`, so what remains here is its judgement:
 * bullets for enumerable items, prose for a narrative.
 */
export const LLM_RULES = [1, 2, 3, 6, 7, 8, 9, 16, 17, 19, 20, 21, 24, 26];

/** This check's own id. Narrowing onto it re-runs every model-judged rule. */
export const STYLE_LLM = 'style-llm';

/**
 * How many rules one `style_checker` call judges. A genuine trade, not a tuning detail.
 *
 * Bigger groups mean fewer delegations, and delegations are what review costs: each one takes the
 * phase's scratch conversation about two turns of a context that accumulates, so cost is turns ×
 * context and the two multiply. Smaller groups mean more attention per rule. Env-overridable so it can
 * be A/B measured on one page rather than argued about.
 */
const GROUP_SIZE = Number(process.env.STYLE_GROUP_SIZE ?? 10);

const violationSchema = v.object({
  rule: v.pipe(v.number(), v.description('The violated rule number')),
  line: v.pipe(v.number(), v.description('Line where the violation starts (from the N: prefixes)')),
  problem: v.pipe(
    v.string(),
    v.description('What is wrong, specific enough to fix without re-reading the rule'),
  ),
});
const checkResultSchema = v.object({
  /**
   * Proof that the page reached the checker.
   *
   * `delegate()` cannot hand a payload to a subagent directly — it asks the phase's scratch
   * conversation to relay it through the `task` tool, and "pass the task through verbatim" is a request
   * with nothing enforcing it. In a measured run, 1 of 6 delegations replaced the whole line-numbered
   * page with a sentence naming its path (18,941 chars → 960). That checker happened to recover by
   * reading the file itself; the two other outcomes are an empty violations list, which the code would
   * have recorded as a clean pass, and invented line numbers, which would send the writer to edit the
   * wrong place. Both fail silently, which is why this is checked rather than trusted.
   */
  lastLine: v.pipe(
    v.number(),
    v.description('The number on the LAST "N:" line of the page you were given — proof you received all of it'),
  ),
  violations: v.array(violationSchema),
});

/** Rule number → rule text, parsed once from the same file the writing-style skill serves. */
const RULE_TEXT = new Map<number, string>(
  rulesMarkdown
    .split('\n')
    .map((line) => /^(\d+)\. (.+)$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => [Number(match[1]), match[2]] as const),
);

const numbered = (lines: string[]): string => lines.map((line, i) => `${i + 1}: ${line}`).join('\n');

/**
 * One check owning every model-judged style rule.
 *
 * Deliberately ONE check rather than fourteen. Each delegation costs the phase's scratch conversation
 * roughly two turns of an ever-growing context, so batching is the difference between two delegations
 * and fourteen relay round-trips — the latter would be worse than the loop this replaces. `covers` is
 * what lets `only` cut work inside the check instead of merely choosing between checks: re-checking two
 * failed rules is one delegation.
 *
 * Delegates rather than judging in the scratch conversation itself. Inlining would halve the turns, but
 * the narrow role's small, clean context may be why it judges well — a quality risk no arithmetic
 * settles, so it is left to its own measured experiment.
 */
export const llmStyleCheck: Check = {
  id: STYLE_LLM,
  kind: 'llm',
  covers: LLM_RULES.map((rule) => `style-${rule}`),
  async run(ctx: CheckContext, only?: string[]) {
    // Narrowing onto this check's OWN id means "re-run all of it" — which is what a payload-unverified
    // item narrows to. Without this branch `wanted` would come out empty, the check would return
    // nothing, and `runChecks` would carry forward no items for it: the unverified failure would
    // vanish and the verdict would pass.
    const wanted =
      only === undefined || only.includes(STYLE_LLM)
        ? LLM_RULES
        : LLM_RULES.filter((rule) => only.includes(`style-${rule}`));
    if (wanted.length === 0) return [];

    const groups: number[][] = [];
    for (let i = 0; i < wanted.length; i += GROUP_SIZE) groups.push(wanted.slice(i, i + GROUP_SIZE));

    const page = numbered(ctx.lines);
    const expectedLastLine = ctx.lines.length;
    const items: ReviewItem[] = [];

    for (const group of groups) {
      const label = `style_checker rules ${group.join(',')}`;
      // One retry, with the relay told explicitly not to summarise. A drop is intermittent (it
      // correlates with how many copies of the page the scratch conversation already holds), so a
      // second attempt is usually enough.
      let data = await ask(ctx, group, page, label, false);
      if (data.lastLine !== expectedLastLine) {
        ctx.log.info(
          `${label}: page did not arrive intact (reported last line ${data.lastLine}, expected ` +
            `${expectedLastLine}) — retrying with the payload marked as verbatim`,
        );
        data = await ask(ctx, group, page, label, true);
      }

      if (data.lastLine !== expectedLastLine) {
        // Never report a clean pass for a group whose page we cannot prove arrived. Fails the verdict
        // and narrows to this check's own id, so the repeat re-runs every model-judged rule.
        ctx.log.info(`${label}: page still did not arrive intact — recording the group as unverified`);
        items.push({
          item: `${STYLE_LLM} (payload unverified)`,
          pass: false,
          issue:
            `The style checker for rules ${group.join(', ')} reported the page ending at line ` +
            `${data.lastLine} instead of ${expectedLastLine}, so it did not receive the whole page and ` +
            `its result cannot be trusted. Call review again to re-run the model-judged style rules.`,
        });
        continue;
      }

      ctx.log.info(`${label}: ${data.violations.length} violation(s)`);
      for (const violation of data.violations) {
        // Only trust a rule number the group was actually asked about: a checker that reports rule 15
        // while judging rules 1-10 would create an item id no repeat review could narrow onto.
        const rule = group.includes(violation.rule) ? violation.rule : group[0];
        items.push({
          item: `style-${rule} @ line ${violation.line}`,
          pass: false,
          issue: violation.problem,
        });
      }
    }

    return items.length > 0
      ? items
      : [{ item: `Writing style (${wanted.length} model-judged rules)`, pass: true, issue: null }];
  },
};

/** One style_checker delegation. `insist` addresses the relay, which is what drops the page. */
function ask(
  ctx: CheckContext,
  group: number[],
  page: string,
  label: string,
  insist: boolean,
): Promise<v.InferOutput<typeof checkResultSchema>> {
  return delegate({
    harness: ctx.harness,
    log: ctx.log,
    label,
    role: 'style_checker',
    result: checkResultSchema,
    prompt: [
      ...(insist
        ? [
            `IMPORTANT: the page content is included in this message below. Pass it through to the ` +
              `subagent unchanged — do not summarise it and do not replace it with the file path.`,
            ``,
          ]
        : []),
      `Check the page below against ONLY these writing style rules:`,
      ``,
      ...group.map((rule) => `${rule}. ${RULE_TEXT.get(rule) ?? ''}`),
      ``,
      `Report "lastLine" as the number on the final "N:" line you can see, so we can confirm the whole`,
      `page reached you.`,
      ``,
      `--- PAGE (${ctx.path}, with line numbers) ---`,
      page,
    ].join('\n'),
  });
}

/**
 * The doc-kind checklist, evaluated by the generic `reviewer` role.
 *
 * The checklist content is injected per call because skills are role-owned and cannot vary per
 * delegated task — the same source-of-truth split the phases already used.
 */
export function checklistCheck(opts: {
  checklistDoc: string;
  /** Noun for the delegation prompt, e.g. 'data type reference page'. */
  promptNoun: string;
  /** Fenced header label, e.g. 'REFERENCE PAGE'. */
  headerLabel: string;
}): Check {
  return {
    id: 'checklist',
    kind: 'llm',
    async run(ctx) {
      const data = await delegate({
        harness: ctx.harness,
        log: ctx.log,
        label: 'reviewer',
        role: 'reviewer',
        result: reviewSchema,
        prompt: [
          `Evaluate the ${opts.promptNoun} below against every item in this checklist:`,
          ``,
          opts.checklistDoc,
          // Before the content delimiter, so the hint reads as reviewer guidance rather than as part
          // of the page under review.
          authorHint(),
          ``,
          `--- ${opts.headerLabel} (${ctx.path}) ---`,
          ctx.content,
        ].join('\n'),
      });
      ctx.log.info(`reviewer: ${data.items.filter((item) => !item.pass).length} failing item(s)`);
      return data.items;
    },
  };
}
