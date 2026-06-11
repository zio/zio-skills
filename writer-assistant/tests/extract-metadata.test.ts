import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseFrontmatter } from '../lib/markdown-parser.js';
import { hasCompleteMetadata } from '../lib/metadata-extractor-utils.js';

/**
 * Integration tests for extract-metadata workflow.
 *
 * These tests verify that the workflow components work together:
 * - Directory creation and navigation
 * - Markdown file parsing
 * - Metadata detection
 */

describe('extract-metadata workflow integration', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crossref-test-'));
  });

  afterEach(() => {
    // Clean up test directory recursively
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('directory structure', () => {
    it('creates test directory successfully', () => {
      expect(fs.existsSync(testDir)).toBe(true);
      const stats = fs.statSync(testDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('creates nested directory structure', () => {
      const nestedPath = path.join(testDir, 'docs', 'guides');
      fs.mkdirSync(nestedPath, { recursive: true });

      expect(fs.existsSync(testDir)).toBe(true);
      expect(fs.existsSync(path.join(testDir, 'docs'))).toBe(true);
      expect(fs.existsSync(nestedPath)).toBe(true);
    });

    it('cleans up directory after test', () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'test content');

      expect(fs.existsSync(testFile)).toBe(true);

      // Simulate cleanup by removing
      fs.rmSync(testDir, { recursive: true, force: true });
      expect(fs.existsSync(testDir)).toBe(false);
    });
  });

  describe('markdown file parsing', () => {
    it('reads and parses markdown file with frontmatter', () => {
      const mdFile = path.join(testDir, 'test.md');
      const content = `---
title: Test Page
description: A test page description
keywords:
  - test
  - markdown
  - parsing
---

# Test Page

This is test content.`;

      fs.writeFileSync(mdFile, content, 'utf-8');

      const readContent = fs.readFileSync(mdFile, 'utf-8');
      const fm = parseFrontmatter(readContent);

      expect(fm.title).toBe('Test Page');
      expect(fm.description).toBe('A test page description');
      expect(Array.isArray(fm.keywords)).toBe(true);
      expect(fm.keywords).toHaveLength(3);
    });

    it('parses markdown file without frontmatter', () => {
      const mdFile = path.join(testDir, 'test.md');
      const content = `# Test Page

This is test content without frontmatter.`;

      fs.writeFileSync(mdFile, content, 'utf-8');

      const readContent = fs.readFileSync(mdFile, 'utf-8');
      const fm = parseFrontmatter(readContent);

      expect(fm).toEqual({});
    });

    it('reads MDX files', () => {
      const mdxFile = path.join(testDir, 'test.mdx');
      const content = `---
title: React Component
---

# Test Component

<Component prop="value" />`;

      fs.writeFileSync(mdxFile, content, 'utf-8');

      const readContent = fs.readFileSync(mdxFile, 'utf-8');
      expect(readContent).toContain('<Component prop="value" />');
      expect(readContent).toContain('title: React Component');
    });

    it('handles files with special characters in content', () => {
      const mdFile = path.join(testDir, 'special.md');
      const content = `---
title: Special Characters
---

# Content with émojis 🚀

Special chars: \`<>&"'\` and more.`;

      fs.writeFileSync(mdFile, content, 'utf-8');

      const readContent = fs.readFileSync(mdFile, 'utf-8');
      expect(readContent).toContain('émojis 🚀');
      expect(readContent).toContain('<>&"\'');
    });

    it('preserves file content when reading multiple times', () => {
      const mdFile = path.join(testDir, 'test.md');
      const content = `---
title: Test
---

Original content.`;

      fs.writeFileSync(mdFile, content, 'utf-8');

      const read1 = fs.readFileSync(mdFile, 'utf-8');
      const read2 = fs.readFileSync(mdFile, 'utf-8');

      expect(read1).toBe(read2);
      expect(read1).toBe(content);
    });
  });

  describe('metadata detection', () => {
    it('detects complete metadata when present', () => {
      const metadata = {
        description: 'This is a description.',
        keywords: ['keyword1', 'keyword2', 'keyword3'],
      };

      const isComplete = hasCompleteMetadata(metadata);
      expect(isComplete).toBe(true);
    });

    it('identifies missing metadata when description is absent', () => {
      const metadata = {
        keywords: ['keyword1', 'keyword2', 'keyword3'],
      };

      const isComplete = hasCompleteMetadata(metadata);
      expect(isComplete).toBe(false);
    });

    it('identifies missing metadata when keywords are absent', () => {
      const metadata = {
        description: 'This is a description.',
      };

      const isComplete = hasCompleteMetadata(metadata);
      expect(isComplete).toBe(false);
    });

    it('identifies missing metadata when keywords array is empty', () => {
      const metadata = {
        description: 'This is a description.',
        keywords: [],
      };

      const isComplete = hasCompleteMetadata(metadata);
      expect(isComplete).toBe(false);
    });

    it('identifies metadata from parsed frontmatter', () => {
      const mdFile = path.join(testDir, 'complete.md');
      const content = `---
title: Complete Page
description: A comprehensive description
keywords:
  - zio
  - effects
  - functional
---

Content here.`;

      fs.writeFileSync(mdFile, content, 'utf-8');

      const readContent = fs.readFileSync(mdFile, 'utf-8');
      const fm = parseFrontmatter(readContent);

      const isComplete = hasCompleteMetadata(fm);
      expect(isComplete).toBe(true);
    });

    it('identifies incomplete metadata from partial frontmatter', () => {
      const mdFile = path.join(testDir, 'partial.md');
      const content = `---
title: Partial Page
description: A description
---

Content without keywords.`;

      fs.writeFileSync(mdFile, content, 'utf-8');

      const readContent = fs.readFileSync(mdFile, 'utf-8');
      const fm = parseFrontmatter(readContent);

      const isComplete = hasCompleteMetadata(fm);
      expect(isComplete).toBe(false);
    });

    it('processes multiple files and identifies metadata status for each', () => {
      // File 1: Complete metadata
      const file1 = path.join(testDir, 'complete.md');
      fs.writeFileSync(
        file1,
        `---
title: Complete
description: A description
keywords:
  - a
  - b
  - c
---
Content.`
      );

      // File 2: Missing keywords
      const file2 = path.join(testDir, 'incomplete.md');
      fs.writeFileSync(
        file2,
        `---
title: Incomplete
description: A description
---
Content.`
      );

      // File 3: No frontmatter
      const file3 = path.join(testDir, 'plain.md');
      fs.writeFileSync(file3, '# Plain\n\nNo metadata.');

      // Check each file
      const fm1 = parseFrontmatter(fs.readFileSync(file1, 'utf-8'));
      const fm2 = parseFrontmatter(fs.readFileSync(file2, 'utf-8'));
      const fm3 = parseFrontmatter(fs.readFileSync(file3, 'utf-8'));

      expect(hasCompleteMetadata(fm1)).toBe(true);
      expect(hasCompleteMetadata(fm2)).toBe(false);
      expect(hasCompleteMetadata(fm3)).toBe(false);
    });

    it('handles empty description correctly', () => {
      const metadata = {
        description: '',
        keywords: ['keyword1', 'keyword2', 'keyword3'],
      };

      const isComplete = hasCompleteMetadata(metadata);
      expect(isComplete).toBe(false);
    });

    it('handles whitespace-only description correctly', () => {
      const metadata = {
        description: '   ',
        keywords: ['keyword1', 'keyword2', 'keyword3'],
      };

      const isComplete = hasCompleteMetadata(metadata);
      expect(isComplete).toBe(false);
    });

    it('detects metadata with single keyword', () => {
      const metadata = {
        description: 'This is a description.',
        keywords: ['keyword1'],
      };

      const isComplete = hasCompleteMetadata(metadata);
      expect(isComplete).toBe(true);
    });

    it('handles metadata with extra fields', () => {
      const metadata = {
        title: 'A Title',
        description: 'This is a description.',
        keywords: ['keyword1', 'keyword2', 'keyword3'],
        sectionType: 'guide',
        extraField: 'extra value',
      };

      const isComplete = hasCompleteMetadata(metadata);
      expect(isComplete).toBe(true);
    });
  });

  describe('workflow integration', () => {
    it('reads file, parses metadata, and determines extraction need', () => {
      const mdFile = path.join(testDir, 'workflow.md');
      const content = `---
title: Workflow Test
description: Test description
---

Content without keywords.`;

      fs.writeFileSync(mdFile, content, 'utf-8');

      // Step 1: Read file
      const fileContent = fs.readFileSync(mdFile, 'utf-8');
      expect(fileContent).toBeDefined();

      // Step 2: Parse metadata
      const fm = parseFrontmatter(fileContent);
      expect(fm.title).toBe('Workflow Test');
      expect(fm.description).toBe('Test description');

      // Step 3: Check if extraction needed
      const needsExtraction = !hasCompleteMetadata(fm);
      expect(needsExtraction).toBe(true);
    });

    it('identifies files that already have complete metadata', () => {
      const mdFile = path.join(testDir, 'complete-workflow.md');
      const content = `---
title: Complete Workflow
description: A complete description
keywords:
  - keyword1
  - keyword2
  - keyword3
---

Content here.`;

      fs.writeFileSync(mdFile, content, 'utf-8');

      // Step 1: Read file
      const fileContent = fs.readFileSync(mdFile, 'utf-8');

      // Step 2: Parse metadata
      const fm = parseFrontmatter(fileContent);

      // Step 3: Check if extraction needed
      const needsExtraction = !hasCompleteMetadata(fm);
      expect(needsExtraction).toBe(false);
    });

    it('processes directory with mixed metadata status', () => {
      // Create files with different metadata statuses
      const files = [
        {
          name: 'complete.md',
          content: `---
title: Complete
description: Description
keywords:
  - a
  - b
  - c
---
Content.`,
          expectedNeedsExtraction: false,
        },
        {
          name: 'incomplete.md',
          content: `---
title: Incomplete
description: Description
---
Content.`,
          expectedNeedsExtraction: true,
        },
        {
          name: 'plain.md',
          content: '# Plain\n\nNo metadata.',
          expectedNeedsExtraction: true,
        },
      ];

      const results: { file: string; needsExtraction: boolean }[] = [];

      for (const file of files) {
        const filePath = path.join(testDir, file.name);
        fs.writeFileSync(filePath, file.content);

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const fm = parseFrontmatter(fileContent);
        const needsExtraction = !hasCompleteMetadata(fm);

        results.push({ file: file.name, needsExtraction });
      }

      expect(results).toHaveLength(3);
      expect(results[0].needsExtraction).toBe(false); // complete.md
      expect(results[1].needsExtraction).toBe(true);  // incomplete.md
      expect(results[2].needsExtraction).toBe(true);  // plain.md
    });
  });
});
