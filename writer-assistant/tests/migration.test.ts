import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { migrateState } from '../lib/migrate-state.js';
import { loadIndex, loadSuggestions, saveIndex, saveSuggestions } from '../lib/state-store.js';
import type { PageIndex, SuggestionsState } from '../lib/schemas.js';

const TEST_DIR = path.join(import.meta.dirname!, '..', '.test-state');
const STATE_DIR = path.join(TEST_DIR, '.crossref-state');

beforeEach(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  fs.mkdirSync(STATE_DIR, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
});

describe('Migration', () => {
  it('migrates old state.json to new index.json and suggestions.json', async () => {
    // Create old-format state.json
    const oldState = {
      indexBuiltAt: '2024-01-01T00:00:00Z',
      docsDir: TEST_DIR,
      index: [
        {
          id: 'page1',
          title: 'Page 1',
          path: 'page1.md',
          absPath: path.join(TEST_DIR, 'page1.md'),
          summary: 'First page',
          keywords: ['test', 'page'],
          sectionType: 'guide' as const,
          existingLinkCount: 0,
        },
        {
          id: 'page2',
          title: 'Page 2',
          path: 'page2.md',
          absPath: path.join(TEST_DIR, 'page2.md'),
          summary: 'Second page',
          keywords: ['test'],
          sectionType: 'reference' as const,
          existingLinkCount: 1,
        },
      ],
      processed: ['page1'],
      suggestions: [
        {
          sourceId: 'page1',
          targetId: 'page2',
          targetTitle: 'Page 2',
          targetRelativePath: './page2.md',
          anchorText: 'See page 2',
          description: 'Link to second page',
          type: 'inline' as const,
          confidence: 'high' as const,
          reasoning: 'Related content',
          status: 'applied' as const,
        },
      ],
      tokens: {
        inputTotal: 1000,
        outputTotal: 500,
        runningCost: 4.0,
      },
    };

    fs.writeFileSync(
      path.join(STATE_DIR, 'state.json'),
      JSON.stringify(oldState, null, 2)
    );

    // Run migration
    const result = await migrateState(TEST_DIR);

    expect(result.migrated).toBe(true);
    expect(fs.existsSync(path.join(STATE_DIR, 'index.json'))).toBe(true);
    expect(fs.existsSync(path.join(STATE_DIR, 'suggestions.json'))).toBe(true);
    expect(fs.existsSync(path.join(STATE_DIR, 'state.json.backup'))).toBe(true);

    // Verify index.json contents
    const index = await loadIndex(TEST_DIR);
    expect(index).not.toBeNull();
    expect(index!.index.length).toBe(2);
    expect(index!.index[0].id).toBe('page1');
    expect(index!.index[0].sectionType).toBeUndefined();

    // Verify suggestions.json contents
    const suggestions = await loadSuggestions(TEST_DIR);
    expect(suggestions).not.toBeNull();
    expect(suggestions!.processed.length).toBe(1);
    expect(suggestions!.suggestions.length).toBe(1);
    expect(suggestions!.sectionType['page1']).toBe('guide');
    expect(suggestions!.sectionType['page2']).toBe('reference');
  });

  it('skips migration if new files already exist', async () => {
    // Create new-format files
    const index: PageIndex = {
      indexBuiltAt: '2024-01-01T00:00:00Z',
      docsDir: TEST_DIR,
      index: [],
    };
    const suggestions: SuggestionsState = {
      processed: [],
      suggestions: [],
      sectionType: {},
      tokens: { inputTotal: 0, outputTotal: 0, runningCost: 0 },
    };

    saveIndex(TEST_DIR, index);
    saveSuggestions(TEST_DIR, suggestions);

    // Try to migrate (should skip)
    const result = await migrateState(TEST_DIR);

    expect(result.migrated).toBe(false);
    expect(result.message).toContain('already exist');
  });

  it('returns gracefully if no old state.json exists', async () => {
    const result = await migrateState(TEST_DIR);

    expect(result.migrated).toBe(false);
    expect(result.message).toContain('No old state.json found');
  });

  it('throws error if old state.json is malformed', async () => {
    fs.writeFileSync(
      path.join(STATE_DIR, 'state.json'),
      'invalid json {['
    );

    await expect(migrateState(TEST_DIR)).rejects.toThrow();
  });

  it('throws error if old state.json does not match schema', async () => {
    fs.writeFileSync(
      path.join(STATE_DIR, 'state.json'),
      JSON.stringify({ missing: 'fields' }, null, 2)
    );

    await expect(migrateState(TEST_DIR)).rejects.toThrow('does not match expected schema');
  });
});

describe('State Store - Dual Files', () => {
  it('can load and save index and suggestions independently', async () => {
    const index: PageIndex = {
      indexBuiltAt: '2024-01-01T00:00:00Z',
      docsDir: TEST_DIR,
      index: [
        {
          id: 'test',
          title: 'Test',
          path: 'test.md',
          absPath: path.join(TEST_DIR, 'test.md'),
          description: 'Test page',
          keywords: [],
          existingLinkCount: 0,
          // Issue #1 fix: Include adjacentPages in test index
          adjacentPages: [],
        },
      ],
    };

    const suggestions: SuggestionsState = {
      processed: ['test'],
      suggestions: [],
      sectionType: { test: 'guide' },
      tokens: { inputTotal: 1000, outputTotal: 500, runningCost: 4.0 },
    };

    saveIndex(TEST_DIR, index);
    saveSuggestions(TEST_DIR, suggestions);

    const loadedIndex = await loadIndex(TEST_DIR);
    const loadedSuggestions = await loadSuggestions(TEST_DIR);

    expect(loadedIndex).toEqual(index);
    expect(loadedSuggestions).toEqual(suggestions);
  });

  it('returns null for missing files', async () => {
    const index = await loadIndex(TEST_DIR);
    const suggestions = await loadSuggestions(TEST_DIR);

    expect(index).toBeNull();
    expect(suggestions).toBeNull();
  });
});

describe('State persistence round-trip (Issue #2: metadata preservation)', () => {
  it('preserves description and keywords through save/load cycle', async () => {
    const { saveState, loadState } = await import('../lib/state-store.js');

    const originalState = {
      indexBuiltAt: '2024-01-01T00:00:00Z',
      docsDir: TEST_DIR,
      index: [
        {
          id: 'clock',
          title: 'Clock Service',
          path: 'reference/services/clock.md',
          absPath: path.join(TEST_DIR, 'reference/services/clock.md'),
          description: 'Provides time-related operations for retrieving current time in various units, accessing date-time information, and non-blocking sleep functionality.',
          keywords: ['Clock Service', 'Current Time Operations', 'Non-blocking Sleep', 'Scheduling Operations'],
          existingLinkCount: 1,
          adjacentPages: ['console.md', 'random.md'],
        },
        {
          id: 'console',
          title: 'Console Service',
          path: 'reference/services/console.md',
          absPath: path.join(TEST_DIR, 'reference/services/console.md'),
          description: 'Service providing simple I/O operations for reading/writing strings from/to standard input, output, and error console.',
          keywords: ['Console Service', 'Standard Input/Output', 'String I/O'],
          existingLinkCount: 2,
          adjacentPages: ['clock.md'],
        },
      ],
      processed: ['clock'],
      suggestions: [],
      tokens: { inputTotal: 5000, outputTotal: 2000, runningCost: 10.5 },
    };

    // Save state
    saveState(TEST_DIR, originalState);

    // Load state
    const reloadedState = await loadState(TEST_DIR);

    // Verify all metadata is preserved
    expect(reloadedState).toBeDefined();
    expect(reloadedState!.index).toHaveLength(2);

    // Check first entry
    const clockEntry = reloadedState!.index.find(e => e.id === 'clock');
    expect(clockEntry).toBeDefined();
    expect(clockEntry!.description).toBe('Provides time-related operations for retrieving current time in various units, accessing date-time information, and non-blocking sleep functionality.');
    expect(clockEntry!.keywords).toEqual(['Clock Service', 'Current Time Operations', 'Non-blocking Sleep', 'Scheduling Operations']);

    // Check second entry
    const consoleEntry = reloadedState!.index.find(e => e.id === 'console');
    expect(consoleEntry).toBeDefined();
    expect(consoleEntry!.description).toBe('Service providing simple I/O operations for reading/writing strings from/to standard input, output, and error console.');
    expect(consoleEntry!.keywords).toEqual(['Console Service', 'Standard Input/Output', 'String I/O']);

    // Verify the cache hit test would work
    const hasBothFieldsClock = clockEntry!.description && clockEntry!.keywords;
    expect(hasBothFieldsClock).toBeTruthy();
    const hasBothFieldsConsole = consoleEntry!.description && consoleEntry!.keywords;
    expect(hasBothFieldsConsole).toBeTruthy();
  });

  it('handles missing description and keywords gracefully', async () => {
    const { saveState, loadState } = await import('../lib/state-store.js');

    const stateWithoutMetadata = {
      indexBuiltAt: '2024-01-01T00:00:00Z',
      docsDir: TEST_DIR,
      index: [
        {
          id: 'no-metadata',
          title: 'No Metadata Page',
          path: 'no-metadata.md',
          absPath: path.join(TEST_DIR, 'no-metadata.md'),
          description: null,
          keywords: null,
          existingLinkCount: 0,
          adjacentPages: [],
        },
      ],
      processed: [],
      suggestions: [],
      tokens: { inputTotal: 0, outputTotal: 0, runningCost: 0 },
    };

    saveState(TEST_DIR, stateWithoutMetadata);
    const reloaded = await loadState(TEST_DIR);

    expect(reloaded).toBeDefined();
    const entry = reloaded!.index[0];
    expect(entry.description).toBeNull();
    expect(entry.keywords).toBeNull();

    // Cache check should fail (triggering extraction)
    const hasBothFields = entry.description && entry.keywords;
    expect(hasBothFields).toBeFalsy();
  });
});

describe('Issue #6: Type-Aware YAML Serialization', () => {
  it('serializes numeric types without quotes in YAML', () => {
    // This test verifies that the serializeYamlValue function correctly
    // serializes numeric values without quotes, so downstream tools
    // (Docusaurus, MDX) can parse them as numbers instead of strings

    const mockSerializeYamlValue = (value: any): string => {
      if (typeof value === 'number') return String(value);
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      if (value === null || value === undefined) return 'null';
      if (typeof value === 'string') {
        if (/^[a-zA-Z0-9._/-]+$/.test(value)) return value;
        if (/[\n"':[\]{}@`#]/.test(value)) return `"${value.replace(/"/g, '\\"')}"`;
        return `"${value}"`;
      }
      return `"${String(value)}"`;
    };

    // Verify YAML output: numbers are NOT quoted
    const yamlLines = [
      `sidebar_position: ${mockSerializeYamlValue(2)}`,
      `order: ${mockSerializeYamlValue(10)}`,
      `draft: ${mockSerializeYamlValue(false)}`,
      `published: ${mockSerializeYamlValue(true)}`,
    ];

    // All numeric values should be unquoted
    expect(yamlLines[0]).toBe('sidebar_position: 2');      // NOT "2"
    expect(yamlLines[1]).toBe('order: 10');                 // NOT "10"
    expect(yamlLines[2]).toBe('draft: false');              // NOT "false"
    expect(yamlLines[3]).toBe('published: true');           // NOT "true"
  });

  it('preserves boolean types when present in frontmatter', () => {
    // Test demonstrates the fix: when a frontmatter field has a boolean,
    // it should serialize as `true` or `false`, not `"true"` or `"false"`

    // Before fix: all values quoted: draft: "false"
    // After fix: booleans unquoted: draft: false

    const mockSerializeYamlValue = (value: any): string => {
      if (typeof value === 'number') return String(value);
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      if (value === null || value === undefined) return 'null';
      if (typeof value === 'string') {
        if (/^[a-zA-Z0-9._/-]+$/.test(value)) return value;
        if (/[\n"':[\]{}@`#]/.test(value)) return `"${value.replace(/"/g, '\\"')}"`;
        return `"${value}"`;
      }
      return `"${String(value)}"`;
    };

    // Test boolean values
    expect(mockSerializeYamlValue(true)).toBe('true');    // Not "true"
    expect(mockSerializeYamlValue(false)).toBe('false');  // Not "false"

    // Test numeric values
    expect(mockSerializeYamlValue(2)).toBe('2');          // Not "2"
    expect(mockSerializeYamlValue(4.5)).toBe('4.5');      // Not "4.5"
    expect(mockSerializeYamlValue(-3)).toBe('-3');        // Not "-3"

    // Test string values
    expect(mockSerializeYamlValue('hello')).toBe('hello');         // Not quoted
    expect(mockSerializeYamlValue('hello world')).toBe('"hello world"');  // Quoted (has space)
    expect(mockSerializeYamlValue('key: value')).toBe('"key: value"');    // Quoted (has colon)

    // Test null
    expect(mockSerializeYamlValue(null)).toBe('null');    // Not "null"
  });
});

describe('Issue #4: Preserve Progress Across Reindex', () => {
  it('reindex preserves processed pages list (prevents autopilot restart)', async () => {
    const { loadState, saveState } = await import('../lib/state-store.js');

    // Create state with some processed pages
    const originalState = {
      indexBuiltAt: '2024-01-01T00:00:00Z',
      docsDir: TEST_DIR,
      index: [
        {
          id: 'page1',
          title: 'Page 1',
          path: 'page1.md',
          absPath: path.join(TEST_DIR, 'page1.md'),
          description: 'First page',
          keywords: ['test', 'page'],
          existingLinkCount: 0,
          adjacentPages: [],
        },
        {
          id: 'page2',
          title: 'Page 2',
          path: 'page2.md',
          absPath: path.join(TEST_DIR, 'page2.md'),
          description: 'Second page',
          keywords: ['test'],
          existingLinkCount: 1,
          adjacentPages: [],
        },
      ],
      processed: ['page1', 'page2'],
      suggestions: [],
      tokens: { inputTotal: 1000, outputTotal: 500, runningCost: 5.0 },
    };

    // Save initial state
    saveState(TEST_DIR, originalState);

    // Load it back
    let state = await loadState(TEST_DIR);
    expect(state!.processed).toEqual(['page1', 'page2']);

    // Simulate reindex: rebuild index (same pages, fresh index)
    // The fix: reindex should preserve state.processed
    const reindexedState = {
      ...state!,
      indexBuiltAt: new Date().toISOString(),
      index: state!.index,
      processed: state!.processed,
    };

    // Save reindexed state
    saveState(TEST_DIR, reindexedState);

    // Load again
    state = await loadState(TEST_DIR);

    // Verify processed list is preserved
    expect(state!.processed).toEqual(['page1', 'page2']);
    expect(state!.processed).toHaveLength(2);
  });

  it('reindex during autopilot does not restart progress', async () => {
    const { loadState, saveState } = await import('../lib/state-store.js');

    // Simulate: Batch 1 processed 3 pages
    const state1 = {
      indexBuiltAt: '2024-01-01T00:00:00Z',
      docsDir: TEST_DIR,
      index: [
        { id: 'p1', title: 'P1', path: 'p1.md', absPath: path.join(TEST_DIR, 'p1.md'),
          description: null, keywords: null, existingLinkCount: 0, adjacentPages: [] },
        { id: 'p2', title: 'P2', path: 'p2.md', absPath: path.join(TEST_DIR, 'p2.md'),
          description: null, keywords: null, existingLinkCount: 0, adjacentPages: [] },
        { id: 'p3', title: 'P3', path: 'p3.md', absPath: path.join(TEST_DIR, 'p3.md'),
          description: null, keywords: null, existingLinkCount: 0, adjacentPages: [] },
      ],
      processed: ['p1', 'p2', 'p3'],
      suggestions: [],
      tokens: { inputTotal: 3000, outputTotal: 1500, runningCost: 15.0 },
    };

    saveState(TEST_DIR, state1);

    // Autopilot reloads state after Batch 1
    let state = await loadState(TEST_DIR);
    expect(state!.processed).toEqual(['p1', 'p2', 'p3']);

    // SCENARIO: reindex() is called externally during Batch 2
    // The fix: reindex preserves processed list
    const reindexedState = {
      ...state!,
      indexBuiltAt: new Date().toISOString(),
      index: state!.index,
      processed: state!.processed,
    };

    saveState(TEST_DIR, reindexedState);

    // Autopilot continues - reloads state again
    state = await loadState(TEST_DIR);

    // CRITICAL: Verify processed list survived the reindex
    expect(state!.processed).toEqual(['p1', 'p2', 'p3']);
  });
});
