import * as fs from 'node:fs';
import * as path from 'node:path';

interface SidebarItem {
  id?: string;
  type?: string;
  items?: SidebarItem[];
  link?: { type: string; id: string };
  label?: string;
}

interface AdjacentPagesMap {
  [docId: string]: string[];
}

function flattenItems(items: SidebarItem[], parentPath: string[] = []): { docId: string; adjacentPath: string[] }[] {
  const results: { docId: string; adjacentPath: string[] }[] = [];

  for (const item of items) {
    if (typeof item === 'string') {
      // Simple string reference: "reference/stream/zsink/index"
      results.push({ docId: item, adjacentPath: [...parentPath, item] });
    } else if (item.link?.id) {
      // Category with link: { link: { id: "reference/stream/zsink/index" }, items: [...] }
      const newPath = [...parentPath, item.link.id];
      results.push({ docId: item.link.id, adjacentPath: newPath });
      if (item.items) {
        results.push(...flattenItems(item.items, newPath));
      }
    } else if (item.items) {
      // Category without link, just recurse
      results.push(...flattenItems(item.items, parentPath));
    }
  }

  return results;
}

export function parseSidebars(sidebarPath: string): AdjacentPagesMap {
  try {
    // Validate path is readable and exists
    if (!fs.existsSync(sidebarPath)) {
      throw new Error(`Sidebar file not found: ${sidebarPath}`);
    }

    const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');

    // Parse JavaScript module exports using safe regex-based parsing instead of require()
    // This avoids executing arbitrary code from the sidebars.js file
    const moduleExports: { [key: string]: SidebarItem[] } = {};

    // Extract export statements using regex (safe alternative to require)
    // Pattern: module.exports = { ... } or export default { ... }
    // Issue #5 fix: Use non-greedy matching and brace counting to avoid matching beyond the object
    let braceCount = 0;
    let startIdx = -1;
    let endIdx = -1;

    // Find the start of the object literal
    const exportKeywordMatch = sidebarContent.match(/(?:module\.exports\s*=\s*|export\s+default\s+)/);
    if (!exportKeywordMatch) {
      throw new Error('Could not find module.exports or export default in sidebar file');
    }

    startIdx = (exportKeywordMatch.index || 0) + exportKeywordMatch[0].length;

    // Find the opening brace and count braces to find matching closing brace
    for (let i = startIdx; i < sidebarContent.length; i++) {
      if (sidebarContent[i] === '{') {
        if (braceCount === 0) startIdx = i;
        braceCount++;
      } else if (sidebarContent[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }

    if (startIdx === -1 || endIdx === -1) {
      throw new Error('Could not find matching braces in sidebar file');
    }

    const exportMatch = [sidebarContent.substring(startIdx, endIdx)];
    if (!exportMatch || !exportMatch[0]) {
      throw new Error('Could not find module.exports or export default in sidebar file');
    }

    // Issue #5 fix: Parse sidebar structure using JSON.parse instead of Function constructor
    // Function constructor is a security risk when evaluating untrusted code
    let sidebarData: any;
    try {
      // Convert JavaScript object notation to valid JSON by:
      // 1. Removing trailing commas (optional properties)
      // 2. Handling unquoted keys (convert to quoted)
      // Issue #9 fix: Use more robust regex that handles nested structures
      // Match unquoted keys in various positions: after {, comma, or colon
      let jsonified = exportMatch[1]
        .replace(/,(\s*[}\]])/g, '$1');  // Remove trailing commas

      // Quote unquoted keys - match: (whitespace or {), key, colon
      // Use a global loop to handle multiple passes for deeply nested structures
      // Issue #3 fix: Make regex idempotent and context-aware by only matching genuinely unquoted keys
      // Exclude patterns where the key is already preceded by a quote, or where the previous non-space char is a quote
      let prevJson = '';
      let iterations = 0;
      const maxIterations = 100; // Prevent infinite loops on malformed JSON
      while (prevJson !== jsonified && iterations < maxIterations) {
        prevJson = jsonified;
        // Match unquoted keys, but exclude matches inside quoted strings
        // Process character by character to handle deeply nested structures correctly
        let result = '';
        let i = 0;
        let inString = false;
        let stringChar = '';

        while (i < jsonified.length) {
          // Track if we're inside a quoted string
          if ((jsonified[i] === '"' || jsonified[i] === "'") && (i === 0 || jsonified[i - 1] !== '\\')) {
            if (!inString) {
              inString = true;
              stringChar = jsonified[i];
            } else if (jsonified[i] === stringChar) {
              inString = false;
            }
            result += jsonified[i];
            i++;
            continue;
          }

          // Only process unquoted keys outside of strings
          if (!inString) {
            const match = jsonified.slice(i).match(/^([{,\s])([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/);
            if (match) {
              result += match[1] + '"' + match[2] + '":';
              i += match[0].length;
              continue;
            }
          }

          result += jsonified[i];
          i++;
        }
        jsonified = result;
        iterations++;
      }
      // Issue #4 fix: Throw clear error if regex loop exceeds max iterations
      if (iterations >= maxIterations) {
        throw new Error('Sidebar parsing JSON normalization loop exceeded maximum iterations (100) - sidebar structure is too deeply nested or malformed. This may indicate circular references or deeply nested structures that cannot be safely parsed.');
      }

      sidebarData = JSON.parse(jsonified);
    } catch (e) {
      throw new Error(`Failed to parse sidebar structure: ${e}`);
    }

    // Flatten all sidebar sections
    const allDocs: { docId: string; adjacentPath: string[] }[] = [];

    for (const [sectionKey, items] of Object.entries(sidebarData)) {
      if (Array.isArray(items)) {
        allDocs.push(...flattenItems(items as SidebarItem[]));
      }
    }

    // Build adjacency map: for each doc, find its siblings
    const adjacentMap: AdjacentPagesMap = {};

    for (const doc of allDocs) {
      adjacentMap[doc.docId] = [];

      // Issue #10 fix: Normalize path separators to forward slash for consistency
      // This ensures path.dirname works correctly on Windows with mixed separators
      const normalizedDocId = doc.docId.replace(/\\/g, '/');
      // Use path.dirname which properly handles path separators across platforms
      const docDirectory = normalizedDocId.includes('/')
        ? path.dirname(normalizedDocId).replace(/\\/g, '/')
        : '__root__';
      const adjacentDocs = allDocs
        .filter(other => {
          const normalizedOtherId = other.docId.replace(/\\/g, '/');
          const otherLastSlashIndex = normalizedOtherId.lastIndexOf('/');
          const otherDirectory = otherLastSlashIndex === -1 ? '__root__' : normalizedOtherId.substring(0, otherLastSlashIndex);
          // Same directory and not the same doc
          return otherDirectory === docDirectory && other.docId !== doc.docId;
        })
        .map(other => other.docId);

      adjacentMap[doc.docId] = adjacentDocs;
    }

    return adjacentMap;
  } catch (e: any) {
    console.warn(`[sidebar-parser] Could not parse sidebars: ${e.message}`);
    return {};
  }
}

export function getAdjacentPages(docId: string, adjacentMap: AdjacentPagesMap): string[] {
  return adjacentMap[docId] || [];
}
