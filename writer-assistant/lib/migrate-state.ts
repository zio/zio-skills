import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parseAsync } from 'valibot';
import {
  CrossrefState,
  PageIndex,
  SuggestionsState,
  type CrossrefState as CrossrefStateType,
  type PageIndex as PageIndexType,
  type SuggestionsState as SuggestionsStateType,
} from './schemas.js';

export async function migrateState(docsDir: string): Promise<{
  indexFile: string;
  suggestionsFile: string;
  migrated: boolean;
  message: string;
}> {
  const stateDir = join(docsDir, '.crossref-state');
  const oldStatePath = join(stateDir, 'state.json');
  const indexPath = join(stateDir, 'index.json');
  const suggestionsPath = join(stateDir, 'suggestions.json');

  // Ensure state directory exists
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }

  // If both new files exist, migration already done
  if (existsSync(indexPath) && existsSync(suggestionsPath)) {
    return {
      indexFile: indexPath,
      suggestionsFile: suggestionsPath,
      migrated: false,
      message: 'Both index.json and suggestions.json already exist - no migration needed',
    };
  }

  // If old state.json doesn't exist, nothing to migrate
  if (!existsSync(oldStatePath)) {
    return {
      indexFile: indexPath,
      suggestionsFile: suggestionsPath,
      migrated: false,
      message: 'No old state.json found - starting with fresh state',
    };
  }

  // Read and parse old state
  let oldStateData: unknown;
  try {
    oldStateData = JSON.parse(readFileSync(oldStatePath, 'utf-8'));
  } catch (error) {
    throw new Error(`Failed to parse old state.json: ${error}`);
  }

  // Issue #2 fix: Extract sectionType from raw data BEFORE schema validation strips it
  const sectionTypeMap: Record<string, 'reference' | 'guide' | 'tutorial' | 'overview' | 'other'> = {};
  if (typeof oldStateData === 'object' && oldStateData !== null && 'index' in oldStateData) {
    const indexArray = (oldStateData as any).index;
    if (Array.isArray(indexArray)) {
      for (const entry of indexArray) {
        if (entry.id && entry.sectionType) {
          sectionTypeMap[entry.id] = entry.sectionType;
        }
      }
    }
  }

  let oldState: CrossrefStateType;
  try {
    oldState = await parseAsync(CrossrefState, oldStateData);
  } catch (error) {
    throw new Error(`Old state.json does not match expected schema: ${error}`);
  }

  // Extract index data (mechanical only - no metadata)
  const index: PageIndexType = {
    indexBuiltAt: oldState.indexBuiltAt,
    docsDir: oldState.docsDir,
    index: oldState.index.map(entry => ({
      id: entry.id,
      title: entry.title,
      path: entry.path,
      absPath: entry.absPath,
      existingLinkCount: entry.existingLinkCount,
      // Issue #1 fix: Preserve adjacentPages during migration
      adjacentPages: entry.adjacentPages || [],
    })),
  };

  // Extract suggestions data (LLM-generated)

  const suggestions: SuggestionsStateType = {
    processed: oldState.processed,
    suggestions: oldState.suggestions,
    sectionType: sectionTypeMap,
    tokens: oldState.tokens,
  };

  // Write new files
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  writeFileSync(suggestionsPath, JSON.stringify(suggestions, null, 2));

  // Backup old file (don't delete in case rollback needed)
  const backupPath = join(stateDir, 'state.json.backup');
  writeFileSync(backupPath, readFileSync(oldStatePath));

  return {
    indexFile: indexPath,
    suggestionsFile: suggestionsPath,
    migrated: true,
    message: `Successfully migrated state.json to index.json and suggestions.json. Backup saved to state.json.backup`,
  };
}
