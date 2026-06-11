import { describe, it, expect } from 'vitest';
import {
  validateMetadata,
  hasCompleteMetadata,
  extractPageTitle,
} from '../lib/metadata-extractor-utils.js';

describe('extractPageTitle', () => {
  it('returns existing title if provided', () => {
    const content = '# Content Title\n\nSome content here.';
    const result = extractPageTitle(content, 'Existing Title');
    expect(result).toBe('Existing Title');
  });

  it('returns trimmed existing title if provided with whitespace', () => {
    const content = '# Content Title\n\nSome content here.';
    const result = extractPageTitle(content, '  Existing Title  ');
    expect(result).toBe('Existing Title');
  });

  it('extracts title from H1 when no existing title provided', () => {
    const content = '# My Page Title\n\nSome content here.';
    const result = extractPageTitle(content);
    expect(result).toBe('My Page Title');
  });

  it('extracts and trims H1 title with extra whitespace', () => {
    const content = '#   My Page Title   \n\nSome content here.';
    const result = extractPageTitle(content);
    expect(result).toBe('My Page Title');
  });

  it('extracts title from YAML frontmatter when no H1', () => {
    const content = `---
title: "Frontmatter Title"
---

Content without heading.`;
    const result = extractPageTitle(content);
    expect(result).toBe('Frontmatter Title');
  });

  it('extracts title from YAML frontmatter without quotes', () => {
    const content = `---
title: Frontmatter Title
---

Content without heading.`;
    const result = extractPageTitle(content);
    expect(result).toBe('Frontmatter Title');
  });

  it('prefers H1 over YAML frontmatter title', () => {
    const content = `---
title: "Frontmatter Title"
---

# H1 Title

Content here.`;
    const result = extractPageTitle(content);
    expect(result).toBe('H1 Title');
  });

  it('returns "Untitled" when no title found', () => {
    const content = 'Content without any heading or frontmatter.';
    const result = extractPageTitle(content);
    expect(result).toBe('Untitled');
  });

  it('falls back to H1 when title is empty string', () => {
    const content = '# Content Title\n\nSome content here.';
    const result = extractPageTitle(content, '');
    expect(result).toBe('Content Title');
  });

  it('falls back to H1 when title is only whitespace', () => {
    const content = '# Content Title\n\nSome content here.';
    const result = extractPageTitle(content, '   ');
    expect(result).toBe('Content Title');
  });

  it('handles multiple H1s and returns the first one', () => {
    const content = '# First Title\n\nContent.\n\n# Second Title\n\nMore content.';
    const result = extractPageTitle(content);
    expect(result).toBe('First Title');
  });
});

describe('validateMetadata', () => {
  const validMetadata = {
    description: 'This is a comprehensive guide to ZIO effects.',
    keywords: ['ZIO', 'Effects', 'Functional Programming'],
    sectionType: 'guide' as const,
  };

  it('accepts valid metadata', () => {
    const result = validateMetadata(validMetadata);
    expect(result.valid).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('accepts metadata with more keywords', () => {
    const metadata = {
      ...validMetadata,
      keywords: ['ZIO', 'Effects', 'Functional Programming', 'Concurrency', 'Async'],
    };
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(true);
    expect(result.data?.keywords).toHaveLength(5);
  });

  it('rejects metadata with missing description', () => {
    const metadata = {
      ...validMetadata,
      description: undefined,
    };
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
  });

  it('rejects metadata with empty description', () => {
    const metadata = {
      ...validMetadata,
      description: '',
    };
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('non-empty');
  });

  it('rejects metadata with whitespace-only description', () => {
    const metadata = {
      ...validMetadata,
      description: '   ',
    };
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('non-empty');
  });

  it('rejects metadata with less than 3 keywords', () => {
    const metadata = {
      ...validMetadata,
      keywords: ['ZIO', 'Effects'],
    };
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 3 items');
  });

  it('rejects metadata with empty keywords array', () => {
    const metadata = {
      ...validMetadata,
      keywords: [],
    };
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 3 items');
  });

  it('rejects metadata with empty keyword string', () => {
    const metadata = {
      ...validMetadata,
      keywords: ['ZIO', '', 'Functional Programming'],
    };
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('non-empty strings');
  });

  it('rejects metadata with whitespace-only keyword', () => {
    const metadata = {
      ...validMetadata,
      keywords: ['ZIO', '   ', 'Functional Programming'],
    };
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('non-empty strings');
  });

  it('rejects metadata with keywords not as array', () => {
    const metadata = {
      ...validMetadata,
      keywords: 'not an array' as any,
    };
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects metadata with invalid sectionType', () => {
    const metadata = {
      ...validMetadata,
      sectionType: 'invalid-type' as any,
    };
    const result = validateMetadata(metadata);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('accepts metadata with all valid sectionTypes', () => {
    const sectionTypes = ['reference', 'guide', 'tutorial', 'overview', 'other'] as const;

    for (const sectionType of sectionTypes) {
      const metadata = {
        ...validMetadata,
        sectionType,
      };
      const result = validateMetadata(metadata);
      expect(result.valid).toBe(true);
      expect(result.data?.sectionType).toBe(sectionType);
    }
  });

  it('returns metadata data when valid', () => {
    const result = validateMetadata(validMetadata);
    expect(result.data).toEqual(validMetadata);
  });

  it('handles unexpected errors gracefully', () => {
    const result = validateMetadata(null);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('hasCompleteMetadata', () => {
  const completeMetadata = {
    description: 'A complete description.',
    keywords: ['Keyword1', 'Keyword2', 'Keyword3'],
  };

  it('returns true for complete metadata', () => {
    const result = hasCompleteMetadata(completeMetadata);
    expect(result).toBe(true);
  });

  it('returns true for metadata with multiple keywords', () => {
    const metadata = {
      ...completeMetadata,
      keywords: ['Keyword1', 'Keyword2', 'Keyword3', 'Keyword4'],
    };
    const result = hasCompleteMetadata(metadata);
    expect(result).toBe(true);
  });

  it('returns false when description is missing', () => {
    const metadata = {
      keywords: ['Keyword1', 'Keyword2', 'Keyword3'],
    };
    const result = hasCompleteMetadata(metadata);
    expect(result).toBe(false);
  });

  it('returns false when description is empty string', () => {
    const metadata = {
      description: '',
      keywords: ['Keyword1', 'Keyword2', 'Keyword3'],
    };
    const result = hasCompleteMetadata(metadata);
    expect(result).toBe(false);
  });

  it('returns false when description is whitespace only', () => {
    const metadata = {
      description: '   ',
      keywords: ['Keyword1', 'Keyword2', 'Keyword3'],
    };
    const result = hasCompleteMetadata(metadata);
    expect(result).toBe(false);
  });

  it('returns false when keywords is missing', () => {
    const metadata = {
      description: 'A complete description.',
    };
    const result = hasCompleteMetadata(metadata);
    expect(result).toBe(false);
  });

  it('returns false when keywords is empty array', () => {
    const metadata = {
      description: 'A complete description.',
      keywords: [],
    };
    const result = hasCompleteMetadata(metadata);
    expect(result).toBe(false);
  });

  it('returns false when keywords is not an array', () => {
    const metadata = {
      description: 'A complete description.',
      keywords: 'not an array' as any,
    };
    const result = hasCompleteMetadata(metadata);
    expect(result).toBe(false);
  });

  it('returns false when keywords is null', () => {
    const metadata = {
      description: 'A complete description.',
      keywords: null as any,
    };
    const result = hasCompleteMetadata(metadata);
    expect(result).toBe(false);
  });

  it('returns false when both description and keywords missing', () => {
    const result = hasCompleteMetadata({});
    expect(result).toBe(false);
  });

  it('returns true with single keyword (array check)', () => {
    const metadata = {
      description: 'A complete description.',
      keywords: ['OnlyKeyword'],
    };
    const result = hasCompleteMetadata(metadata);
    expect(result).toBe(true);
  });
});
