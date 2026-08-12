import type { Check, ReviewItem } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { fences } from '../markdown.ts';

/**
 * A pinned version in a cross-built dependency coordinate.
 *
 * `%%` narrows this to Scala library dependencies, which is what the rule is about. `scalaVersion :=
 * "2.13.12"` and `crossScalaVersions` have no `%%` and are left alone — those versions are real, not
 * placeholders. The quoted value must start with a digit, so the artifact name never matches.
 */
const PINNED = /%\s*"(\d+\.[^"]*)"/;

/**
 * Rule 25: use the `@VERSION@` placeholder for versions.
 *
 * A hardcoded version is stale the day the next release ships, and mdoc substitutes the placeholder at
 * build time. Carries a `fix`: replacing a literal with the placeholder needs no judgement.
 */
export const style25: Check = {
  id: 'style-25',
  kind: 'code',
  async run(ctx) {
    const failures: ReviewItem[] = [];
    for (const fence of fences(ctx.lines)) {
      for (let i = fence.start + 1; i < fence.end; i++) {
        const line = ctx.lines[i];
        if (!line.includes('%%')) continue;
        const match = PINNED.exec(line);
        if (match !== null) {
          failures.push(
            fail(
              'style-25',
              i,
              `Hardcoded dependency version "${match[1]}" in "${line.trim()}". Use the "@VERSION@" ` +
                `placeholder, which mdoc substitutes at build time.`,
            ),
          );
        }
      }
    }
    return summarize('style-25', '@VERSION@ placeholder for versions', failures);
  },
  fix(content) {
    const lines = content.split('\n');
    for (const fence of fences(lines)) {
      for (let i = fence.start + 1; i < fence.end; i++) {
        if (lines[i].includes('%%')) lines[i] = lines[i].replace(PINNED, '% "@VERSION@"');
      }
    }
    return lines.join('\n');
  },
};
