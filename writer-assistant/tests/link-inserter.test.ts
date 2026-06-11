import { describe, it, expect } from 'vitest';
import { insertInlineLink, insertSeeAlsoEntry } from '../workflows/utils/link-inserter.js';
import { computeSafeZones } from '../lib/markdown-parser.js';

const PLAIN_DOC = `---
title: Configuration
---

The ZIO Runtime manages execution. You can configure it using layers.
Use the getting started guide for setup.
`;

const DOC_WITH_SEE_ALSO = `---
title: Fiber
---

Fibers are lightweight. They run concurrently.

## See Also

- [ZIO](../core/zio.md)
`;

const CODE_DOC = `---
title: Streams
---

ZIO Streams provide reactive data processing.

\`\`\`scala
val stream = ZStream.fromIterable(List(1, 2, 3))
\`\`\`

Use streams for large data.
`;

describe('insertInlineLink', () => {
  it('wraps a matching phrase with a link', () => {
    const zones = computeSafeZones(PLAIN_DOC);
    const { result, inserted } = insertInlineLink(
      PLAIN_DOC, 'getting started guide', '../overview/getting-started.md', zones
    );
    expect(inserted).toBe(true);
    expect(result).toContain('[getting started guide](../overview/getting-started.md)');
    // Verify phrase is not left unwrapped elsewhere (only appears in the link)
    const withoutLink = result.replace('[getting started guide](../overview/getting-started.md)', '');
    expect(withoutLink).not.toContain('getting started guide');
  });

  it('returns inserted=false when phrase not found in safe zone', () => {
    const zones = computeSafeZones(PLAIN_DOC);
    const { inserted } = insertInlineLink(
      PLAIN_DOC, 'nonexistent phrase xyz', '../foo.md', zones
    );
    expect(inserted).toBe(false);
  });

  it('does not modify content inside a code fence', () => {
    const zones = computeSafeZones(CODE_DOC);
    const { result } = insertInlineLink(
      CODE_DOC, 'ZStream.fromIterable', '../streams.md', zones
    );
    // The match is inside the fence, should not be modified
    expect(result).not.toContain('[ZStream.fromIterable](');
  });

  it('does not duplicate an existing link', () => {
    const docWithLink = PLAIN_DOC.replace(
      'getting started guide',
      '[getting started guide](../overview/getting-started.md)'
    );
    const zones = computeSafeZones(docWithLink);
    const { inserted } = insertInlineLink(
      docWithLink, 'getting started guide', '../overview/getting-started.md', zones
    );
    expect(inserted).toBe(false);
  });

  it('handles case-insensitive phrase matching with case-insensitive search', () => {
    const docWithMixedCase = `---
title: Runtime
---

The ZIO runtime manages execution. The RUNTIME is configurable.
`;
    const zones = computeSafeZones(docWithMixedCase);
    const { result, inserted } = insertInlineLink(
      docWithMixedCase, 'ZIO runtime', '../core/runtime.md', zones
    );
    expect(inserted).toBe(true);
    // Should wrap the first occurrence (lowercase)
    expect(result).toContain('[ZIO runtime](../core/runtime.md)');
  });

  it('allows linking text immediately after code fence (boundary case)', () => {
    const docWithFenceAndText = `---
title: Streams
---

\`\`\`scala
val stream = ZStream.fromIterable(List(1, 2, 3))
\`\`\`
Streams are powerful for data processing.
`;
    const zones = computeSafeZones(docWithFenceAndText);
    const { result, inserted } = insertInlineLink(
      docWithFenceAndText, 'Streams', '../streams.md', zones
    );
    expect(inserted).toBe(true);
    // "Streams" at start of line after fence should be linkable
    expect(result).toContain('[Streams](../streams.md)');
  });

  it('does not insert link in the middle of a word (word boundary enforcement)', () => {
    const docWithEmbeddedWord = `---
title: Promise
---

Promise is useful, so be careful when using completeWith.
`;
    const zones = computeSafeZones(docWithEmbeddedWord);
    const { result, inserted } = insertInlineLink(
      docWithEmbeddedWord, 'Ref', '../concurrency/ref.md', zones
    );
    // "Ref" is inside "careful", should NOT be linked
    expect(inserted).toBe(false);
    expect(result).not.toContain('[Ref]');
    expect(result).toContain('be careful');
  });

  it('inserts link only when text is a complete word or phrase', () => {
    const docWithCompleteWord = `---
title: Documentation
---

Ref is a concurrency primitive. Use Ref for shared state.
`;
    const zones = computeSafeZones(docWithCompleteWord);
    const { result, inserted } = insertInlineLink(
      docWithCompleteWord, 'Ref', '../concurrency/ref.md', zones
    );
    // Standalone "Ref" should be linkable
    expect(inserted).toBe(true);
    expect(result).toContain('[Ref](../concurrency/ref.md)');
  });

  it('links inline code (backtick-wrapped text) as [`text`](url)', () => {
    const docWithInlineCode = `---
title: State Management
---

The \`FiberRef\` is a concurrency primitive.
Store values in \`FiberRef\` for thread-local storage.
`;
    const zones = computeSafeZones(docWithInlineCode);
    const { result, inserted } = insertInlineLink(
      docWithInlineCode, 'FiberRef', '../state-management/fiberref.md', zones
    );
    expect(inserted).toBe(true);
    // Should format as [`FiberRef`](url), not [FiberRef](url)
    expect(result).toContain('[`FiberRef`](../state-management/fiberref.md)');
    expect(result).not.toContain('[FiberRef]');
  });

  it('treats backticks as word boundaries', () => {
    const docWithBackticks = `---
title: Layer
---

Use \`ZLayer\` to compose dependencies.
The \`ZLayer\` constructor provides type safety.
`;
    const zones = computeSafeZones(docWithBackticks);
    const { result, inserted } = insertInlineLink(
      docWithBackticks, 'ZLayer', '../contextual/zlayer.md', zones
    );
    expect(inserted).toBe(true);
    expect(result).toContain('[`ZLayer`](../contextual/zlayer.md)');
  });

  it('does not insert into code blocks, but allows inline code', () => {
    const mixedDoc = `---
title: Example
---

You can use \`FiberRef\` for state.

\`\`\`scala
val ref = FiberRef.make[String]("default")
\`\`\`

The \`FiberRef\` is powerful.
`;
    const zones = computeSafeZones(mixedDoc);
    const { result, inserted } = insertInlineLink(
      mixedDoc, 'FiberRef', '../state-management/fiberref.md', zones
    );
    expect(inserted).toBe(true);
    // Should link the first inline code occurrence, not the one inside the code block
    expect(result).toContain('[`FiberRef`](../state-management/fiberref.md)');
    // Code block content should remain unchanged
    expect(result).toContain('val ref = FiberRef.make[String]("default")');
    // Verify the linked text is not inside the code block
    const beforeCodeFence = result.split('```')[0];
    expect(beforeCodeFence).toContain('[`FiberRef`](../state-management/fiberref.md)');
  });
});

describe('insertSeeAlsoEntry', () => {
  it('appends bullet to existing See Also section', () => {
    const zones = computeSafeZones(DOC_WITH_SEE_ALSO);
    const { result, inserted } = insertSeeAlsoEntry(
      DOC_WITH_SEE_ALSO, 'fiber reference', '../core/fiber.md', 'A reference for fiber operations', zones
    );
    expect(inserted).toBe(true);
    expect(result).toContain('- [fiber reference](../core/fiber.md)');
    expect(result).toContain('- [ZIO](../core/zio.md)');
  });

  it('creates See Also section when absent', () => {
    const zones = computeSafeZones(PLAIN_DOC);
    const { result, inserted } = insertSeeAlsoEntry(
      PLAIN_DOC, 'fiber basics', '../core/fiber.md', 'Basic concepts for working with fibers', zones
    );
    expect(inserted).toBe(true);
    expect(result).toContain('## See Also');
    expect(result).toContain('- [fiber basics](../core/fiber.md)');
  });

  it('does not add duplicate entry', () => {
    const zones = computeSafeZones(DOC_WITH_SEE_ALSO);
    const { inserted } = insertSeeAlsoEntry(
      DOC_WITH_SEE_ALSO, 'ZIO', '../core/zio.md', 'Core ZIO reference', zones
    );
    expect(inserted).toBe(false);
  });

  it('appends bullets in order (new items after existing ones)', () => {
    const zones = computeSafeZones(DOC_WITH_SEE_ALSO);
    const { result: result1 } = insertSeeAlsoEntry(
      DOC_WITH_SEE_ALSO, 'fiber reference', '../core/fiber.md', 'Reference for fiber operations', zones
    );
    // Verify both bullets exist and fiber comes after ZIO
    expect(result1).toContain('- [ZIO](../core/zio.md)');
    expect(result1).toContain('- [fiber reference](../core/fiber.md)');
    const zioIdx = result1.indexOf('- [ZIO]');
    const fiberIdx = result1.indexOf('- [fiber reference]');
    expect(fiberIdx).toBeGreaterThan(zioIdx);

    // Now add another entry and verify order
    const zones2 = computeSafeZones(result1);
    const { result: result2 } = insertSeeAlsoEntry(
      result1, 'runtime', '../core/runtime.md', 'ZIO runtime for execution', zones2
    );
    expect(result2).toContain('- [ZIO](../core/zio.md)');
    expect(result2).toContain('- [fiber reference](../core/fiber.md)');
    expect(result2).toContain('- [runtime](../core/runtime.md)');
    const runtimeIdx = result2.indexOf('- [runtime]');
    expect(runtimeIdx).toBeGreaterThan(fiberIdx);
  });

  it('handles multiple See Also sections (appends to first one)', () => {
    const docWithTwoSections = `---
title: Complex
---

Some content.

## See Also

- [Link A](../a.md)

Other content.

## See Also

- [Link B](../b.md)
`;
    const zones = computeSafeZones(docWithTwoSections);
    const { result } = insertSeeAlsoEntry(
      docWithTwoSections, 'new link', '../new.md', 'A new related link', zones
    );
    // Should append to the first See Also section
    const firstSectionEnd = docWithTwoSections.indexOf('\n\nOther content');
    const firstSectionText = result.substring(0, firstSectionEnd + 50);
    expect(firstSectionText).toContain('- [new link](../new.md)');
  });

  it('maintains blank line before next section heading (Issue #5 fix)', () => {
    // Test the spacing fix directly: when next heading exists, ensure blank line before it
    // Use computeSafeZones with empty result (no headers to protect for this test)
    const seeAlsoWithNextHeading = `## See Also

- [ZIO](../core/zio.md)
## Error Handling

How to handle errors.`;

    // No safe zones in this minimal doc (testing the line reconstruction)
    const zones: any[] = [];

    const { result, inserted } = insertSeeAlsoEntry(
      seeAlsoWithNextHeading,
      'Runtime',
      '../core/runtime.md',
      'Manages ZIO execution',
      zones
    );

    // The new entry should be appended
    expect(inserted).toBe(true);
    expect(result).toContain('- [Runtime](../core/runtime.md) —');

    // CRITICAL FIX TEST: Must have blank line (two newlines) between new bullet and next heading
    // Before fix: "- [Runtime](...)\n## Error Handling" (one newline - malformed)
    // After fix:  "- [Runtime](...)\n\n## Error Handling" (two newlines - correct)
    expect(result).toMatch(/- \[Runtime\]\([^)]+\) — [^\n]+\n\n## Error Handling/);

    // Verify it's NOT the broken version (single newline)
    const brokenPattern = result.match(/- \[Runtime\]\([^)]+\) — [^\n]+\n## Error Handling/);
    expect(brokenPattern).toBeNull();
  });
});
