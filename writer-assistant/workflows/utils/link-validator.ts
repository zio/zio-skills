import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractExistingLinks, extractHeadings, computeSafeZones } from '../../lib/markdown-parser.js';
import { findAnchorWithFallback } from './link-inserter.js';
import type { LinkSuggestion } from '../../lib/schemas.js';

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: 'target_missing' | 'already_linked' | 'path_unresolvable' | 'anchor_not_in_source' };

/**
 * Normalize a path for comparison, handling case-insensitive filesystems.
 * On Windows/macOS (case-insensitive), converts to lowercase.
 * On Linux/Unix (case-sensitive), returns the normalized path as-is.
 * Issue #7 fix: Ensure consistent case handling - must normalize before lowercasing on case-insensitive OSes
 */
function normalizeForComparison(p: string): string {
  const normalized = path.normalize(p);
  // On case-insensitive OSes (Windows, macOS), normalize to lowercase for consistent comparison
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return normalized.toLowerCase();
  }
  // On case-sensitive OSes (Linux), use normalized path as-is to preserve case
  return normalized;
}

export function validateSuggestion(
  suggestion: LinkSuggestion,
  sourceContent: string,
  docsDir: string,
  sourceAbsPath: string
): ValidationResult {
  const sourceDir = path.dirname(sourceAbsPath);

  // Check 1: path must resolve and stay within docsDir (after symlink resolution)
  const resolvedTarget = path.resolve(sourceDir, suggestion.targetRelativePath);
  const normalizedDocsDir = path.resolve(docsDir);

  // Resolve symlinks to prevent symlink-based traversal attacks
  let realTarget: string;
  try {
    realTarget = fs.realpathSync(resolvedTarget);
  } catch {
    // File doesn't exist or symlink is broken
    console.log(`[VALIDATOR] [${suggestion.targetId}] FAILED: target_missing (${suggestion.targetRelativePath})`);
    return { ok: false, reason: 'target_missing' };
  }

  // Verify resolved path is within docsDir (after symlink resolution)
  const normalizedTarget = normalizeForComparison(realTarget);
  let realDocsDir: string;
  try {
    realDocsDir = fs.realpathSync(normalizedDocsDir);
  } catch {
    // docsDir doesn't exist or is inaccessible
    console.log(`[VALIDATOR] [${suggestion.targetId}] FAILED: path_unresolvable (docsDir missing)`);
    return { ok: false, reason: 'path_unresolvable' };
  }
  const normalizedDocsDirCmp = normalizeForComparison(realDocsDir);
  // Use forward slash for comparison since normalizeForComparison returns normalized paths
  const normalizedTargetWithSep = normalizedDocsDirCmp.replace(/\\/g, '/') + '/';
  const normalizedTargetCmp = normalizedTarget.replace(/\\/g, '/');

  // Check if target is within docsDir:
  // Either target is a child of docsDir (starts with docsDir + separator)
  // Or target exactly matches docsDir
  // Handle Windows paths by ensuring proper separator handling
  const normalizedDocsDirForwardSlash = normalizedDocsDirCmp.replace(/\\/g, '/');
  const isWithinDocsDir =
    normalizedTargetCmp.startsWith(normalizedTargetWithSep) ||
    normalizedTargetCmp === normalizedDocsDirForwardSlash;

  if (!isWithinDocsDir) {
    console.log(`[VALIDATOR] [${suggestion.targetId}] FAILED: path_unresolvable (${normalizedTarget})`);
    return { ok: false, reason: 'path_unresolvable' };
  }

  // Check 2: must not already be linked
  const existing = extractExistingLinks(sourceContent);
  // Normalize both paths for comparison (resolve relative to source directory)
  const normalizedSuggestionPath = normalizeForComparison(
    path.resolve(sourceDir, suggestion.targetRelativePath)
  );
  if (existing.some(l => {
    const normalizedExistingPath = normalizeForComparison(
      path.resolve(sourceDir, l.href)
    );
    return normalizedExistingPath === normalizedSuggestionPath;
  })) {
    console.log(`[VALIDATOR] [${suggestion.targetId}] FAILED: already_linked`);
    return { ok: false, reason: 'already_linked' };
  }

  // Check 3: For inline links, anchor text must exist in source (Issue #7 fix: validate before insertion)
  // Pass safe zones to prevent validation from finding text in code blocks or other protected areas
  // This ensures validation matches what will actually be inserted (Issue #4 fix)
  // Use includeInlineCode: false to match insertion behavior (inline code is NOT protected during insertion)
  if (suggestion.type === 'inline') {
    const safeZones = computeSafeZones(sourceContent, { includeInlineCode: false });
    const anchorMatch = findAnchorWithFallback(sourceContent, suggestion.anchorText, 0, safeZones);
    if (!anchorMatch) {
      console.log(`[VALIDATOR] [${suggestion.targetId}] FAILED: anchor_not_in_source (${suggestion.anchorText})`);
      return { ok: false, reason: 'anchor_not_in_source' };
    }
  }

  console.log(`[VALIDATOR] [${suggestion.targetId}] PASSED`);
  return { ok: true };
}

export function hasAnchorInTarget(
  targetAbsPath: string,
  methodOrOperatorName: string
): boolean {
  // For simple type names (e.g., "FiberRef"), always allow
  if (!methodOrOperatorName.includes('.') && !methodOrOperatorName.includes('#')) {
    return true;
  }

  // For methods/operators (e.g., "Runtime.setConfigProvider"), check if anchor exists
  try {
    const content = fs.readFileSync(targetAbsPath, 'utf-8');
    const headings = extractHeadings(content);

    // Extract the method/operator name part
    const methodPart = methodOrOperatorName.split(/[.#]/).pop() || '';
    const methodSlug = methodPart.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    // Check if any heading's slug matches
    return headings.some(h => h.slug.includes(methodSlug));
  } catch (e) {
    return false; // File not found or unreadable
  }
}
