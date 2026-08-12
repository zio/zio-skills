import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Check, CheckContext, ReviewItem } from '../check.ts';
import { fail, summarize } from '../item.ts';
import { fenceMask, fences, stripInlineCode } from '../markdown.ts';
import { getRepoPath } from '../../shared/run-context.ts';

/**
 * Does every repo artifact the page points at actually exist?
 *
 * Written after a run shipped a page instructing the reader to run
 * `sbt "tinyoptics-examples/runMain optics.DemoApp"` when no such main class had ever been generated —
 * the examples phase was bypassed, and the checklist item that should have caught it
 * ("Running the Examples embeds files in `<details>`") was answered **N/A** by the reviewer, with the
 * missing files given as the reason. A conditional item phrased "X embeds Y" goes vacuous exactly when Y
 * is absent, which is the case it exists to catch.
 *
 * So this is deliberately code, not a checklist line. Absence is the hardest thing for a model to judge
 * and the easiest thing for code: the model has to notice something is not there, while code calls
 * `stat`. Being a `code` check it also re-runs on every narrowed pass, for free.
 */

/** `path/to/File.scala` in a citation like `(source: src/main/scala/optics/Prism.scala:L32-L40)`. */
const CITATION = /\b((?:[\w.-]+\/)+[\w.-]+\.scala)(?::L\d+(?:-L\d+)?)?/g;
/** ```scala mdoc:embed:<path>[:modifier] — the embedded file must exist. */
const EMBED = /mdoc:embed:([^\s:`]+)/g;
/** `sbt "<project>/runMain <fully.qualified.Main>"` — the main class must be declared somewhere. */
const RUN_MAIN = /runMain\s+([A-Za-z_][\w.]*)/g;
/** A relative markdown link to another page: [`Lens`](./lens.md). */
const REL_LINK = /\]\((\.\.?\/[^)\s#]+)\)/g;

/** Every `.scala` file under a directory, recursively. Cached per run — the tree does not change mid-check. */
function scalaFiles(root: string, cache: Map<string, string[]>): string[] {
  const hit = cache.get(root);
  if (hit !== undefined) return hit;
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      // Skip build output and VCS internals: a stale class file in target/ must never satisfy a
      // reference that no source declares.
      if (entry === 'target' || entry === '.git' || entry === 'node_modules' || entry === '.bsp') continue;
      const full = path.join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) walk(full);
      else if (entry.endsWith('.scala')) out.push(full);
    }
  };
  walk(root);
  cache.set(root, out);
  return out;
}

/** True when some Scala source declares `object <name>` — what `runMain` needs to resolve. */
function declaresMain(repoRoot: string, fqcn: string, cache: Map<string, string[]>): boolean {
  const simple = fqcn.split('.').pop() ?? fqcn;
  const pattern = new RegExp(`\\bobject\\s+${simple.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`);
  return scalaFiles(repoRoot, cache).some((file) => {
    try {
      return pattern.test(readFileSync(file, 'utf8'));
    } catch {
      return false;
    }
  });
}

/** Matches of `pattern` in the page's prose, with the line each was found on. */
function prose(ctx: CheckContext, pattern: RegExp): { value: string; line: number }[] {
  const mask = fenceMask(ctx.lines);
  const out: { value: string; line: number }[] = [];
  for (let i = 0; i < ctx.lines.length; i++) {
    if (mask[i]) continue;
    for (const match of stripInlineCode(ctx.lines[i]).matchAll(pattern)) {
      out.push({ value: match[1], line: i });
    }
  }
  return out;
}

export const referencesCheck: Check = {
  id: 'references',
  kind: 'code',
  async run(ctx) {
    const repoRoot = getRepoPath();
    const cache = new Map<string, string[]>();
    const failures: ReviewItem[] = [];
    const seen = new Set<string>();

    const missing = (line: number, kind: string, target: string, advice: string): void => {
      // One report per distinct target: a citation repeated on twelve lines is one broken reference.
      if (seen.has(target)) return;
      seen.add(target);
      failures.push(fail('references', line, `${kind} "${target}" does not exist. ${advice}`));
    };

    // Source citations and relative links live in prose; embeds live in a fence's info string; runMain
    // appears in shell blocks, so it is searched across the whole page.
    for (const { value, line } of prose(ctx, CITATION)) {
      if (!existsSync(path.join(repoRoot, value))) {
        missing(line, 'Cited source file', value, 'Cite the real path, or drop the citation.');
      }
    }

    for (const { value, line } of prose(ctx, REL_LINK)) {
      const target = path.resolve(path.dirname(path.join(repoRoot, ctx.path)), value);
      if (!existsSync(target)) {
        missing(
          line,
          'Linked page',
          value,
          'Link a page that exists, with its full .md filename and a relative path.',
        );
      }
    }

    for (const fence of fences(ctx.lines)) {
      for (const match of fence.info.matchAll(EMBED)) {
        if (!existsSync(path.join(repoRoot, match[1]))) {
          missing(
            fence.start,
            'Embedded file',
            match[1],
            'mdoc fails the build on a missing embed — generate the file, or inline the code.',
          );
        }
      }
    }

    for (let i = 0; i < ctx.lines.length; i++) {
      for (const match of ctx.lines[i].matchAll(RUN_MAIN)) {
        if (!declaresMain(repoRoot, match[1], cache)) {
          missing(
            i,
            'Main class',
            match[1],
            'No Scala source declares this object, so the command a reader copies will fail. ' +
              'Generate the example, or remove the instruction.',
          );
        }
      }
    }

    return summarize('references', 'every referenced file, page and main class exists', failures);
  },
};
