import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import * as fs from 'node:fs';
import { extractHeadings } from '../lib/markdown-parser.js';
import type { CrossrefState } from '../lib/schemas.js';

export function createExtractPageStructure(state: CrossrefState) {
  return defineTool({
    name: 'extract_page_structure',
    description:
      'Extract the heading structure (table of contents) from a page. Shows all available anchors that can be linked to.',
    input: v.object({
      pageId: v.string(),
    }),
    run: (async ({ input }: { input: any }) => {
      const { pageId } = input;

      console.log(`[extract_page_structure] Extracting structure for page "${pageId}"`);

      const entry = state.index.find((e) => e.id === pageId);
      if (!entry) {
        console.log(`[extract_page_structure] ERROR: Page "${pageId}" not found in index`);
        return { error: `Page ${pageId} not found in index` };
      }

      try {
        const content = fs.readFileSync(entry.absPath, 'utf-8');
        const headings = extractHeadings(content);

        console.log(
          `[extract_page_structure] Extracted ${headings.length} headings from "${pageId}"`
        );
        console.log(`[extract_page_structure] Headings: ${headings.map((h) => h.text).join(', ')}`);

        return {
          pageId,
          title: entry.title,
          headings: headings.map((h) => ({ text: h.text, slug: h.slug })),
        };
      } catch (e) {
        console.log(`[extract_page_structure] ERROR reading page: ${e}`);
        return { error: `Failed to read page: ${e}` };
      }
    }) as (ctx: any) => any,
  });
}
