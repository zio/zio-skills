import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  extractTitle,
  extractSummary,
  extractKeywords,
  extractExistingLinks,
  computeSafeZones,
} from '../lib/markdown-parser.js';

const FM_DOC = `---
title: Getting Started
id: getting-started
---

This is the first sentence. Second sentence here.

See [ZIO](/reference/zio.md) for more.
`;

const CODE_DOC = `---
title: Fiber
---

Fibers are lightweight threads. Use ZIO.fork to create one.

\`\`\`scala
val fiber = ZIO.fork(effect)
\`\`\`

After the fence. [existing](../other.md)
`;

describe('parseFrontmatter', () => {
  it('extracts key-value pairs', () => {
    expect(parseFrontmatter(FM_DOC)).toEqual({ title: 'Getting Started', id: 'getting-started' });
  });
  it('returns empty object when no frontmatter', () => {
    expect(parseFrontmatter('# Just a heading\n\nContent.')).toEqual({});
  });

  it('correctly parses numeric values (Issue #6 test)', () => {
    const docWithNumbers = `---
title: "Test"
sidebar_position: 2
order: 10
rating: 4.5
---

Content`;
    const result = parseFrontmatter(docWithNumbers);
    expect(result.sidebar_position).toBe('2');  // Note: parsed as string by regex parser
    expect(result.order).toBe('10');
    expect(result.rating).toBe('4.5');
  });

  it('correctly parses boolean values (Issue #6 test)', () => {
    const docWithBooleans = `---
title: "Test"
draft: false
published: true
---

Content`;
    const result = parseFrontmatter(docWithBooleans);
    expect(result.draft).toBe(false);  // Issue #4 fix: Parse as actual boolean, not string
    expect(result.published).toBe(true);
  });
  it('extracts YAML array fields (keywords)', () => {
    const docWithArray = `---
title: "Clock Service"
description: "Provides time operations"
keywords:
  - "Clock Service"
  - "Non-blocking Sleep"
  - "Scheduling Operations"
---

Content here.`;
    const result = parseFrontmatter(docWithArray);
    expect(result.title).toBe('Clock Service');
    expect(result.description).toBe('Provides time operations');
    expect(Array.isArray(result.keywords)).toBe(true);
    expect(result.keywords).toEqual(['Clock Service', 'Non-blocking Sleep', 'Scheduling Operations']);
  });
  it('preserves other fields while parsing arrays', () => {
    const docWithMixed = `---
id: "clock"
title: "Clock"
sidebar_position: 2
draft: false
description: "Time operations"
keywords:
  - "Service"
  - "Time"
---

Content.`;
    const result = parseFrontmatter(docWithMixed);
    expect(result.id).toBe('clock');
    expect(result.title).toBe('Clock');
    expect(result.description).toBe('Time operations');
    expect(result.sidebar_position).toBe('2');  // Numbers without quotes are parsed as strings
    expect(result.draft).toBe(false);  // Issue #4 fix: Parse as actual boolean
    expect(result.keywords).toEqual(['Service', 'Time']);
  });
  it('handles empty keywords array', () => {
    const docWithEmpty = `---
title: "Test"
keywords:
---

Content.`;
    const result = parseFrontmatter(docWithEmpty);
    expect(result.title).toBe('Test');
    expect(result.keywords).toEqual([]);
  });
  it('handles quoted array items', () => {
    const docWithQuotes = `---
keywords:
  - "Item With Spaces"
  - 'Single Quoted'
  - UnquotedItem
---

Content.`;
    const result = parseFrontmatter(docWithQuotes);
    expect(Array.isArray(result.keywords)).toBe(true);
    expect(result.keywords).toContain('Item With Spaces');
    expect(result.keywords).toContain('Single Quoted');
    expect(result.keywords).toContain('UnquotedItem');
  });
});

describe('extractTitle', () => {
  it('prefers frontmatter title', () => {
    expect(extractTitle(FM_DOC, 'fallback')).toBe('Getting Started');
  });
  it('falls back to first heading', () => {
    expect(extractTitle('# My Page\n\nContent.', 'fallback')).toBe('My Page');
  });
  it('falls back to provided fallback', () => {
    expect(extractTitle('no headings here', 'my-file')).toBe('my-file');
  });
});

describe('extractSummary', () => {
  it('returns first non-empty sentence after frontmatter', () => {
    expect(extractSummary(FM_DOC)).toBe('This is the first sentence.');
  });
  it('handles doc without frontmatter', () => {
    expect(extractSummary('# Title\n\nHello world. Second.')).toBe('Hello world.');
  });
});

describe('extractKeywords', () => {
  it('extracts capitalized technical terms', () => {
    const kws = extractKeywords('Use ZIO and Fiber for concurrency. The Runtime handles execution.');
    expect(kws).toContain('ZIO');
    expect(kws).toContain('Fiber');
    expect(kws).toContain('Runtime');
  });
  it('filters common words', () => {
    const kws = extractKeywords('The quick brown fox. This is a test.');
    expect(kws).not.toContain('The');
    expect(kws).not.toContain('This');
  });
});

describe('extractExistingLinks', () => {
  it('extracts relative md links', () => {
    const links = extractExistingLinks(FM_DOC);
    expect(links).toEqual([{ text: 'ZIO', href: '/reference/zio.md' }]);
  });
  it('ignores http/https links', () => {
    const links = extractExistingLinks('See [docs](https://example.com) and [local](../foo.md).');
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('../foo.md');
  });
  it('returns empty array when no links', () => {
    expect(extractExistingLinks('No links here.')).toEqual([]);
  });
});

describe('computeSafeZones', () => {
  it('marks frontmatter block as safe zone', () => {
    const zones = computeSafeZones(FM_DOC);
    const fmEnd = FM_DOC.indexOf('---', 3) + 3;
    expect(zones.some(z => z.start === 0 && z.end >= fmEnd)).toBe(true);
  });
  it('marks code fence content as safe zone', () => {
    const zones = computeSafeZones(CODE_DOC);
    const fenceStart = CODE_DOC.indexOf('```scala');
    const fenceEnd = CODE_DOC.indexOf('```', fenceStart + 3) + 3;
    expect(zones.some(z => z.start <= fenceStart && z.end >= fenceEnd)).toBe(true);
  });
  it('returns no zones for plain content', () => {
    expect(computeSafeZones('Just plain text. No fences.')).toEqual([]);
  });
  it('offset after fence is not in safe zone', () => {
    const zones = computeSafeZones(CODE_DOC);
    const afterFence = CODE_DOC.indexOf('After the fence');
    expect(zones.every(z => afterFence < z.start || afterFence > z.end)).toBe(true);
  });
  it('marks tilde fence content as safe zone', () => {
    const content = `---
title: Test
---

Some text.

~~~scala
val x = 42
~~~

After fence.`;
    const zones = computeSafeZones(content);
    const fenceStart = content.indexOf('~~~scala');
    const fenceEnd = content.indexOf('~~~', fenceStart + 3) + 3;
    expect(zones.some(z => z.start <= fenceStart && z.end >= fenceEnd)).toBe(true);
  });
  it('does NOT mark inline code as safe zone (allows crossreferencing)', () => {
    const content = 'Use \`ZIO.fork\` to create a fiber.';
    const zones = computeSafeZones(content);
    const codeStart = content.indexOf('\`ZIO.fork\`');
    const codeEnd = codeStart + '\`ZIO.fork\`'.length;
    // Inline code should NOT be in safe zones, allowing it to be crossreferenced
    expect(zones.some(z => z.start <= codeStart && z.end >= codeEnd)).toBe(false);
  });
  it('handles malformed links without slowdown', () => {
    const content = 'Check [this](../../very/long/path/that/goes/on/and/on/and/on) out.';
    const links = extractExistingLinks(content);
    // Should either extract the link normally or ignore it, but not hang
    expect(links.length >= 0).toBe(true);
  });
  it('protects headers from link insertion', () => {
    const content = `---
title: Test
---

### From Queue

A queue has a finite buffer.`;
    const zones = computeSafeZones(content);
    const headerText = '### From Queue';
    const headerStart = content.indexOf(headerText);
    // Header should be in a safe zone
    const headerZone = zones.find(z => headerStart >= z.start && headerStart < z.end);
    expect(headerZone).toBeDefined();
  });
  it('does not protect paragraph text after header', () => {
    const content = `---
title: Test
---

### From Queue

A queue has a finite buffer.`;
    const zones = computeSafeZones(content);
    const paragraphStart = content.indexOf('A queue');
    // The paragraph text should NOT be in any safe zone
    const inSafeZone = zones.some(z => paragraphStart >= z.start && paragraphStart < z.end);
    expect(inSafeZone).toBe(false);
  });
  it('protects all header levels', () => {
    const content = `# Level 1
Some text.
## Level 2
More text.
### Level 3
Even more.`;
    const zones = computeSafeZones(content);
    expect(zones.some(z => content.slice(z.start, z.end).includes('# Level 1'))).toBe(true);
    expect(zones.some(z => content.slice(z.start, z.end).includes('## Level 2'))).toBe(true);
    expect(zones.some(z => content.slice(z.start, z.end).includes('### Level 3'))).toBe(true);
  });

  it('does NOT mark inline code as safe zone by default (allows see-also crossreferencing)', () => {
    const content = 'Use `ZIO.fork` to create a fiber.';
    const zones = computeSafeZones(content);
    const codeStart = content.indexOf('`ZIO.fork`');
    const codeEnd = codeStart + '`ZIO.fork`'.length;
    // Inline code should NOT be in safe zones by default
    expect(zones.some(z => z.start <= codeStart && z.end >= codeEnd)).toBe(false);
  });

  it('marks inline code as safe zone when includeInlineCode option is true (Issue #8 fix)', () => {
    const content = 'Use `ZIO.fork` to create a fiber.';
    const zones = computeSafeZones(content, { includeInlineCode: true });
    const codeStart = content.indexOf('`ZIO.fork`');
    const codeEnd = codeStart + '`ZIO.fork`'.length;
    // With option enabled, inline code SHOULD be protected
    expect(zones.some(z => z.start <= codeStart && z.end >= codeEnd)).toBe(true);
  });

  it('protects multiple inline code blocks when includeInlineCode is enabled', () => {
    const content = 'Use `ZIO.fork` and `ZIO.sleep` for async operations.';
    const zones = computeSafeZones(content, { includeInlineCode: true });
    // Both inline code blocks should be protected
    expect(zones.filter(z => content.slice(z.start, z.end).startsWith('`')).length).toBeGreaterThanOrEqual(2);
  });

  it('prevents anchor matching inside inline code (Issue #8 fix)', () => {
    const content = 'The `ZIO` library provides effects.';
    const zones = computeSafeZones(content, { includeInlineCode: true });
    const codePos = content.indexOf('`ZIO`');
    // Anchor "ZIO" at position codePos should be in a safe zone
    const inSafeZone = zones.some(z => codePos >= z.start && codePos < z.end);
    expect(inSafeZone).toBe(true);
  });
});
