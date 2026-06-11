import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import {
  CrossrefState,
  PageIndex,
  SuggestionsState,
  type PageIndex as PageIndexType,
  type SuggestionsState as SuggestionsStateType,
} from './schemas.js';
import type { CrossrefState as CrossrefStateType } from './schemas.js';
import { migrateState } from './migrate-state.js';

function stateDir(docsDir: string): string {
  return path.join(docsDir, '.crossref-state');
}

function indexFile(docsDir: string): string {
  return path.join(stateDir(docsDir), 'index.json');
}

function suggestionsFile(docsDir: string): string {
  return path.join(stateDir(docsDir), 'suggestions.json');
}

function oldStateFile(docsDir: string): string {
  return path.join(stateDir(docsDir), 'state.json');
}

export async function loadIndex(docsDir: string): Promise<PageIndexType | null> {
  const file = indexFile(docsDir);
  try {
    return v.parse(PageIndex, JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null;
    console.warn('[crossref] Index file corrupt, treating as empty');
    return null;
  }
}

export function saveIndex(docsDir: string, index: PageIndexType): void {
  const file = indexFile(docsDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(index, null, 2), 'utf-8');
}

export async function loadSuggestions(docsDir: string): Promise<SuggestionsStateType | null> {
  const file = suggestionsFile(docsDir);
  try {
    return v.parse(SuggestionsState, JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null;
    console.warn('[crossref] Suggestions file corrupt, treating as empty');
    return null;
  }
}

export function saveSuggestions(docsDir: string, suggestions: SuggestionsStateType): void {
  const file = suggestionsFile(docsDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(suggestions, null, 2), 'utf-8');
}

export async function loadState(docsDir: string): Promise<CrossrefStateType | null> {
  // Perform migration if needed
  try {
    const migration = await migrateState(docsDir);
    if (migration.migrated) {
      console.log(`[crossref] ${migration.message}`);
    }
  } catch (e) {
    console.warn(`[crossref] Migration warning: ${e}`);
  }

  // Load both files
  const index = await loadIndex(docsDir);
  const suggestions = await loadSuggestions(docsDir);

  // If neither file exists, return null (will create empty state)
  if (!index && !suggestions) {
    return null;
  }

  // Merge index and suggestions into a combined state
  // Ensure all index entries have adjacentPages field and normalize description/keywords fields
  // Issue: Preserve original entry references to allow mutations in processing loops
  const normalizedIndex = (index?.index || []).map((rawEntry: any, idx: number) => {
    // Issue #5 fix: Validate critical fields with explicit type checking
    if (!rawEntry || typeof rawEntry !== 'object') {
      throw new Error(`Index entry [${idx}] is not an object: ${JSON.stringify(rawEntry)}`);
    }
    if (typeof rawEntry.absPath !== 'string' || !rawEntry.absPath) {
      throw new Error(`Index entry [${idx}] missing or invalid absPath field (page: ${rawEntry.id || rawEntry.path || 'unknown'}): ${JSON.stringify(rawEntry)}`);
    }
    if (typeof rawEntry.id !== 'string' || !rawEntry.id) {
      throw new Error(`Index entry [${idx}] missing or invalid id field: ${JSON.stringify(rawEntry)}`);
    }

    // Type-safe entry with explicit field checks
    const entry = rawEntry as {
      id: string;
      title?: string;
      path?: string;
      absPath: string;
      description?: string | null;
      summary?: string;
      keywords?: unknown;
      contextualTitle?: string;
      existingLinkCount?: number;
      adjacentPages?: string[];
    };

    // Mutate entry in place to preserve references instead of spreading
    if (!entry.adjacentPages) {
      entry.adjacentPages = [];
    }
    // Backward compatibility: migrate summary → description (check both fields, preserve intentional empty values)
    if (entry.description === undefined) {
      entry.description = entry.summary || null;
    }
    // Issue #4 fix: Normalize keywords consistently - preserve arrays and null, convert undefined to null
    // With explicit warning for invalid types
    if (entry.keywords === undefined) {
      entry.keywords = null;
    } else if (Array.isArray(entry.keywords)) {
      // Valid: array of keywords
      entry.keywords = entry.keywords;
    } else if (entry.keywords === null) {
      // Valid: explicitly null
      entry.keywords = null;
    } else {
      // Invalid type - log warning and convert to null
      console.warn(`[crossref] Index entry [${idx}] (${entry.id}): keywords has invalid type ${typeof entry.keywords}, converting to null`);
      entry.keywords = null;
    }
    return entry;
  });

  return {
    indexBuiltAt: index?.indexBuiltAt || new Date().toISOString(),
    docsDir: index?.docsDir || docsDir,
    index: normalizedIndex,
    processed: suggestions?.processed || [],
    suggestions: suggestions?.suggestions || [],
    tokens: suggestions?.tokens || { inputTotal: 0, outputTotal: 0, runningCost: 0 },
    // Issue #3 fix: Preserve sectionTypeMap from suggestions file (now in schema)
    sectionTypeMap: suggestions?.sectionType || {},
  } as CrossrefStateType;
}

export function saveState(docsDir: string, state: CrossrefStateType): void {
  // Extract and save index data
  const index: PageIndexType = {
    indexBuiltAt: state.indexBuiltAt,
    docsDir: state.docsDir,
    index: state.index.map(entry => ({
      id: entry.id,
      title: entry.title,
      path: entry.path,
      absPath: entry.absPath,
      description: entry.description || undefined,
      // Issue #7 fix: Only convert null to undefined, preserve explicit empty arrays
      keywords: entry.keywords === null ? undefined : entry.keywords,
      contextualTitle: entry.contextualTitle,
      existingLinkCount: entry.existingLinkCount,
      // Issue #1 fix: Persist adjacentPages to disk
      adjacentPages: entry.adjacentPages || [],
    })),
  };

  // Extract and save suggestions data
  // Issue #5 fix: Preserve sectionTypeMap from state (loaded during migration or default empty)
  const sectionTypeMap: Record<string, 'reference' | 'guide' | 'tutorial' | 'overview' | 'other'> =
    (state as any).sectionTypeMap || {};

  const suggestions: SuggestionsStateType = {
    processed: state.processed,
    suggestions: state.suggestions,
    sectionType: sectionTypeMap,
    tokens: state.tokens,
  };

  saveIndex(docsDir, index);
  saveSuggestions(docsDir, suggestions);
}

export function emptyIndex(docsDir: string): PageIndexType {
  return {
    indexBuiltAt: new Date().toISOString(),
    docsDir,
    index: [],
  };
}

export function emptySuggestions(): SuggestionsStateType {
  return {
    processed: [],
    suggestions: [],
    sectionType: {},
    tokens: { inputTotal: 0, outputTotal: 0, runningCost: 0 },
  };
}

export function emptyState(docsDir: string): CrossrefStateType {
  return {
    indexBuiltAt: new Date().toISOString(),
    docsDir,
    index: [],
    processed: [],
    suggestions: [],
    tokens: { inputTotal: 0, outputTotal: 0, runningCost: 0 },
    // Issue #3 fix: Initialize sectionTypeMap for consistency with schema
    sectionTypeMap: {},
  };
}
