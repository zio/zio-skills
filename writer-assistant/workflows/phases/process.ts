import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v from 'valibot';
import type { FlueSession } from '@flue/runtime';
import { loadConfig } from '../../lib/config-loader.js';
import { saveState } from '../../lib/state-store.js';
import {
  extractCodeBlockIdentifiers,
  parseFrontmatter,
  computeSafeZones,
} from '../../lib/markdown-parser.js';
import { validateSuggestion, hasAnchorInTarget } from '../utils/link-validator.js';
import {
  insertInlineLink,
  insertSeeAlsoEntry,
  findAnchorWithFallback,
} from '../utils/link-inserter.js';
import { createValidateAnchor } from '../../tools/validate_anchor.js';
import { createExtractPageStructure } from '../../tools/extract_page_structure.js';
import { createGetAdjacentPages } from '../../tools/get_adjacent_pages.js';
import { createSearchPages } from '../../tools/search_pages.js';
import { createSearchPageContent } from '../../tools/search_page_content.js';
import {
  PageAnalysisOutput,
  type CrossrefState,
  type LinkSuggestion,
} from '../../lib/schemas.js';
import { updateFrontmatter } from '../utils/yaml.js';
import { extractMetadata } from '../utils/metadata-utilities.js';
import { estimateCost } from '../utils/cost.js';
import { meetsThreshold } from '../utils/confidence.js';
import { printIterationSummary } from './report.js';
import { hasCompleteMetadata } from '../../lib/metadata-extractor-utils.js';
import type { MetadataExtractorInput } from '../../lib/schemas.js';

export async function processBatch(
  state: CrossrefState,
  config: ReturnType<typeof loadConfig>,
  session: FlueSession,
  batchSize: number,
  docsDir: string,
  targetFile?: string,
  targetDir?: string
): Promise<{ done: boolean; processed: number; remaining: number }> {
  let batch;

  if (targetFile) {
    const normalizedTarget = path.isAbsolute(targetFile) ? targetFile : path.resolve(docsDir, targetFile);
    let realDocsDir: string;
    try {
      realDocsDir = fs.realpathSync(docsDir);
    } catch {
      console.warn(`[crossref] Docs directory not accessible: ${docsDir}`);
      return { done: false, processed: 0, remaining: state.index.length };
    }
    let realTarget: string;
    try {
      realTarget = fs.realpathSync(normalizedTarget);
    } catch {
      console.warn(`[crossref] Target file not accessible: ${targetFile}`);
      return { done: false, processed: 0, remaining: state.index.length };
    }
    if (!realTarget.startsWith(realDocsDir + path.sep) && realTarget !== realDocsDir) {
      console.warn(`[crossref] Target file is outside docsDir: ${targetFile}`);
      return { done: false, processed: 0, remaining: state.index.length };
    }
    const normalizedTargetForLookup = path.normalize(normalizedTarget);
    const targetEntry = state.index.find(e => {
      const normalizedAbsPath = path.normalize(e.absPath);
      return normalizedAbsPath === normalizedTargetForLookup;
    });

    if (!targetEntry) {
      console.warn(`[crossref] Target file not found in index: ${targetFile}`);
      console.warn(`[crossref] Available files: ${state.index.map(e => e.path).join(', ')}`);
      return { done: false, processed: 0, remaining: state.index.length };
    }

    batch = [targetEntry];
  } else if (targetDir) {
    let normalizedDir = path.isAbsolute(targetDir) ? targetDir : path.resolve(docsDir, targetDir);
    let realDocsDir: string;
    try {
      realDocsDir = fs.realpathSync(docsDir);
    } catch {
      console.warn(`[crossref] Docs directory not accessible: ${docsDir}`);
      return { done: false, processed: 0, remaining: state.index.length };
    }
    let realTargetDir: string;
    try {
      realTargetDir = fs.realpathSync(normalizedDir);
    } catch {
      console.warn(`[crossref] Target directory not accessible: ${targetDir}`);
      return { done: false, processed: 0, remaining: state.index.length };
    }
    if (!realTargetDir.startsWith(realDocsDir + path.sep) && realTargetDir !== realDocsDir) {
      console.warn(`[crossref] Target directory is outside docsDir: ${targetDir}`);
      return { done: false, processed: 0, remaining: state.index.length };
    }
    normalizedDir = normalizedDir.replace(/[/\\]$/, '');
    const filesInDir = state.index.filter(e => {
      return e.absPath.startsWith(normalizedDir + path.sep);
    });

    if (filesInDir.length === 0) {
      console.warn(`[crossref] No files found in target directory: ${targetDir}`);
      console.warn(`[crossref] Indexed directories: ${new Set(state.index.map(e => path.dirname(e.path))).size} found`);
      return { done: false, processed: 0, remaining: state.index.length };
    }

    batch = filesInDir.slice(0, batchSize);
  } else {
    const unprocessed = state.index.filter(e => !state.processed.includes(e.id));
    if (unprocessed.length === 0) return { done: true, processed: 0, remaining: 0 };
    batch = unprocessed.slice(0, batchSize);
  }

  const initialStateSuggestions = [...state.suggestions];
  if (targetFile || config.clearSuggestionsBeforeRun) {
    const batchIds = new Set(batch.map(e => e.id));
    const beforeCount = state.suggestions.length;

    if (targetFile) {
      state.suggestions = state.suggestions.filter(
        s => !batchIds.has(s.sourceId)
      );
    } else {
      state.suggestions = state.suggestions.filter(
        s => !batchIds.has(s.sourceId) && !batchIds.has(s.targetId)
      );
    }

    const clearedCount = beforeCount - state.suggestions.length;
    if (clearedCount > 0) {
      console.log(`[DEBUG] Cleared ${clearedCount} suggestions for ${batchIds.size} files being re-processed`);
    }
  }

  for (const pageEntry of batch) {
    let pageContent = fs.readFileSync(pageEntry.absPath, 'utf-8');

    // Metadata completeness check with fallback extraction
    const pageFrontmatter = parseFrontmatter(pageContent);
    let pageMetadata = {
      description: pageFrontmatter.description,
      keywords: pageFrontmatter.keywords,
    };

    // Fast path: use existing metadata if complete
    if (!hasCompleteMetadata(pageMetadata)) {
      // Fallback: extract metadata if incomplete
      try {
        console.log(`[crossref] Extracting metadata for ${pageEntry.id} (incomplete)`);
        const result = await extractMetadata(pageEntry, pageContent, session);
        pageContent = result.updatedContent;
        pageMetadata = result.metadata;
        pageEntry.description = result.metadata.description;
        pageEntry.keywords = result.metadata.keywords;
      } catch (e) {
        console.warn(`[crossref] Failed to extract metadata for ${pageEntry.id}:`, e);
      }
    } else {
      // Fast path: metadata is complete, use from frontmatter
      console.log(`[crossref] Using existing metadata for ${pageEntry.id} (complete)`);
    }

    const minimalIndex = state.index.map(e => ({
      id: e.id,
      title: e.contextualTitle ?? e.title,
      path: e.path,
    }));
    const indexJson = JSON.stringify(minimalIndex);

    const pageList = state.index
      .map(e => `${e.id} — ${e.contextualTitle ?? e.title}`)
      .join('\n');

    const adjacentPagesInfo = pageEntry.adjacentPages.length > 0
      ? `\nAdjacent pages (same documentation section): ${pageEntry.adjacentPages.join(', ')}`
      : '';

    const codeBlockTerms = extractCodeBlockIdentifiers(pageContent);
    const codeBlockContext = codeBlockTerms.length > 0
      ? `\nTechnical terms found in code blocks (use for See Also suggestions): ${codeBlockTerms.join(', ')}`
      : '';

    const prompt = `Analyze the page content below for cross-link opportunities.
Config: maxLinksPerPage=${config.maxLinksPerPage}, maxSeeAlsoSuggestion=${config.maxSeeAlsoSuggestion}

Page index (all available pages):
${pageList}

Structured index (JSON):
${indexJson}
${adjacentPagesInfo}
${codeBlockContext}

When generating suggestions:
- For INLINE links: anchorText is the text to search for within this page (e.g., "ZIO", "TRef", "STM.atomically")
  - ONLY link bare names, methods, types, or operators WITHOUT arguments/parentheses
  - NEVER suggest inline links for function calls with arguments (e.g., "Ref.make(0)", "foo(x, y)")
  - Bare names/methods are fine: "Ref.make", "List.map", "Option", "assertEqual"
- For SEE ALSO links: anchorText must be the page title from the index above (use the title shown in the page list)
- Always provide a non-empty anchorText for See Also suggestions
- Use code block technical terms to identify related pages
- Example: If code shows ZIO.acquireRelease, suggest resource management/acquire-release pages
- Prefer pages that document these code concepts

Page being analyzed (id: ${pageEntry.id}):
${pageContent}`;

    const tools = [
      createValidateAnchor(state),
      createExtractPageStructure(state),
      createGetAdjacentPages(state),
      createSearchPages(state),
      createSearchPageContent(state),
    ];
    const taskResult = await session.prompt(prompt, {
      result: PageAnalysisOutput,
      tools,
    });

    let output: v.InferOutput<typeof PageAnalysisOutput>;
    try {
      output = taskResult.data;
    } catch (e) {
      console.warn(`[crossref] Failed to parse response for ${pageEntry.id}:`, e);
      state.processed.push(pageEntry.id);
      continue;
    }

    const seeAlsoTargets = output.suggestions
      .filter(s => s.type === 'see_also')
      .map(s => state.index.find(e => e.id === s.targetId))
      .filter((e): e is typeof state.index[0] => !!e);

    if (seeAlsoTargets.length > 0) {
      console.log(`[crossref] Extracting metadata for ${seeAlsoTargets.length} See Also targets`);
    }

    for (const target of seeAlsoTargets) {
      try {
        const targetContent = fs.readFileSync(target.absPath, 'utf-8');
        const result = await extractMetadata(target, targetContent, session);
        target.description = result.metadata.description;
        target.keywords = result.metadata.keywords;

        output.suggestions
          .filter(s => s.type === 'see_also' && s.targetId === target.id)
          .forEach(s => s.description = result.metadata.description);
      } catch (e) {
        console.warn(`[crossref] Failed to extract metadata for ${target.id}:`, e);
      }
    }

    const newSuggestions: LinkSuggestion[] = [];
    console.log(`[DEBUG] Output has ${output.suggestions.length} suggestions`);
    for (const raw of output.suggestions) {
      const targetEntry = state.index.find(e => e.id === raw.targetId);
      if (!targetEntry) {
        console.log(`[DEBUG] Skipping suggestion (target not in index): ${raw.targetId}`);
        continue;
      }

      if (!raw.anchorText || raw.anchorText.trim() === '') {
        console.log(`[DEBUG] Skipping suggestion (empty anchorText): ${raw.targetId}`);
        continue;
      }

      // Don't suggest inline links for function calls with arguments (e.g., "Ref.make(0)", "foo(x, y)")
      if (raw.type === 'inline' && /\(.*\)/.test(raw.anchorText)) {
        console.log(`[DEBUG] Skipping suggestion (function call with arguments): ${raw.anchorText}`);
        continue;
      }

      let targetRelativePath = path.relative(
        path.dirname(pageEntry.absPath),
        targetEntry.absPath
      );
      targetRelativePath = targetRelativePath.replace(/\\/g, '/').replace(/\/+/g, '/');

      const alreadyExists = initialStateSuggestions.some(
        s => s.sourceId === pageEntry.id && s.targetId === raw.targetId
      );
      if (alreadyExists) {
        console.log(`[DEBUG] Skipping suggestion (already exists in state): ${raw.targetId}`);
        continue;
      }

      console.log(`[DEBUG] Adding suggestion to newSuggestions: ${raw.targetId} (${raw.type}, ${raw.confidence})`);
      newSuggestions.push({
        sourceId: pageEntry.id,
        targetId: raw.targetId,
        targetTitle: raw.targetTitle,
        targetRelativePath,
        anchorText: raw.anchorText,
        description: raw.description,
        type: raw.type,
        confidence: raw.confidence,
        reasoning: raw.reasoning,
        status: 'pending',
      });
    }

    state.suggestions.push(...newSuggestions);
    state.processed.push(pageEntry.id);

    const usage = (taskResult as any).usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    state.tokens.inputTotal += usage.input ?? 0;
    state.tokens.outputTotal += usage.output ?? 0;
    state.tokens.runningCost = estimateCost(state.tokens.inputTotal, state.tokens.outputTotal);

    let thisApplied = 0;
    let thisQueued = 0;
    let currentContent = pageContent;
    const processedTargets = new Set<string>();

    const existingHighConfidence = state.suggestions.filter(
      s => s.sourceId === pageEntry.id &&
           s.status === 'pending' &&
           s.confidence === 'high'
    );
    const suggestionsToProcess = [
      ...newSuggestions,
      ...existingHighConfidence.map(s => ({ ...s }))
    ];
    console.log(`[DEBUG] suggestionsToProcess has ${suggestionsToProcess.length} total (${newSuggestions.length} new + ${existingHighConfidence.length} existing high-confidence)`);

    for (const processedSuggestion of suggestionsToProcess) {
      if (processedTargets.has(processedSuggestion.targetId)) {
        console.log(`[DEBUG] Skipping duplicate target: ${processedSuggestion.targetId} (already processed first occurrence)`);
        processedSuggestion.status = 'skipped';
        continue;
      }
      console.log(`[DEBUG] Processing suggestion: ${processedSuggestion.anchorText} (${processedSuggestion.type}, ${processedSuggestion.confidence})`);

      if (!meetsThreshold(processedSuggestion.confidence, config.confidenceThreshold)) {
        console.log(`[DEBUG]   → Below confidence threshold (${processedSuggestion.confidence} < ${config.confidenceThreshold})`);
        thisQueued++;
        continue;
      }
      console.log(`[DEBUG]   → Meets confidence threshold`);

      processedTargets.add(processedSuggestion.targetId);

      const safeZonesWithInlineCode = computeSafeZones(currentContent, { includeInlineCode: false });
      console.log(`[DEBUG]   → Safe zones: ${safeZonesWithInlineCode.length} zones (with inline code protection)`);

      const validation = validateSuggestion(processedSuggestion, currentContent, docsDir, pageEntry.absPath);
      console.log(`[DEBUG]   → Validation: ${validation.ok ? 'PASS' : 'FAIL'} ${validation.ok ? '' : `(${validation.reason})`}`);

      if (!validation.ok) {
        processedSuggestion.status = 'skipped';
        console.warn(`  ⚠ Skipped (${validation.reason}): ${processedSuggestion.sourceId} → ${processedSuggestion.targetId}`);
        continue;
      }

      if (processedSuggestion.confidence === 'medium' && processedSuggestion.type === 'inline') {
        const anchorMatch = findAnchorWithFallback(currentContent, processedSuggestion.anchorText, 0, safeZonesWithInlineCode);
        if (anchorMatch) {
          processedSuggestion.confidence = 'high';
          console.log(`[DEBUG]   → ↑ Promoted to high-confidence (anchor text found)`);
        }
      }

      if (processedSuggestion.type === 'inline' && (processedSuggestion.anchorText.includes('.') || processedSuggestion.anchorText.includes('#'))) {
        console.log(`[DEBUG]   → Checking anchor for method/operator: ${processedSuggestion.anchorText}`);
        const targetEntry = state.index.find(e => e.id === processedSuggestion.targetId);
        if (targetEntry) {
          const hasAnchor = hasAnchorInTarget(targetEntry.absPath, processedSuggestion.anchorText);
          console.log(`[DEBUG]     → Has anchor: ${hasAnchor}`);
          if (!hasAnchor) {
            processedSuggestion.status = 'skipped';
            console.warn(`  ⚠ Skipped (no anchor): ${processedSuggestion.anchorText} in ${targetEntry.title}`);
            continue;
          }
        } else {
          console.log(`[DEBUG]     → Target entry not found`);
        }
      }

      let inserted = false;
      if (processedSuggestion.type === 'inline') {
        console.log(`[DEBUG]   → Attempting inline link insertion for "${processedSuggestion.anchorText}"`);
        const r = insertInlineLink(currentContent, processedSuggestion.anchorText, processedSuggestion.targetRelativePath, safeZonesWithInlineCode);
        console.log(`[DEBUG]     → Result: inserted=${r.inserted}, reason=${r.reason || 'none'}`);
        if (r.inserted) {
          currentContent = r.result;
          inserted = true;
          console.log(`[DEBUG]     → Content updated, new length=${currentContent.length}`);
        }
        else console.warn(`  ⚠ Could not insert inline link: ${r.reason}`);
      } else {
        if (!processedSuggestion.description) {
          console.log(`[DEBUG]   → Skipping see-also (missing required description)`);
          processedSuggestion.status = 'skipped';
          continue;
        }
        console.log(`[DEBUG]   → Attempting see-also insertion for "${processedSuggestion.anchorText}"`);
        const r = insertSeeAlsoEntry(currentContent, processedSuggestion.anchorText, processedSuggestion.targetRelativePath, processedSuggestion.description, safeZonesWithInlineCode);
        console.log(`[DEBUG]     → Result: inserted=${r.inserted}, reason=${r.reason || 'none'}`);
        if (r.inserted) {
          currentContent = r.result;
          inserted = true;
          console.log(`[DEBUG]     → Content updated, new length=${currentContent.length}`);
        }
      }

      if (inserted) {
        processedSuggestion.status = 'applied';
        thisApplied++;
        console.log(`[DEBUG]   → APPLIED (total applied: ${thisApplied})`);
      } else {
        processedSuggestion.status = 'skipped';
        console.log(`[DEBUG]   → SKIPPED`);
      }

      const originalSuggestion = state.suggestions.find(
        s => s.sourceId === processedSuggestion.sourceId &&
             s.targetId === processedSuggestion.targetId
      );
      if (originalSuggestion) {
        originalSuggestion.status = processedSuggestion.status;
        originalSuggestion.confidence = processedSuggestion.confidence;
      }
    }

    if (currentContent !== pageContent) {
      fs.writeFileSync(pageEntry.absPath, currentContent, 'utf-8');
    }

    const remaining = state.index.filter(e => !state.processed.includes(e.id)).length;
    printIterationSummary(
      pageEntry.title,
      state.processed.length,
      state.index.length,
      thisApplied,
      thisQueued,
      usage.input ?? 0,
      usage.output ?? 0,
      state.tokens.inputTotal,
      state.tokens.outputTotal,
      state.tokens.runningCost
    );

    saveState(docsDir, state);
  }

  const remaining = state.index.filter(e => !state.processed.includes(e.id)).length;
  return { done: remaining === 0, processed: batch.length, remaining };
}
