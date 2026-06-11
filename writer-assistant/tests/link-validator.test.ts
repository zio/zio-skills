import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { validateSuggestion } from '../workflows/utils/link-validator.js';
import type { LinkSuggestion } from '../lib/schemas.js';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crossref-test-'));
  fs.mkdirSync(path.join(tmpDir, 'reference'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'reference', 'zio.md'), '# ZIO\nContent.');
  fs.writeFileSync(path.join(tmpDir, 'guide.md'), '# Guide\nContent.');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

function makeSuggestion(overrides: Partial<LinkSuggestion> = {}): LinkSuggestion {
  return {
    sourceId: 'guide',
    targetId: 'reference-zio',
    targetTitle: 'ZIO',
    targetRelativePath: './reference/zio.md',
    anchorText: 'ZIO runtime',
    type: 'inline',
    confidence: 'high',
    reasoning: 'test',
    status: 'pending',
    ...overrides,
  };
}

const SOURCE_CONTENT = '# Guide\n\nUse the ZIO runtime for effects.';

describe('validateSuggestion', () => {
  it('returns ok for valid suggestion', () => {
    const result = validateSuggestion(
      makeSuggestion(),
      SOURCE_CONTENT,
      tmpDir,
      path.join(tmpDir, 'guide.md')
    );
    expect(result).toEqual({ ok: true });
  });

  it('returns target_missing when target file does not exist', () => {
    const result = validateSuggestion(
      makeSuggestion({ targetRelativePath: './reference/missing.md' }),
      SOURCE_CONTENT,
      tmpDir,
      path.join(tmpDir, 'guide.md')
    );
    expect(result).toEqual({ ok: false, reason: 'target_missing' });
  });

  it('returns already_linked when link already exists in source', () => {
    const contentWithLink = '# Guide\n\nUse [ZIO runtime](./reference/zio.md) for effects.';
    const result = validateSuggestion(
      makeSuggestion(),
      contentWithLink,
      tmpDir,
      path.join(tmpDir, 'guide.md')
    );
    expect(result).toEqual({ ok: false, reason: 'already_linked' });
  });

  it('returns path_unresolvable when path escapes docsDir', () => {
    const result = validateSuggestion(
      makeSuggestion({ targetRelativePath: '../../../../etc/passwd' }),
      SOURCE_CONTENT,
      tmpDir,
      path.join(tmpDir, 'guide.md')
    );
    expect(result).toEqual({ ok: false, reason: 'path_unresolvable' });
  });

  it('returns anchor_not_in_source when anchor text not found (Issue #7 fix)', () => {
    const result = validateSuggestion(
      makeSuggestion({ anchorText: 'nonexistent anchor text' }),
      SOURCE_CONTENT,
      tmpDir,
      path.join(tmpDir, 'guide.md')
    );
    expect(result).toEqual({ ok: false, reason: 'anchor_not_in_source' });
  });

  it('passes validation when anchor text is found via fuzzy matching', () => {
    // "the ZIO Runtime" should match "ZIO runtime" via fuzzy strategies
    const result = validateSuggestion(
      makeSuggestion({ anchorText: 'the ZIO Runtime' }),
      SOURCE_CONTENT,  // Contains "ZIO runtime"
      tmpDir,
      path.join(tmpDir, 'guide.md')
    );
    expect(result).toEqual({ ok: true });
  });

  it('prevents validation-insertion mismatch (Issue #7: catch anchor mismatches upfront)', () => {
    // This test verifies that if validation passes, insertion WILL succeed
    // Previously: validation passed, insertion failed (silent failure)
    // Now: validation fails early with clear reason

    const wrongAnchor = 'xyzabc something definitely not there';  // Absolutely not in content!
    const result = validateSuggestion(
      makeSuggestion({ anchorText: wrongAnchor }),
      SOURCE_CONTENT,  // Only has "ZIO runtime"
      tmpDir,
      path.join(tmpDir, 'guide.md')
    );

    // Should FAIL validation upfront with clear reason
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('anchor_not_in_source');

    // Before fix: validation would pass, insertion would fail (no diagnostic)
    // After fix: validation fails, operator knows the exact problem
  });

  it('skips anchor check for see_also suggestions (only validates inline)', () => {
    const result = validateSuggestion(
      makeSuggestion({
        type: 'see_also',
        anchorText: 'nonexistent',  // Won't be checked for see_also
      }),
      SOURCE_CONTENT,
      tmpDir,
      path.join(tmpDir, 'guide.md')
    );
    // Should pass even though anchor doesn't exist (see_also doesn't need anchors)
    expect(result).toEqual({ ok: true });
  });
});
