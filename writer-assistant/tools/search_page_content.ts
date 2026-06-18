import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import * as fs from 'node:fs';
import type { CrossrefState } from '../lib/schemas.js';

export function createSearchPageContent(state: CrossrefState) {
  return defineTool({
    name: 'search_page_content',
    description:
      'Search within a specific page for occurrences of a term. Returns context snippets showing where the term appears.',
    parameters: v.object({
      pageId: v.string(),
      searchTerm: v.string(),
      contextLines: v.optional(
        v.number()
      ),
    }),
    execute: async (args: Record<string, any>) => {
      const pageId = args.pageId as string;
      const searchTerm = args.searchTerm as string;
      const contextLines = (args.contextLines as number | undefined) ?? 2;

      console.log(
        `[search_page_content] Searching for "${searchTerm}" in page "${pageId}" (context: ${contextLines} lines)`
      );

      const entry = state.index.find((e) => e.id === pageId);
      if (!entry) {
        console.log(`[search_page_content] ERROR: Page "${pageId}" not found in index`);
        return JSON.stringify({
          error: `Page ${pageId} not found in index`,
        });
      }

      try {
        const content = fs.readFileSync(entry.absPath, 'utf-8');
        const lines = content.split('\n');

        // Find all occurrences (case-insensitive)
        const searchLower = searchTerm.toLowerCase();
        const occurrences: { lineNum: number; text: string; snippet: string }[] = [];

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(searchLower)) {
            const start = Math.max(0, i - contextLines);
            const end = Math.min(lines.length, i + contextLines + 1);
            const snippet = lines.slice(start, end).join('\n');

            occurrences.push({
              lineNum: i + 1,
              text: lines[i],
              snippet,
            });
          }
        }

        console.log(
          `[search_page_content] Found ${occurrences.length} occurrences of "${searchTerm}" in "${pageId}"`
        );

        return JSON.stringify({
          pageId,
          searchTerm,
          found: occurrences.length > 0,
          totalOccurrences: occurrences.length,
          occurrences: occurrences.slice(0, 5), // Limit to 5 snippets
        });
      } catch (e) {
        console.log(`[search_page_content] ERROR reading page: ${e}`);
        return JSON.stringify({
          error: `Failed to read page: ${e}`,
        });
      }
    },
  });
}
