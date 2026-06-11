import * as v from 'valibot';
import { MetadataExtractorOutput } from './schemas.js';

/**
 * Extract page title from content or frontmatter.
 * Falls back to 'Untitled' if no title found.
 */
export function extractPageTitle(content: string, existingTitle?: string): string {
  // If existing title provided, use it
  if (existingTitle && existingTitle.trim()) {
    return existingTitle.trim();
  }

  // Try to extract from H1 (# Heading)
  const h1Match = content.match(/^# (.+)$/m);
  if (h1Match && h1Match[1]) {
    return h1Match[1].trim();
  }

  // Try to extract from YAML frontmatter title field
  const frontmatterMatch = content.match(/^---\n[\s\S]*?title:\s*["']?([^"\n]+)["']?\n[\s\S]*?---/);
  if (frontmatterMatch && frontmatterMatch[1]) {
    return frontmatterMatch[1].trim();
  }

  return 'Untitled';
}

/**
 * Validate metadata output from agent.
 * Returns validation result with data or error details.
 */
export function validateMetadata(output: unknown): {
  valid: boolean;
  error?: string;
  data?: MetadataExtractorOutput;
} {
  try {
    const result = v.safeParse(MetadataExtractorOutput, output);

    if (!result.success) {
      const errors = result.issues
        .map((issue) => `${issue.path?.map((p: any) => p.key).join('.')}: ${issue.message}`)
        .join('; ');
      return {
        valid: false,
        error: `Validation failed: ${errors}`,
      };
    }

    // Additional semantic validations
    const data = result.output;

    // Description must be non-empty
    if (!data.description || !data.description.trim()) {
      return {
        valid: false,
        error: 'Description must be non-empty',
      };
    }

    // Keywords must be array with at least 3 items
    if (!Array.isArray(data.keywords) || data.keywords.length < 3) {
      return {
        valid: false,
        error: 'Keywords must contain at least 3 items',
      };
    }

    // All keywords must be non-empty strings
    if (data.keywords.some((kw: string) => !kw || !kw.trim())) {
      return {
        valid: false,
        error: 'All keywords must be non-empty strings',
      };
    }

    return {
      valid: true,
      data,
    };
  } catch (error) {
    return {
      valid: false,
      error: `Unexpected error during validation: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if metadata is complete and ready for use.
 * Returns true if both description and keywords are present and valid.
 */
export function hasCompleteMetadata(metadata: {
  description?: string;
  keywords?: string[];
}): boolean {
  return !!(
    metadata.description &&
    metadata.description.trim().length > 0 &&
    Array.isArray(metadata.keywords) &&
    metadata.keywords.length > 0
  );
}
