---
name: metadata-extractor
description: >
  Extract and enrich page metadata (description, keywords, section type).
  Use when generating or updating page metadata for documentation.
tags: [documentation, metadata, extraction, zio, agent-skills]
---

# Metadata Extractor Skill

Documentation metadata extraction specialist. Generate or enhance page descriptions, keywords, and section classification.

## Input

Receive:
- **pageId** – Unique page identifier
- **pageTitle** – Current page title
- **pageContent** – Full page content (markdown)
- **existingDescription** – Optional existing description
- **existingKeywords** – Optional existing keywords array

## Task Flow

1. **Parse Page Content**
   - Extract H1 (main heading) if present
   - Identify major sections and concepts
   - Note code examples, API references, narrative structure

2. **Analyze Purpose**
   - Determine section type: reference, guide, tutorial, overview, or other
   - Section type based on content structure and tone:
     - **reference** – API docs, type definitions, method listings
     - **guide** – How-to instructions, best practices, patterns
     - **tutorial** – Step-by-step learning with examples
     - **overview** – Broad introductions, conceptual summaries
     - **other** – Miscellaneous content that doesn't fit above

3. **Generate Description**
   - If existingDescription provided, enrich or validate it
   - Otherwise, create new description (50-150 characters)
   - Describe what the page teaches/documents, not its filename or generic role
   - Use plain language, active voice
   - Examples:
     - ✓ "Manage concurrent operations and cancellation in ZIO"
     - ✓ "Core data structure for modeling errors in functional programs"
     - ✗ "Introduction to ZIO" (too generic)
     - ✗ "Overview of the ZIO library" (describes page role, not content)

4. **Generate Keywords**
   - Create 3-7 keywords for search/indexing
   - Include: primary concept, related concepts, alternative names
   - Use exact terms from page content when applicable
   - Examples:
     - "Fiber" page → ["Fiber", "concurrency", "scheduling", "lightweight threading"]
     - "ZLayer" page → ["ZLayer", "dependency injection", "resource management", "type-safe config"]
   - Avoid duplicating title or description text

## Rules

**Section Type Classification:**
- Examine structure: headings, code blocks, narrative flow
- Reference = Heavy API docs, type definitions, method tables
- Guide = Instructions with "when/how/why" + examples
- Tutorial = "Learn X by building Y" with step-by-step progression
- Overview = Conceptual intro without step-by-step
- Other = Doesn't fit neatly

**Description Quality:**
- Clear, standalone (readable without title)
- Specific to content, not metadata role
- 50-150 characters (short and punchy)
- Lead with key concept if present

**Keywords Quality:**
- 3-7 terms optimal (at least 3, avoid 10+)
- Lowercase unless proper name (ZIO, Fiber, ZLayer)
- Include synonyms and related concepts
- Match actual content, not aspirational terms

## Error Handling

**If content appears malformed:**
- Extract what structure is readable
- Default sectionType to "other"
- Generate conservative description

**If title is generic ("Overview", "Guide"):**
- Rely on content to inform description
- Don't just restate title

## Output

JSON only. No markdown/explanation.

```json
{
  "description": "string, 50-150 characters describing page purpose",
  "keywords": ["array", "of", "3-7", "keywords"],
  "sectionType": "reference | guide | tutorial | overview | other"
}
```

**Validation:**
- description must be non-empty string
- keywords must be array with 3-7 items
- sectionType must match picklist values
