import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import type { CrossrefState } from '../lib/schemas.js';

export function createSearchPages(state: CrossrefState) {
  return defineTool({
    name: 'search_pages',
    description:
      'Search the documentation index for pages by title, keywords, or topic. Returns matching pages ranked by relevance.',
    parameters: v.object({
      query: v.string(),
      limit: v.optional(
        v.number()
      ),
    }),
    execute: async (args: Record<string, any>) => {
      const query = (args.query as string).toLowerCase();
      const limit = (args.limit as number | undefined) ?? 5;

      console.log(`[search_pages] Searching for "${query}" (limit: ${limit})`);

      // Score each page based on title and keywords match
      const scored = state.index.map((page) => {
        let score = 0;

        // Title match is highest priority (exact or substring)
        const titleLower = page.title.toLowerCase();
        if (titleLower === query) score += 100;
        else if (titleLower.includes(query)) score += 50;

        // Description match
        if (page.description) {
          const descLower = page.description.toLowerCase();
          if (descLower.includes(query)) score += 30;
        }

        // Keywords match
        if (page.keywords && Array.isArray(page.keywords)) {
          const matchCount = page.keywords.filter(
            (kw) => kw.toLowerCase().includes(query) || query.includes(kw.toLowerCase())
          ).length;
          score += matchCount * 20;
        }

        // Partial word matching (for terms like "Stream" matching "ZStream")
        const words = query.split(/\s+/);
        for (const word of words) {
          if (titleLower.includes(word)) score += 10;
          if (page.keywords?.some((kw) => kw.toLowerCase().includes(word))) score += 5;
        }

        return { page, score };
      });

      // Filter to pages with any match, sort by score, limit results
      const results = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => ({
          id: s.page.id,
          title: s.page.title,
          path: s.page.path,
          description: s.page.description || null,
          keywords: s.page.keywords || [],
          score: s.score,
        }));

      console.log(
        `[search_pages] Found ${results.length} results: ${results.map((r) => `${r.title} (score: ${r.score})`).join(', ')}`
      );

      return JSON.stringify({
        query,
        resultsCount: results.length,
        results,
      });
    },
  });
}
