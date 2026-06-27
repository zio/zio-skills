---
name: docs-integrate
description: Integration checklist for new ZIO docs pages. Handles sidebar wiring, index.md linking, and compilation gate (mdoc + Docusaurus build). Cross-referencing is handled separately by the integrate workflow (Phase 2).
tags: [documentation, integration, docusaurus, zio, writer-assistant]
allowed-tools: Read, Edit, Glob, Grep, Bash(git:*), run_mdoc, build_website
---

# Docs Integration Checklist

After writing new doc page (ref page, tutorial, how-to), complete all steps.

## Step 1: Add to `sidebars.js`

Add page `id` to `docs/sidebars.js`. Correct category:

- **Ref pages** → `"Reference"` category, alphabetical/logical order
- **How-to guides** → `"Guides"` category. Missing category → append new entry to `sidebars.docs` array
- **Tutorials** → `"Tutorials"` category. Missing → append

Example — Guides category appended:

```javascript
// docs/sidebars.js
module.exports = {
  docs: [
    "index",
    {
      type: "category",
      label: "Reference",
      items: [
        "reference/chunk",
        "reference/schema",
        // ... existing reference pages
      ],
    },
    // 👇 NEW category, added by this step
    {
      type: "category",
      label: "Guides",
      items: [
        "guides/guide-id-here",
      ],
    },
  ],
};
```

Verify parses:

```bash
node -e "require('./docs/sidebars.js')" && echo "✓ sidebars.js is valid"
```

Syntax error → revert + retry. Malformed sidebar → Docusaurus fails to start.

## Step 2: Update `docs/index.md`

Add link under correct section:

- Ref pages → "Reference Documentation" heading
- Guides → "Guides" heading (create after ref section if missing)
- Tutorials → "Tutorials" heading (create if missing)

## Step 3: Verify Compilation + Links (Mandatory Gate)

**Mandatory gate.** All code examples compile-checked via mdoc.

### Check Relative Links + Compile

- Internal links → relative paths: `[TypeName](./type-name.md)`
- Anchor links → match heading text (Docusaurus converts to lowercase kebab-case)
- Call `run_mdoc` tool with the new page path:

```
run_mdoc({ paths: ["<path-to-new-page>"] })
```

Returns `{ success, errorCount, errors[] }`. Do **not** commit if `success: false`. Fix each entry in `errors[]` → re-call `run_mdoc` → repeat until `success: true`.

### Verify Full Site Build

After mdoc passes, call `build_website` tool:

```
build_website({})
```

Returns `{ success, errorCount, errors[] }`. Do **not** commit if `success: false`. Fix each entry in `errors[]` → re-call `build_website` → repeat until `success: true`.
