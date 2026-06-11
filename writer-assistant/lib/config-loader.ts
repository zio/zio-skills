import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import { CrossrefConfig } from './schemas.js';
import type { CrossrefConfig as CrossrefConfigType } from './schemas.js';

const DEFAULTS: CrossrefConfigType = {
  excludePatterns: [],
  maxLinksPerPage: 10,
  maxSeeAlsoSuggestion: 5,
  confidenceThreshold: 'high',
  clearSuggestionsBeforeRun: false,
};

export function loadConfig(docsDir: string): CrossrefConfigType {
  // Issue #5 fix: Validate docsDir and resolve to real path before path traversal
  // This prevents symlinks and .. traversal from escaping intended scope
  let realDocsDir: string;
  try {
    realDocsDir = fs.realpathSync(docsDir);
  } catch (e: any) {
    console.warn(`[crossref] Could not resolve docsDir to real path, using defaults`);
    return DEFAULTS;
  }

  // Normalize the path traversal: go to parent directory and add config file
  const parentDir = path.dirname(realDocsDir);
  const configPath = path.join(parentDir, '.crossref-config.json');

  // Verify that the resolved config path is actually in the parent directory (security check)
  try {
    const realConfigPath = fs.realpathSync(configPath);
    const expectedParent = fs.realpathSync(parentDir);
    // Normalize paths for comparison (handle both forward slashes and backslashes on Windows)
    const normalizedConfigPath = path.normalize(realConfigPath);
    const normalizedParent = path.normalize(expectedParent);
    // Ensure config path is in the expected parent directory
    // Check: path starts with parent + separator, OR path exactly matches parent, OR is a direct child
    const isChildOfParent = normalizedConfigPath.startsWith(normalizedParent + path.sep);
    const isDirectChild = path.dirname(normalizedConfigPath) === normalizedParent;
    if (!isChildOfParent && !isDirectChild) {
      console.warn(`[crossref] Config path escapes expected scope, using defaults`);
      return DEFAULTS;
    }
  } catch (e: any) {
    // Only ignore if file doesn't exist (expected case)
    // Propagate permission errors and other legitimate failures
    if (e?.code !== 'ENOENT') {
      console.warn(`[crossref] Could not verify config path security (${e?.code}), using defaults`);
      return DEFAULTS;
    }
    // File doesn't exist - that's okay, we'll use defaults
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return { ...DEFAULTS, ...v.parse(CrossrefConfig, raw) };
  } catch (e: any) {
    if (e?.code !== 'ENOENT') {
      console.warn(`[crossref] Could not parse .crossref-config.json, using defaults`);
    }
    return DEFAULTS;
  }
}
