import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import type { CrossrefState } from '../lib/schemas.js';

export function createGetAdjacentPages(state: CrossrefState) {
  return defineTool({
    name: 'get_adjacent_pages',
    description:
      'Get all pages in the same documentation section. Adjacent pages are strong candidates for See Also links.',
    parameters: v.object({
      pageId: v.string(),
    }),
    execute: async (args: Record<string, any>) => {
      const pageId = args.pageId as string;

      console.log(`[get_adjacent_pages] Getting adjacent pages for "${pageId}"`);

      const entry = state.index.find((e) => e.id === pageId);
      if (!entry) {
        console.log(`[get_adjacent_pages] ERROR: Page "${pageId}" not found in index`);
        return JSON.stringify({
          error: `Page ${pageId} not found in index`,
        });
      }

      const adjacentPages = entry.adjacentPages || [];
      console.log(
        `[get_adjacent_pages] Found ${adjacentPages.length} adjacent page IDs: ${adjacentPages.join(', ')}`
      );

      const adjacentEntries = adjacentPages
        .map((id) => state.index.find((e) => e.id === id))
        .filter((e): e is (typeof state.index)[0] => !!e)
        .map((e) => ({
          id: e.id,
          title: e.title,
          path: e.path,
          description: e.description || null,
        }));

      console.log(
        `[get_adjacent_pages] Resolved ${adjacentEntries.length} adjacent pages: ${adjacentEntries.map((e) => e.title).join(', ')}`
      );

      return JSON.stringify({
        pageId,
        title: entry.title,
        adjacentCount: adjacentEntries.length,
        adjacent: adjacentEntries,
      });
    },
  });
}
