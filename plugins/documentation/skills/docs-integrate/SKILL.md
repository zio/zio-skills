---
name: docs-integrate
description: Shared integration checklist for new ZIO library documentation pages. Include after writing any new reference page or how-to guide to ensure it is wired into the site navigation.
allowed-tools: Read, Edit, Glob, Grep, Bash(git:*)
---

# Documentation Integration Checklist

After writing a new documentation page (reference page or how-to guide), complete these steps to
integrate it into the Docusaurus site.

## Step 1: Add to `sidebars.js`

**Edit the git-tracked file, not a build artifact.** Find it with `git ls-files "*sidebars.js"` — that
path is the one to edit (typically `docs/sidebars.js`). Never `website/docs/sidebars.js`: that copy is
mdoc's own output, gitignored, and an edit there ships nothing — the build regenerates it and silently
discards your change.

Add the page's `id` to the sidebar in the git-tracked file. Every ZIO project's sidebar keeps its
sections in this order, top to bottom:

1. **Introduction**: `index`, the plain first item of the top-level `sidebar` array, labelled
   "Introduction" through its `sidebar_label`. It is never the parent category of the other sections:
   Getting Started, Reference and the rest are its siblings.
2. **Getting Started**: `getting-started`, the first item.
3. **Concepts** (optional): explanation pages, the "why" (design, trade-offs, differences between
   versions, performance, security), with an `explanation/index` landing page as the category's
   `link`. If the section exists, it comes directly after Getting Started; explanation pages never sit
   inside Reference.
4. **Reference**: directly after Concepts, or after Getting Started when there is no Concepts
   section. Holds every feature or topic page and every API reference page, and only reference
   material: worked recipes belong in How-to Guides and rationale in Concepts. With more than about
   8 pages, nest them in categories by topic, each topic page next to its API reference page.
5. **Integrations** (optional): pages that connect the library to other libraries or systems
   (backends, bridges, framework modules). If the section exists, it is its own category placed
   before Tutorials and How-to Guides, never nested inside Reference.
6. **Tutorials**: always directly before How-to Guides.
7. **How-to Guides**.

No other top-level sections: topic groups belong inside Reference.

Place the new page by its type:

- **Explanation pages**: under `"Concepts"`.
- **Reference pages**: under `"Reference"`, inside the topic category that fits if Reference is
  nested, in logical order.
- **Integration pages**: under `"Integrations"`.
- **Tutorials**: under `"Tutorials"`.
- **How-to guides**: under `"How-to Guides"`.

If the category does not exist yet, create it at its position in the order above. A section with
only one page is a plain doc item at that position, not a one-item category.

Example — the full shape, with a new how-to guide added:

```javascript
// docs/sidebars.js
module.exports = {
  sidebar: [
    {
      type: "category",
      label: "ZIO Example",
      collapsed: false,
      link: { type: "doc", id: "index" },
      items: [
        "getting-started",
        {
          type: "category",
          label: "Reference",
          collapsed: false,
          items: [
            "reference/chunk",
            "reference/schema",
            // ... existing reference pages
          ],
        },
        {
          type: "category",
          label: "Integrations", // optional
          collapsed: false,
          items: ["slf4j"],
        },
        {
          type: "category",
          label: "Tutorials",
          collapsed: false,
          items: ["tutorial", "tutorial-service"],
        },
        {
          type: "category",
          label: "How-to Guides",
          collapsed: false,
          items: [
            "guides/existing-guide",
            "guides/guide-id-here", // 👈 NEW page, added by this step
          ],
        },
      ],
    },
  ],
};
```

After editing, verify the file still parses:

```bash
node -e "require('./docs/sidebars.js')" && echo "✓ sidebars.js is valid"
```

If `node` reports a syntax error (e.g., unmatched brace, trailing comma without ES2017 support), revert the edit and try again — Docusaurus will fail to start on a malformed sidebar.

## Step 2: Update `docs/index.md`

Add a link to the new page under the appropriate section in `docs/index.md`:

- Reference pages go under the "Reference Documentation" heading.
- Explanation pages, integration pages, tutorials and how-to guides go under "Concepts",
  "Integrations", "Tutorials" and "How-to Guides" headings, in the sidebar order from Step 1 (create a
  heading if missing).

### The published artifacts list

`docs/index.md` lists every published artifact as copy-pastable `libraryDependencies` lines, NEVER a
table and NEVER a `Seq(...)`: one `libraryDependencies += ...` line per artifact, required deps first
(Milad, 2026-11-17; `Seq` ban Milad, 2026-11-19). Each line has its `//` comment directly above it, so a
reader copies one artifact at a time and deletes the lines they do not need. `index.md` → `README.md` (`sbt docs/generateReadme`)
→ GitHub/Maven visitors see it; reader copies block into `build.sbt`, deletes unneeded lines.

1. **`## Installation` = required deps only**: modules every project needs (core + whatever almost
   every user adds, e.g. derivation), Scala-2-only extras (`scala-reflect`), published Scala versions
   (one sentence), min-version cautions. One line per artifact with `%%`; for cross-built artifacts,
   a second group of `%%%` lines, one per artifact, after a sentence that names any JVM-only ones.
2. **`## Modules` = optional modules**, one `###` subsection per purpose (e.g. Codecs/Formats,
   Integrations, Optics, Testing, Interop); intro sentence = all modules share core version + what they
   depend on. Each subsection: one `%%` line per module (all of them), then `%%%` lines for the
   cross-built ones only (sentence before names JVM-only ones), docs links after. Single-module subsection → one line +
   "use `%%%` on Scala.js/Native" sentence. Last: `### Internal Modules` → artifacts users never add
   (macros) in 1 sentence, no line.

New page documents module w/ own artifact (YAML, golden testing, interop, macros) → add/update its
line in right subsection:

```scala
// JSON codecs derived at compile time (JVM, Scala.js, Native)
libraryDependencies += "dev.zio" %% "zio-json" % "@VERSION@"

// Read and write YAML (JVM only)
libraryDependencies += "dev.zio" %% "zio-json-yaml" % "@VERSION@"
```

- **No fact lost vs table.** 1 line/artifact; `//` comment above = purpose + platforms (`%%%` blocks
  drop platform tags). Module w/ other Scala versions (`crossScalaVersions -= Scala3`) → its comment.
  Test-only module (generators, golden testing) → `% Test`.
- **Never `Seq(...)`; always `libraryDependencies += ...` per line** (Milad, 2026-11-19). Grouping
  artifacts in a `Seq` makes the reader copy the whole list; one line each lets them copy what they need.
  Put a blank line between entries (comment + line = 1 entry). Check: no `++=` or `Seq(` anywhere in the
  published-artifacts section of `index.md` (`grep -n 'Seq(\|++=' docs/index.md` must print nothing).
  `@VERSION@`; plain ```` ```scala ```` (sbt settings ≠ mdoc).
- **Lint for this rule:** every `libraryDependencies` line in the list has a `//` comment on the line above;
  every artifact in `build.sbt` without `publish / skip` appears exactly once.
- **Source of truth = build.** Published = sbt project w/o `publish / skip := true`. Platforms ←
  `crossProject(JVMPlatform, JSPlatform, NativePlatform)` (plain `project` = JVM only). Scala
  versions ← `crossScalaVersions` (watch `-= Scala3`). Deps ← `.dependsOn(...)`. Doubt → Maven
  Central `_3`, `_sjs1_`, `_native0.5_` artifacts of last release.
- **1 copy only.** Getting Started, Reference index, Integrations index → link `index.md#installation`
  / `index.md#modules`, never repeat (copies drift).

## Step 3: Cross-Reference Related Pages

Add links from related existing docs to the new page. Aim for **at least two** inbound cross-references — one isn't discoverable, three is plenty.

- For each data type or topic the new page covers, find existing documentation pages that mention it and add a "See also" link near the relevant section.
- If you wrote a guide that uses a specific type (e.g., `Schema`, `DynamicOptic`), add a cross-reference from the type's reference page to the guide.

Find candidate inbound pages with:

```bash
grep -rl "<TypeName or topic keyword>" docs/ | grep -v "<your-new-page-stem>.md"
```

## Step 4: Verify Compilation and Links (Mandatory Gate)

This is a **mandatory compilation gate**. All code examples in documentation are compile-checked via mdoc.

### Check Relative Links

Verify that all relative links in the new page and in any updated pages are correct:

- Internal links use relative paths: `[TypeName](./type-name.md)`.
- Anchor links match actual heading text (Docusaurus converts headings to lowercase kebab-case
  anchors).
- Run `sbt "docs/mdoc --in <path-to-new-page> --out website/<path-to-new-page>"` to catch broken mdoc
  links (they appear as `[error] Unknown link '...'`). One `--in`/`--out` pair per touched file, never
  unscoped `sbt docs/mdoc` for this check — `--out` is the same path prefixed with `website/`.

### If mdoc Fails

If mdoc reports errors, do **not** commit. Return to the offending page, fix the reported lines, and re-run the same `sbt "docs/mdoc --in <path> --out website/<path>"` command. Repeat until the run is clean. On a bare "mdoc failed" stack trace with no detail ("stack trace is suppressed; run 'last <scope>'"), run the `sbt "last <scope>"` it names to get the real error. Common causes:

| Error                                | Likely cause                                            | Fix                                                         |
|--------------------------------------|---------------------------------------------------------|-------------------------------------------------------------|
| `Unknown link '/foo/bar.md'`         | Relative path is wrong or target was renamed            | Update the link to match the actual path under `docs/`      |
| `Reference '...' not found`          | Anchor doesn't match a heading                          | Use lowercase-kebab-case of the heading text                |
| `not found: value Foo`               | Code block is missing an `import` or a previous block   | Add the import or chain via `mdoc` (not `mdoc:reset`)       |
| `value foo is not a member of …`     | API drift since the page was written                    | Re-derive the example against current source                |

### Verify Full Site Build

After mdoc passes, run a full Docusaurus build to catch broken doc IDs, missing sidebar entries, and broken page links:

```bash
cd website && yarn build
```

If `yarn build` reports errors (e.g., `Doc id not found`, broken links, sidebar entry missing), fix the reported issues and re-run until the build is clean. Do **not** commit until this step passes.

| Error                              | Likely cause                              | Fix                                          |
|------------------------------------|-------------------------------------------|----------------------------------------------|
| `Doc id not found: foo/bar`        | ID in `sidebars.js` doesn't match the md filename | Check the `id:` frontmatter in the .md file and align `sidebars.js` |
| `Broken link on page …`            | A relative link targets a page that doesn't exist | Fix the path or the target filename         |
| `sidebars.js` not found            | `website/` directory is missing or wrong path | Verify the repo's `website/` layout        |

**If the build fails with many unrelated "Doc id not found" errors**, `website/docs` is likely stale
from a previous scoped mdoc run — most pages were never regenerated, so their sidebar ids don't
resolve yet. Clean it, run the ONE sanctioned unscoped pass to fill every page (`sbt docs/mdoc`, no
`--in`/`--out` — this is the single case where the unscoped command is correct, since the whole tree
needs to exist for the build to check it), then retry the build once.

**Never create a page to make a link or the build resolve.** A link whose target does not exist is
removed, not manufactured — a stub page is unreviewed content that ships, and it takes the name the
real page will later want: ✅ drop the link, report the gap ❌ write `<Type>.md` containing "full
documentation coming soon" so the sidebar entry stops erroring.

**Fix only what your changes broke.** If the build surfaces a pre-existing failure on a page you never
touched, name it in your report and leave it — never delete a sibling's sidebar entry or write
documentation for a sibling module just to force the build green.
