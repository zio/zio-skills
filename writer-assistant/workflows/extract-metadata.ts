import * as v from 'valibot';
import 'dotenv/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineWorkflow } from '@flue/runtime';
import metadataExtractorAgent from '../agents/metadata-extractor.js';
import { loadConfig } from '../lib/config-loader.js';
import { parseFrontmatter } from '../lib/markdown-parser.js';
import { hasCompleteMetadata } from '../lib/metadata-extractor-utils.js';
import { extractMetadata } from './utils/metadata-utilities.js';

/**
 * Recursively walk docs directory and return list of markdown/mdx files.
 * Respects excludePatterns from config.
 */
function walkDocs(docsDir: string, excludePatterns: string[]): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    let entries: any[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e: any) {
      console.warn(`[extract-metadata] Skipping unreadable directory ${dir}: ${e.message}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const rel = path.relative(docsDir, fullPath);

      // Skip excluded patterns
      if (excludePatterns.some((p) => rel.includes(p))) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      // Include .md and .mdx files
      if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  walk(docsDir);
  return results;
}

/**
 * Walk a specific directory recursively and return markdown files
 */
function walkDir(targetDir: string, docsDir: string, excludePatterns: string[]): string[] {
  const results: string[] = [];

  // Resolve and validate target directory
  let realDocsDir: string;
  let realTargetDir: string;

  try {
    realDocsDir = fs.realpathSync(docsDir);
  } catch {
    console.error(`[extract-metadata] Docs directory not accessible: ${docsDir}`);
    return [];
  }

  const normalizedTarget = path.isAbsolute(targetDir)
    ? targetDir
    : path.resolve(docsDir, targetDir);

  try {
    realTargetDir = fs.realpathSync(normalizedTarget);
  } catch {
    console.error(`[extract-metadata] Target directory not accessible: ${targetDir}`);
    return [];
  }

  // Verify target is within docs directory
  if (!realTargetDir.startsWith(realDocsDir + path.sep) && realTargetDir !== realDocsDir) {
    console.error(`[extract-metadata] Target directory is outside docsDir: ${targetDir}`);
    return [];
  }

  // Walk the target directory
  function walk(dir: string) {
    let entries: any[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e: any) {
      console.warn(`[extract-metadata] Skipping unreadable directory ${dir}: ${e.message}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const rel = path.relative(docsDir, fullPath);

      // Skip excluded patterns
      if (excludePatterns.some((p) => rel.includes(p))) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      // Include .md and .mdx files
      if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  walk(realTargetDir);
  return results;
}

/**
 * Determine if a page needs metadata extraction based on mode.
 *
 * Modes:
 * - 'all': extract for all pages
 * - 'missing': (default) extract only for pages without complete metadata
 * - 'file': extract only for specific file (handled by caller)
 * - 'dir': extract for all pages in target directory
 */
function needsExtraction(
  mode: 'all' | 'missing' | 'file' | 'dir',
  metadata: { description?: string; keywords?: string[] } | null
): boolean {
  if (mode === 'all' || mode === 'dir') return true;
  if (mode === 'missing') return !hasCompleteMetadata(metadata || {});
  return false; // 'file' mode handled separately
}

export default defineWorkflow({
  agent: metadataExtractorAgent,
  input: v.looseObject({}),
  run: extractMetadataRun as (ctx: any) => any,
});

async function extractMetadataRun({ harness, input }: { harness: any; input: any }) {
  const {
    docsDir,
    mode = 'missing',
    targetFile,
    targetDir,
  } = input as {
    docsDir: string;
    mode?: 'all' | 'missing' | 'file' | 'dir';
    targetFile?: string;
    targetDir?: string;
  };

  if (!docsDir) throw new Error('input.docsDir is required');

  const session = await harness.session('extract-metadata');

  const config = loadConfig(docsDir);

  // Collect files to process
  let files: string[] = [];

  if (targetFile) {
    // Process specific file
    const normalizedTarget = path.isAbsolute(targetFile)
      ? targetFile
      : path.resolve(docsDir, targetFile);
    let realTarget: string;
    try {
      realTarget = fs.realpathSync(normalizedTarget);
    } catch {
      console.error(`[extract-metadata] Target file not accessible: ${targetFile}`);
      return { processed: 0, skipped: 0, errors: 1 };
    }

    let realDocsDir: string;
    try {
      realDocsDir = fs.realpathSync(docsDir);
    } catch {
      console.error(`[extract-metadata] Docs directory not accessible: ${docsDir}`);
      return { processed: 0, skipped: 0, errors: 1 };
    }

    // Verify file is within docs directory
    if (!realTarget.startsWith(realDocsDir + path.sep) && realTarget !== realDocsDir) {
      console.error(`[extract-metadata] Target file is outside docsDir: ${targetFile}`);
      return { processed: 0, skipped: 0, errors: 1 };
    }

    // Verify it's a markdown file
    if (!/\.(md|mdx)$/.test(realTarget)) {
      console.error(`[extract-metadata] Target file is not markdown: ${targetFile}`);
      return { processed: 0, skipped: 0, errors: 1 };
    }

    files = [realTarget];
  } else if (targetDir) {
    // Process all files in target directory recursively
    console.log(`[extract-metadata] Walking directory: ${targetDir}`);
    files = walkDir(targetDir, docsDir, config.excludePatterns);
    if (files.length === 0) {
      console.error(`[extract-metadata] No markdown files found in directory: ${targetDir}`);
      return { processed: 0, skipped: 0, errors: 1 };
    }
    console.log(`[extract-metadata] Found ${files.length} markdown files in ${targetDir}`);
  } else {
    // Walk docs directory and collect files
    files = walkDocs(docsDir, config.excludePatterns);
    console.log(`[extract-metadata] Found ${files.length} markdown files`);
  }

  if (files.length === 0) {
    console.log('[extract-metadata] No files to process');
    return { processed: 0, skipped: 0, errors: 0 };
  }

  // Process files
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const absPath of files) {
    let content: string;
    try {
      content = fs.readFileSync(absPath, 'utf-8');
    } catch (e: any) {
      console.warn(`[extract-metadata] Skipping unreadable file ${absPath}: ${e.message}`);
      errors++;
      continue;
    }

    const rel = path.relative(docsDir, absPath);
    const pageId = rel.replace(/\.(md|mdx)$/, '').replace(/\\/g, '/');

    // Parse existing frontmatter
    const fm = parseFrontmatter(content);
    const existingMetadata = {
      description: fm.description,
      keywords: fm.keywords,
    };

    // Determine which mode is active
    // When targetFile/targetDir provided, use their scope ('dir') but respect explicit mode for extraction decision
    const activeMode = targetDir ? 'dir' : (mode as 'all' | 'missing');

    // Check if extraction is needed
    if (!needsExtraction(activeMode, existingMetadata)) {
      console.log(`[extract-metadata] Skipping ${pageId} (has complete metadata)`);
      skipped++;
      continue;
    }

    // Extract title for logging
    const h1Match = content.match(/^# (.+)$/m);
    const title = h1Match?.[1]?.trim() || fm.title || path.basename(absPath, path.extname(absPath));

    // Call metadata extractor utility
    try {
      console.log(`[extract-metadata] Extracting metadata for ${pageId}...`);

      const result = await extractMetadata(
        { id: pageId, title, path: rel, absPath },
        content,
        session
      );

      fs.writeFileSync(absPath, result.updatedContent, 'utf-8');

      console.log(`[extract-metadata] ✓ Extracted and wrote metadata for ${pageId}`);
      processed++;
    } catch (e: any) {
      console.warn(`[extract-metadata] Failed to extract metadata for ${pageId}: ${e.message}`);
      errors++;
    }
  }

  // Summary
  const total = processed + skipped + errors;
  console.log(
    `\n[extract-metadata] Complete. Processed: ${processed}/${total}, Skipped: ${skipped}, Errors: ${errors}`
  );

  return { processed, skipped, errors };
}
