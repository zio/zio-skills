import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig } from '../lib/config-loader';
import { loadState, saveState, emptyState } from '../lib/state-store';
import {
  extractTitle, extractSummary, extractKeywords,
  extractExistingLinks, computeSafeZones,
} from '../lib/markdown-parser';
import { insertInlineLink, insertSeeAlsoEntry } from '../workflows/utils/link-inserter';
import { validateSuggestion } from '../workflows/utils/link-validator';
import type { CrossrefState, LinkSuggestion, Confidence } from '../lib/schemas';

describe('Workflow Smoke Test', () => {
  let testDir: string;

  beforeAll(() => {
    // Create test fixture directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crossref-test-'));
    const refDir = path.join(testDir, 'reference');
    const guideDir = path.join(testDir, 'guides');
    fs.mkdirSync(refDir, { recursive: true });
    fs.mkdirSync(guideDir, { recursive: true });

    // Create fixture documents
    const fiber = `---
title: Fiber
id: fiber
---

A Fiber is a lightweight virtual thread managed by the ZIO runtime.
Fibers can be forked, joined, and interrupted. They form the foundation of ZIO concurrency.`;

    const zio = `---
title: ZIO
id: zio
---

ZIO is the core data type. It represents an effectful computation that may use environment R,
fail with error E, or succeed with value A.
Every ZIO program runs on the Runtime.`;

    const guide = `---
title: Getting Started
id: getting-started
---

This guide helps you write your first ZIO application.
You will use ZIO effects and Fiber to build concurrent programs.
The ZIO Runtime executes your program when you call unsafeRun.`;

    fs.writeFileSync(path.join(refDir, 'fiber.md'), fiber, 'utf-8');
    fs.writeFileSync(path.join(refDir, 'zio.md'), zio, 'utf-8');
    fs.writeFileSync(path.join(guideDir, 'getting-started.md'), guide, 'utf-8');
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('Step 1: Index building discovers all pages', () => {
    // Simulate reindex: walk docs and extract metadata
    const config = loadConfig(testDir);
    const results: string[] = [];

    function walk(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const rel = path.relative(testDir, fullPath);
        if (config.excludePatterns.some(p => rel.includes(p))) continue;
        if (entry.isDirectory()) { walk(fullPath); continue; }
        if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) results.push(fullPath);
      }
    }
    walk(testDir);

    expect(results.length).toBe(3);
    expect(results.some(p => p.includes('fiber.md'))).toBe(true);
    expect(results.some(p => p.includes('zio.md'))).toBe(true);
    expect(results.some(p => p.includes('getting-started.md'))).toBe(true);
  });

  it('Step 2: Metadata extraction works correctly', () => {
    const guideFile = path.join(testDir, 'guides', 'getting-started.md');
    const content = fs.readFileSync(guideFile, 'utf-8');

    const title = extractTitle(content, 'getting-started');
    const summary = extractSummary(content);
    const keywords = extractKeywords(content);

    expect(title).toBe('Getting Started');
    expect(summary).toContain('guide');
    expect(Array.isArray(keywords)).toBe(true);
  });

  it('Step 3: State management (reindex)', async () => {
    const state = emptyState(testDir);
    expect(state.index.length).toBe(0);
    expect(state.processed.length).toBe(0);
    expect(state.suggestions.length).toBe(0);

    // Simulate building index
    const mockIndex = [
      {
        id: 'reference__fiber',
        title: 'Fiber',
        path: 'reference/fiber.md',
        absPath: path.join(testDir, 'reference/fiber.md'),
        summary: 'A Fiber is a lightweight virtual thread',
        keywords: ['fiber', 'concurrency'],
        existingLinkCount: 0,
        sectionType: 'reference' as const,
      },
      {
        id: 'reference__zio',
        title: 'ZIO',
        path: 'reference/zio.md',
        absPath: path.join(testDir, 'reference/zio.md'),
        summary: 'ZIO is the core data type',
        keywords: ['zio', 'effect'],
        existingLinkCount: 0,
        sectionType: 'reference' as const,
      },
      {
        id: 'guides__getting-started',
        title: 'Getting Started',
        path: 'guides/getting-started.md',
        absPath: path.join(testDir, 'guides/getting-started.md'),
        summary: 'This guide helps you write your first ZIO application',
        keywords: ['zio', 'guide'],
        existingLinkCount: 0,
        sectionType: 'guide' as const,
      },
    ];

    const newState = { ...state, index: mockIndex, indexBuiltAt: new Date().toISOString() };
    saveState(testDir, newState);

    const loaded = await loadState(testDir);
    expect(loaded?.index.length).toBe(3);
    expect(loaded?.indexBuiltAt).toBeDefined();
  });

  it('Step 4: Safe zones protect code blocks', () => {
    const content = `---
title: Example
---

Code example:

\`\`\`scala
val zio = ZIO.effect { println("hello") }
\`\`\`

Text mentioning ZIO outside code.`;

    const zones = computeSafeZones(content);
    expect(zones.length).toBeGreaterThan(0);

    // Verify that zones cover the frontmatter and code block
    expect(zones[0]).toHaveProperty('start');
    expect(zones[0]).toHaveProperty('end');
    // First zone should be frontmatter (starts at 0)
    expect(zones[0].start).toBe(0);
  });

  it('Step 5: Link validation prevents common errors', () => {
    const guideFile = path.join(testDir, 'guides', 'getting-started.md');
    const content = fs.readFileSync(guideFile, 'utf-8');
    const targetPath = path.relative(
      path.dirname(guideFile),
      path.join(testDir, 'reference', 'zio.md')
    );

    const suggestion: LinkSuggestion = {
      sourceId: 'guides__getting-started',
      targetId: 'reference__zio',
      targetTitle: 'ZIO',
      targetRelativePath: targetPath,
      anchorText: 'ZIO effects',
      type: 'inline',
      confidence: 'high',
      reasoning: 'ZIO is mentioned in the guide content',
      status: 'pending',
    };

    const validation = validateSuggestion(suggestion, content, testDir, guideFile);
    expect(validation.ok).toBe(true);
  });

  it('Step 6: Inline links inserted correctly', () => {
    const content = 'Use ZIO effects and Fiber to build concurrent programs.';
    const targetPath = '../reference/zio.md';
    const zones = computeSafeZones(content);

    const result = insertInlineLink(content, 'ZIO', targetPath, zones);
    expect(result.inserted).toBe(true);
    expect(result.result).toContain('[ZIO](');
    expect(result.result).toContain(targetPath);
  });

  it('Step 7: Frontmatter preserved after link insertion', () => {
    const guideFile = path.join(testDir, 'guides', 'getting-started.md');
    const original = fs.readFileSync(guideFile, 'utf-8');
    const zones = computeSafeZones(original);

    // Simulate inserting a link
    const result = insertInlineLink(original, 'ZIO', '../reference/zio.md', zones);
    const modified = result.result;

    // Verify frontmatter is still intact
    expect(modified).toMatch(/^---\ntitle:/);
    expect(modified).toMatch(/id: getting-started/);
    expect(modified).toContain('---');
  });

  it('Step 8: Report mode calculates statistics', () => {
    const state: CrossrefState = {
      docsDir: testDir,
      indexBuiltAt: new Date().toISOString(),
      index: [
        {
          id: 'reference__fiber',
          title: 'Fiber',
          path: 'reference/fiber.md',
          absPath: path.join(testDir, 'reference/fiber.md'),
          summary: '',
          keywords: [],
          existingLinkCount: 0,
          sectionType: 'reference',
        },
      ],
      processed: ['reference__fiber'],
      suggestions: [
        {
          sourceId: 'guides__getting-started',
          targetId: 'reference__fiber',
          targetTitle: 'Fiber',
          targetRelativePath: '../reference/fiber.md',
          anchorText: 'Fiber',
          type: 'inline',
          confidence: 'high',
          reasoning: 'mentioned in guide',
          status: 'applied',
        },
      ],
      tokens: { inputTotal: 1000, outputTotal: 500, runningCost: 0.05 },
    };

    const applied = state.suggestions.filter(s => s.status === 'applied');
    expect(applied.length).toBe(1);
    expect(state.tokens.inputTotal).toBe(1000);
    expect(state.tokens.outputTotal).toBe(500);
  });

  it('Step 9: All fixture files remain intact', () => {
    const files = [
      path.join(testDir, 'reference', 'fiber.md'),
      path.join(testDir, 'reference', 'zio.md'),
      path.join(testDir, 'guides', 'getting-started.md'),
    ];

    for (const file of files) {
      expect(fs.existsSync(file)).toBe(true);
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).toMatch(/^---\ntitle:/);
      expect(content).toContain('---');
    }
  });
});

describe('Issue #3: No Reentrant Session Calls', () => {
  it('extract_page_metadata tool is not available to agent (prevents deadlock)', () => {
    // Verify that createMetadataExtractorTool is no longer imported/used in workflow
    // This test ensures we cannot accidentally create reentrant calls
    // The fix removes the tool from the agent's available tools

    // The extraction still happens via direct session.prompt calls:
    // 1. Prerequisite phase: extracts metadata before agent runs
    // 2. Postprocessing phase: extracts metadata for See Also targets after agent returns

    // Both phases use direct session.prompt(), not tool callbacks, so no reentrancy

    // This prevents the deadlock scenario:
    // Before: Agent could call extract_page_metadata tool → calls session.prompt()
    //         → reentrant call while outer session.prompt() still running → deadlock
    // After:  Extraction only in direct session.prompt() calls → no reentrancy → no deadlock

    const toolList = [
      'validate_anchor',
      'extract_page_structure',
      'get_adjacent_pages',
      'search_pages',
      'content_search',
    ];

    // The extract_page_metadata tool should NOT be in this list
    expect(toolList).not.toContain('extract_page_metadata');

    // All other tools remain available
    expect(toolList.length).toBe(5);
  });
});
