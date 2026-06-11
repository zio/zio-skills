import { defineTool, Type } from '@flue/runtime';
import * as fs from 'node:fs';
import { extractHeadings } from '../lib/markdown-parser.js';
import type { CrossrefState } from '../lib/schemas.js';

export function createValidateAnchor(state: CrossrefState) {
  return defineTool({
    name: 'validate_anchor',
    description: 'Check if an anchor/heading exists in a target page. Returns whether the anchor is available and lists all available headings.',
    parameters: Type.Object({
      pageId: Type.String({
        description: 'The page ID to check (e.g., "reference__core__runtime")'
      }),
      anchorText: Type.String({
        description: 'The anchor text or heading to validate (e.g., "setConfigProvider", "set_config_provider")'
      }),
    }),
    execute: async (args: Record<string, any>) => {
      const pageId = args.pageId as string;
      const anchorText = args.anchorText as string;

      console.log(`[validate_anchor] Checking anchor "${anchorText}" in page "${pageId}"`);

      const entry = state.index.find(e => e.id === pageId);
      if (!entry) {
        console.log(`[validate_anchor] ERROR: Page "${pageId}" not found in index`);
        return JSON.stringify({
          error: `Page ${pageId} not found in index`,
        });
      }

      try {
        const content = fs.readFileSync(entry.absPath, 'utf-8');
        const headings = extractHeadings(content);
        console.log(`[validate_anchor] Found ${headings.length} headings in "${pageId}"`);

        // Normalize anchor for matching
        const normalizedAnchor = anchorText.toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-');

        console.log(`[validate_anchor] Normalized anchor: "${normalizedAnchor}"`);

        // Check if anchor exists (exact or partial match)
        const found = headings.some(h =>
          h.slug === normalizedAnchor ||
          h.slug.includes(normalizedAnchor) ||
          normalizedAnchor.includes(h.slug)
        );

        console.log(`[validate_anchor] Anchor exists: ${found}`);

        return JSON.stringify({
          pageId,
          anchorText,
          exists: found,
          availableHeadings: headings.map(h => ({
            text: h.text,
            slug: h.slug,
          })),
        });
      } catch (e) {
        console.log(`[validate_anchor] ERROR reading page: ${e}`);
        return JSON.stringify({
          error: `Failed to read page: ${e}`,
        });
      }
    }
  });
}
