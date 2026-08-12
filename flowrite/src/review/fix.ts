import type { FlueLogger } from '@flue/runtime';
import { FIXABLE } from './code/index.ts';

/**
 * Apply every deterministic repair until the text stops changing.
 *
 * Called on the write phase's return path, before the page is ever read by anything else: no model
 * call, no tool for the model to skip, no prompt to ignore. Review stays read-only, so a mechanical
 * violation surfacing at review is a real signal — either a later phase reintroduced it, or a `fix` is
 * broken.
 *
 * The loop exists because one fix can expose another (joining a hard-wrapped paragraph can bring two
 * bullets into contact). Every `fix` is idempotent and tested as such, so it settles on the first or
 * second pass; the pass cap only bounds a future fix that oscillates instead of converging.
 */
export function applyFixes(content: string): { content: string; fixed: string[] } {
  const fixed: string[] = [];
  let current = content;

  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const check of FIXABLE) {
      const next = check.fix?.(current) ?? current;
      if (next !== current) {
        current = next;
        changed = true;
        if (!fixed.includes(check.id)) fixed.push(check.id);
      }
    }
    if (!changed) break;
  }
  return { content: current, fixed };
}

/**
 * `applyFixes`, with a log line naming what it repaired. What every write phase calls.
 *
 * The log line is the only trace these repairs leave, and it is what tells a later investigation
 * whether a mechanical violation at review time was reintroduced downstream or never fixed at all.
 */
export function normalizePage(content: string, log: FlueLogger): string {
  const result = applyFixes(content);
  if (result.fixed.length > 0) {
    log.info(`Auto-fixed mechanical style rules: ${result.fixed.join(', ')}`);
  }
  return result.content;
}
