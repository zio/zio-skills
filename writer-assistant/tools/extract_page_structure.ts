import { defineTool, Type } from '@flue/runtime';
import * as fs from 'node:fs';
import { extractHeadings } from '../lib/markdown-parser.js';
import type { CrossrefState } from '../lib/schemas.js';

export function createExtractPageStructure(state: CrossrefState) {
  return defineTool({
    name: 'extract_page_structure',
    description: 'Extract the heading structure (table of contents) from a page. Shows all available anchors that can be linked to.',
    parameters: Type.Object({
      pageId: Type.String({
        description: 'The page ID (e.g., "reference__stream__zsink__index")'
      }),
    }),
    execute: async (args: Record<string, any>) => {
      const pageId = args.pageId as string;

      console.log(`[extract_page_structure] Extracting structure for page "${pageId}"`);

      const entry = state.index.find(e => e.id === pageId);
      if (!entry) {
        console.log(`[extract_page_structure] ERROR: Page "${pageId}" not found in index`);
        return JSON.stringify({
          error: `Page ${pageId} not found in index`,
        });
      }

      try {
        const content = fs.readFileSync(entry.absPath, 'utf-8');
        const headings = extractHeadings(content);

        console.log(`[extract_page_structure] Extracted ${headings.length} headings from "${pageId}"`);
        console.log(`[extract_page_structure] Headings: ${headings.map(h => h.text).join(', ')}`);

        return JSON.stringify({
          pageId,
          title: entry.title,
          headings: headings.map(h => ({
            text: h.text,
            slug: h.slug,
          })),
        });
      } catch (e) {
        console.log(`[extract_page_structure] ERROR reading page: ${e}`);
        return JSON.stringify({
          error: `Failed to read page: ${e}`,
        });
      }
    }
  });
}
