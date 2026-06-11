import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FlueSession } from '@flue/runtime';
import { loadConfig } from '../../lib/config-loader.js';
import { loadState, saveState } from '../../lib/state-store.js';
import { parseSidebars } from '../utils/sidebar-parser.js';
import {
  extractTitle,
  extractExistingLinks,
  parseFrontmatter,
} from '../../lib/markdown-parser.js';
import { isGenericTitle } from '../../lib/title-utils.js';
import { generateContextualTitle } from '../utils/metadata-utilities.js';
import type { CrossrefState } from '../../lib/schemas.js';

function walkDocs(docsDir: string, excludePatterns: string[]): string[] {
  const results: string[] = [];
  function walk(dir: string) {
    let entries: any[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e: any) {
      console.warn(`[reindex] Skipping unreadable directory ${dir}: ${e.message}`);
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const rel = path.relative(docsDir, fullPath);
      if (excludePatterns.some(p => rel.includes(p))) continue;
      if (entry.isDirectory()) { walk(fullPath); continue; }
      if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) results.push(fullPath);
    }
  }
  walk(docsDir);
  return results;
}

function pageIdFromPath(absPath: string, docsDir: string): string {
  return path.relative(docsDir, absPath)
    .replace(/\.(md|mdx)$/, '')
    .replace(/\\/g, '/');
}

export async function reindex(
  docsDir: string,
  state: CrossrefState,
  session: FlueSession
): Promise<CrossrefState> {
  const config = loadConfig(docsDir);
  const files = walkDocs(docsDir, config.excludePatterns);

  console.log(`[reindex] Found ${files.length} docs files`);

  const sidebarPath = path.join(docsDir, '..', '..', 'website', 'sidebars.js');
  const adjacentMap = fs.existsSync(sidebarPath)
    ? parseSidebars(sidebarPath)
    : {};
  console.log(`[reindex] Loaded ${Object.keys(adjacentMap).length} pages from sidebars`);

  const index = await Promise.all(files.map(async absPath => {
    let content: string;
    try {
      content = fs.readFileSync(absPath, 'utf-8');
    } catch (e: any) {
      console.warn(`[reindex] Skipping unreadable file ${absPath}: ${e.message}`);
      return null as any;
    }
    const rel = path.relative(docsDir, absPath);
    const fm = parseFrontmatter(content);
    const title = extractTitle(content, path.basename(absPath, path.extname(absPath)));

    let contextualTitle: string | undefined;
    if (fm.description && isGenericTitle(title)) {
      try {
        contextualTitle = await generateContextualTitle(title, fm.description, session);
      } catch (e) {
        console.warn(`[reindex] Failed to generate contextual title for ${absPath}: ${e}`);
      }
    }

    const finalContextualTitle = contextualTitle !== title ? contextualTitle : undefined;
    if (finalContextualTitle) {
      console.log(`[reindex] Saving contextual title "${finalContextualTitle}" for "${title}"`);
    }

    return {
      id: pageIdFromPath(absPath, docsDir),
      title,
      path: rel,
      absPath,
      description: fm.description || null,
      keywords: Array.isArray(fm.keywords) && fm.keywords.length > 0 ? fm.keywords : null,
      contextualTitle: finalContextualTitle,
      existingLinkCount: extractExistingLinks(content).length,
      adjacentPages: adjacentMap[pageIdFromPath(absPath, docsDir)] || [],
    };
  })).then(results => results.filter(e => e !== null));

  const currentPageIds = new Set(index.map(e => e.id));
  const orphanedCount = state.processed.length;
  const cleanedProcessed = state.processed.filter(id => currentPageIds.has(id));
  const actualOrphanedCount = orphanedCount - cleanedProcessed.length;

  const newState: CrossrefState = {
    ...state,
    indexBuiltAt: new Date().toISOString(),
    docsDir,
    index,
    processed: cleanedProcessed,
  };

  saveState(docsDir, newState);
  console.log(`[reindex] Index built: ${index.length} pages. Progress preserved: ${cleanedProcessed.length} pages already processed (${actualOrphanedCount} orphaned IDs removed).`);
  return newState;
}
