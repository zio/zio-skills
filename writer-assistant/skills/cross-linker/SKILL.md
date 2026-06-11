---
name: cross-linker
description: >
  Identify cross-linking opportunities in docs pages. Suggest inline links and
  "See Also" refs. Use when analyzing markdown for improved navigation.
tags: [documentation, linking, cross-reference, zio, agent-skills]
---

# Cross Linker Skill

Documentation cross-linking specialist. Identify where pages should link to each other.

## Input

Receive:
- **JSON index** - All pages (id, title, path)
- **Target page** - Full content to analyze
- **Adjacent pages** - Same section/directory
- **Helper tools** - Verify details, find related pages

## Task Flow

**Phase 1: Verify Metadata (PRE-ENRICHED)**
- Metadata is guaranteed complete before analysis starts
- All pages have `description`, `keywords`, and `sectionType` in YAML frontmatter
- No extraction tool needed; proceed directly to link identification

**Phase 2: Identify Refs**
- **Inline links** – Sentence mentions concept that another page covers
- **See Also** – Strongly related but not inline mentioned. PRIORITIZE adjacent pages

## Anchor Text

Pick shortest phrase (1-5 words):
- Appears exact in document
- Clear, standalone concept ("Exit", "ZLayer", "ZStream")
- Reads natural
- PREFER first occurrence

Rules:
- Inline links: match doc capitalization exactly
- See Also: Title Case ("Fiber", "Resource Management")
- Prose only (NOT headings/code blocks)
- Always validate with `search_page_content` before finalizing:
  - Verify anchor exists in prose (not heading, code, or frontmatter)
  - Check complete word (not "Ref" inside "careful")
  - Prefer earliest occurrence

Valid: "Exit" from "Exit value that the Scope is closed with" | "ZLayer" from "scoped resource into a ZLayer for..."
Bad: "Exit value that the Scope" (too long) | "Using a Scope" from heading (use prose instead)

## See Also Links

Format: `- [Term](./path.md) — brief description`

**Description is REQUIRED.** Always include 5-15 words explaining why the page is related.
- Examples: "Fiber management, core to ScopedRef" / "Base ref type without resource mgmt" / "Cancellation model for concurrent ops" / "Resource acquisition & lifecycle"
- Same section? Mention why it's relevant to current topic
- Code example? Explain what code concept it documents

Selection strategy:
- **Adjacent pages (same section)** – ALWAYS suggest. Technically relevant by location alone.
- **Non-adjacent pages** – Only if meaningfully discussed in content or clearly thematically relevant
- Don't link to self, respect existing links, no duplicates

Finding related pages:
- Content mentions a concept? Link to it even if just passing mention
- Adjacent pages = same section/directory = ALWAYS HIGH confidence
- Code blocks contain valuable clues: identifiers like `forkScoped`, `FiberRef.make`, `ZIO.scoped` suggest related pages
  - Example: `ZIO.acquireRelease` → suggest resource management pages
  - Inline links use prose; See Also can reference code concepts

## Confidence Levels

**HIGH** – central to page (title/intro/headings), first mention, or adjacent pages (proximity = relevance)

**MEDIUM** – discussed in dedicated section or multiple times (non-adjacent pages only)

**LOW** – passing mention or tangential only (non-adjacent pages only)

## Helper Tools

Optional. Use to verify or find related pages. Most decisions from content + index alone.

**search_pages** - Query index by title/keywords/topic. Top 5 matches.
- When: Find topic pages without manual browse
- Ex: "config pages" → 5 most relevant

**search_page_content** - Find terms in page. Context snippets with line numbers. FOR ANCHOR VALIDATION.
- When: BEFORE finalizing anchor—verify phrase exists in prose
- Critical: "Ref" complete word (not in "careful")?
- Critical: "Scope" in prose (not heading)?
- Optional: Verify concept discussed before linking
- Ex: "Where's ZIO.acquireRelease?" → snippets + line numbers

**validate_anchor** - Check if anchor/heading exists. Returns available headings.
- When: Linking method/operator names needing anchors
- Ex: "Runtime.setConfigProvider heading?" → check first

**extract_page_structure** - Get full heading structure (TOC).
- When: Understand page org before See Also
- Ex: "What sections?"

**get_adjacent_pages** - All pages in same section. Good See Also candidates.
- When: Find same-topic pages
- Ex: "Other ZStream pages in section?"

## Error Handling

When tools fail or return no results:
- **search_pages** – Skip that search; use index alone
- **search_page_content** – Don't suggest link; find different phrase or skip
- **Page unreadable** – Skip links to it; report in reasoning if critical

## Requirements & Priorities

**Hard rules:**
- No self-links, no existing links
- Max 10 total suggestions (maxLinksPerPage) – don't pad to hit limit

**Quality first:**
- Prioritize 3-5 high-confidence links over 10 speculative ones
- Suggest only links you can validate with tools
- Adjacent pages first (always relevant by proximity)
- Exact anchor text matches (must exist in document)
- Short phrases (1-3 words ideal)
- First mentions (link where readers first encounter concepts)

## Output

JSON only. No markdown/explanation.

```json
{
  "suggestions": [
    {
      "targetId": "id from index",
      "targetTitle": "string",
      "anchorText": "1-5 words, EXACT from doc",
      "description": "REQUIRED for see_also; optional for inline",
      "type": "inline | see_also",
      "confidence": "high | medium | low",
      "reasoning": "one sentence"
    }
  ]
}
```

**Note:** See Also suggestions without descriptions will be skipped during processing.

