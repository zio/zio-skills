# Design: Modular Metadata Extraction for Crossref Agent

**Date:** 2026-06-06  
**Status:** Ready for Implementation  
**Goal:** Decompose metadata extraction into a reusable, standalone agent while maintaining backward compatibility with the crossref workflow.

---

## 1. Overview

### Problem

The `page-linker` agent currently handles two concerns:
1. **Metadata extraction** — Enrich pages with description, keywords, section type
2. **Link suggestion** — Generate cross-linking suggestions based on content analysis

These concerns are useful independently:
- Metadata extraction is useful for other documentation tools
- Link suggestion depends on metadata but doesn't need to extract it

**Current token cost:** ~5-6.5k tokens per page (includes metadata extraction via LLM tool)

### Solution

Decompose metadata extraction into a **standalone agent** (`metadata-extractor`) that:
- Can run independently to pre-enrich all docs
- Can be reused in other projects
- Reduces token usage in crossref workflow (when pre-enriched)
- Maintains backward compatibility (fallback extraction if metadata incomplete)

**Approach 1 token cost:** ~5.7-8.5k tokens per page (two separate agent invocations)  
**Mitigation:** Pre-run metadata extraction once; subsequent crossref runs use cached metadata (~3.5-4.5k tokens)

---

## 2. Architecture

### Entry Points

Two independent workflows:

#### 2.1 `extract-metadata` (Standalone)

**Purpose:** Independently walk docs, enrich all metadata, write back to files.

**Modes:**
- `all` — Process every page
- `missing` — Only pages without description or keywords (default)
- `file` — Single specific file

**Usage:**
```bash
# Pre-enrich all docs (one-time or periodic)
flue run extract-metadata --target node \
  --payload '{"docsDir":"./docs","mode":"all"}'

# Only enrich missing metadata
flue run extract-metadata --target node \
  --payload '{"docsDir":"./docs","mode":"missing"}'

# Fix one page
flue run extract-metadata --target node \
  --payload '{"docsDir":"./docs","mode":"file","targetFile":"reference/fiber.md"}'
```

**Output:**
- Updates frontmatter in-place for all processed pages
- Prints progress: `✓ Processed: PageTitle | Added: description, keywords`
- Summary: `Enriched N pages`

#### 2.2 `crossref` (Main Workflow)

**No external API change.** Modes (reindex, step, autopilot, report) work as today.

**Internal improvement:** `process.ts` checks if metadata is complete:
- **If complete:** Use frontmatter metadata directly (no metadata-agent call)
- **If incomplete:** Call metadata-agent as fallback (backward compatible)

**Recommended workflow:**
```bash
# Step 1: Pre-enrich metadata (once per project)
flue run extract-metadata --target node \
  --payload '{"docsDir":"./docs","mode":"all"}'

# Step 2: Run crossref (uses pre-enriched metadata)
flue run crossref --target node \
  --payload '{"docsDir":"./docs","mode":"autopilot"}'
```

---

## 3. Components

### 3.1 Metadata Extractor Agent

**File:** `agents/metadata-extractor.ts`

**Model:** Claude Haiku 4.5

**Input:**
```typescript
{
  pageId: string,              // Unique page identifier
  pageTitle: string,           // Page title (from frontmatter or H1)
  pageContent: string,         // Full page markdown
  existingDescription?: string,// Current description (if any)
  existingKeywords?: string[]  // Current keywords (if any)
}
```

**Output:**
```typescript
{
  description: string,         // 1-2 sentence summary
  keywords: string[],          // 3-7 relevant terms (lowercase)
  sectionType: SectionType     // reference|guide|tutorial|overview|other
}
```

**Skill:** `skills/metadata-extractor/SKILL.md` (new)

**Behavior:**
- Extracts meaningful metadata even from sparse content
- Respects existing metadata when present
- Handles edge cases (long descriptions, special characters, non-English content)
- Returns complete output; never partial

**Error handling:** If extraction fails, the calling workflow decides whether to skip or retry.

### 3.2 Page Linker Agent

**File:** `agents/page-linker.ts` — Modified

**Change:** Assume metadata is complete; remove optional `extract_page_metadata` tool call.

**Input:**
```typescript
{
  pageId: string,
  pageTitle: string,
  pageContent: string,
  pageMetadata: {
    description: string,
    keywords: string[],
    sectionType: SectionType
  },
  pageIndex: PageIndexEntry[],
  adjacentPages: PageIndexEntry[]
}
```

**Output:** Same as today (array of suggestions with confidence, type, reasoning)

**Behavior:** Unchanged; still generates inline and See Also suggestions based on content analysis.

### 3.3 Extract Metadata Workflow

**File:** `workflows/extract-metadata.ts` (new)

**Responsibilities:**
1. Walk docs directory (respecting `excludePatterns` from config)
2. For each page, determine if processing is needed (based on mode)
3. Call metadata-agent to extract metadata
4. Update page frontmatter with enriched metadata
5. Write updated page back to disk
6. Report progress and summary

**Modes:**

| Mode | Behavior |
|------|----------|
| `all` | Process every page |
| `missing` | Only pages where description is missing OR keywords are empty |
| `file` | Single specific file (requires `targetFile` payload) |

**Error handling:**
- Page unreadable → Warn, skip, continue
- metadata-agent fails → Warn, skip, continue
- Frontmatter update fails → Warn, skip, continue
- Partial output (missing keywords) → Accept partial, write what we have

**Output:** Summary report showing pages processed, skipped, and errors.

### 3.4 Process Batch Phase

**File:** `workflows/phases/process.ts` — Modified

**New logic:**

```typescript
for (const pageEntry of batch) {
  const pageContent = fs.readFileSync(pageEntry.absPath, 'utf-8');
  const frontmatter = parseFrontmatter(pageContent);
  
  // Check if metadata is complete
  const hasCompleteMetadata = 
    frontmatter.description && 
    Array.isArray(frontmatter.keywords) && 
    frontmatter.keywords.length > 0;
  
  let pageMetadata;
  
  if (hasCompleteMetadata) {
    // Use file metadata (fast path)
    pageMetadata = {
      description: frontmatter.description,
      keywords: frontmatter.keywords,
      sectionType: frontmatter.sectionType || 'other'
    };
  } else {
    // Fallback: extract metadata inline (rare case)
    console.log(`[DEBUG] Metadata incomplete for ${pageEntry.id}, extracting...`);
    pageMetadata = await session.run(metadataExtractor, {
      pageId: pageEntry.id,
      pageTitle: pageEntry.title,
      pageContent,
      existingDescription: frontmatter.description,
      existingKeywords: frontmatter.keywords
    });
  }
  
  // Call page-linker with complete metadata
  const suggestions = await session.run(pageLinkerAgent, {
    pageId: pageEntry.id,
    pageTitle: pageEntry.title,
    pageContent,
    pageMetadata,
    pageIndex: state.index,
    adjacentPages: getAdjacentPages(pageEntry)
  });
  
  // Existing validation, insertion, state save logic
  ...
}
```

**Key change:** Metadata is always complete before page-linker is called. page-linker never calls `extract_page_metadata` tool.

---

## 4. Data Flow

### Scenario: Pre-enriched Docs (Recommended)

```
1. ONE-TIME PRE-PROCESSING
   $ flue run extract-metadata --target node \
     --payload '{"docsDir":"./docs","mode":"all"}'
   
   For each page:
     - Load content
     - Call metadata-agent
     - Update frontmatter in file
     - Save
   
   Result: All pages have enriched metadata in frontmatter

2. CROSSREF WORKFLOW (Multiple runs)
   $ flue run crossref --target node \
     --payload '{"docsDir":"./docs","mode":"step","batchSize":5"}'
   
   For each page in batch:
     - Load content
     - Check: metadata complete? YES
     - Use frontmatter metadata (NO agent call)
     - Call page-linker with enriched data
     - Apply suggestions
     - Save state
   
   Result: Links generated efficiently (~3.5-4.5k tokens per page)
```

### Scenario: Fallback (On-Demand)

```
User runs crossref without pre-enrichment:

$ flue run crossref --target node \
  --payload '{"docsDir":"./docs","mode":"autopilot"}'

For each page:
  - Load content
  - Check: metadata complete? NO
  - Call metadata-agent (fallback extraction)
  - Call page-linker
  - Apply suggestions
  - Save state (metadata NOT written to file)

Result: Works, but slower (~5.7-8.5k tokens per page)
```

---

## 5. Integration

### 5.1 Standalone Use (Outside Crossref)

Other projects can run metadata extraction independently:

```bash
# For any Markdown docs project
flue run extract-metadata --target node \
  --payload '{"docsDir":"./other-project/docs","mode":"all"}'
```

This enriches metadata without touching link suggestions.

### 5.2 Library Export (Optional Future)

Metadata extraction can be exported as a reusable module:

```typescript
// lib/metadata-utils.ts
export async function enrichPageMetadata(
  pageId: string,
  pageContent: string,
  session: FlueSession
): Promise<EnrichedMetadata> {
  return session.run(metadataExtractor, {...});
}
```

Other Flue workflows can import and use this.

---

## 6. Error Handling

| Scenario | Behavior |
|----------|----------|
| extract-metadata: Page unreadable | Warn, skip page, continue |
| extract-metadata: metadata-agent fails | Warn, skip page, continue |
| extract-metadata: Frontmatter update fails | Warn, skip page, continue |
| extract-metadata: Partial output | Accept partial, write what we have |
| crossref (pre-enriched): Metadata incomplete | Should not happen; fallback extraction available |
| crossref (fallback): metadata-agent fails | Warn, skip link suggestion for page |
| crossref (fallback): Partial metadata | Use partial; page-linker adapts |

**Design decision:** Accept partial metadata (e.g., missing keywords). Don't treat as error. Page-linker can work with partial data.

---

## 7. Testing Strategy

### Unit Tests

- `tests/metadata-extraction.test.ts` — metadata-agent output validation
- `tests/yaml.test.ts` — Frontmatter update logic
- `tests/markdown-parser.test.ts` — Existing frontmatter parsing (no changes)

### Integration Tests

1. Extract metadata workflow with 5 fixture pages
2. Verify all pages have enriched frontmatter
3. Run crossref on pre-enriched pages
4. Verify page-linker called (no metadata-agent calls in process)
5. Test fallback: run crossref on non-enriched pages
6. Verify metadata-agent called as fallback
7. Metadata edge cases (long descriptions, emoji keywords, non-ASCII)

### End-to-End

1. Run `extract-metadata` on fixture docs
2. Verify frontmatter updated in all files
3. Run `crossref autopilot`
4. Verify links generated correctly
5. Verify token usage is reduced (pre-enriched vs. fallback)

---

## 8. Implementation Phases

### Phase 1: Metadata Extractor Agent (Minimal)
**Scope:** Create agent, skill, basic tests  
**Files:** `agents/metadata-extractor.ts`, `skills/metadata-extractor/SKILL.md`, `tests/metadata-extraction.test.ts`  
**Deliverable:** Agent can extract metadata from a single page

### Phase 2: Standalone Workflow
**Scope:** Create extract-metadata workflow, implement modes, file updates  
**Files:** `workflows/extract-metadata.ts`, test fixtures  
**Deliverable:** Can run `flue run extract-metadata` independently

### Phase 3: Integrate into Crossref
**Scope:** Modify process.ts, add metadata completeness check, test fallback  
**Files:** `workflows/phases/process.ts`, integration tests  
**Deliverable:** Crossref uses pre-enriched metadata when available

### Phase 4: Polish & Documentation
**Scope:** Update docs, examples, configuration  
**Files:** `README.md`, `ARCHITECTURE.md`, `AGENTS.md`  
**Deliverable:** Full documentation, examples, integration story

---

## 9. Configuration

No new configuration options required. Uses existing `.crossref-config.json`:

```json
{
  "excludePatterns": ["node_modules", ".github"],
  "maxLinksPerPage": 10,
  "confidenceThreshold": "high"
}
```

These settings apply to both `extract-metadata` and `crossref` workflows.

---

## 10. Backward Compatibility

✅ **Fully backward compatible**

- Existing `crossref` workflow works unchanged
- If metadata is incomplete, fallback extraction kicks in automatically
- page-linker agent interface unchanged (metadata is just always complete)
- No breaking changes to API or configuration

---

## 11. Success Criteria

- ✅ metadata-agent can extract metadata from any page
- ✅ extract-metadata workflow runs independently
- ✅ extract-metadata can pre-enrich all docs in a project
- ✅ crossref workflow uses pre-enriched metadata (no redundant extractions)
- ✅ Fallback extraction works if metadata incomplete
- ✅ All tests pass (unit + integration + end-to-end)
- ✅ Documentation is clear and complete
- ✅ Token consumption reduced for pre-enriched workflow
- ✅ No breaking changes to existing API

---

## Appendix: File Changes Summary

| File | Status | Change |
|------|--------|--------|
| `agents/metadata-extractor.ts` | New | Metadata agent |
| `skills/metadata-extractor/SKILL.md` | New | Metadata extraction skill |
| `workflows/extract-metadata.ts` | New | Standalone metadata workflow |
| `workflows/phases/process.ts` | Modify | Check metadata, fallback extraction |
| `agents/page-linker.ts` | Modify | Remove optional metadata extraction (optional) |
| `lib/yaml.ts` | Verify | Ensure frontmatter updates work reliably |
| `tests/metadata-extraction.test.ts` | New | Metadata agent tests |
| `tests/extract-metadata.test.ts` | New | Workflow tests |
| `README.md` | Update | Document metadata workflow |
| `ARCHITECTURE.md` | Update | Add metadata extraction diagram |
| `AGENTS.md` | Update | Document new workflow |

---

**Design Document Status:** ✅ Ready for User Review
