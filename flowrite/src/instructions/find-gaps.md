You survey a checkout for documentation gaps and write one report — you edit no page, add no page,
and touch no sidebar. The report is `docs/undocumented-report.md`, an internal tracking document, not
user-facing documentation.

If the request names a module (e.g. `schema`, `chunk`, `scope`), focus the analysis and the report's
recommendations on that module. Otherwise scan the whole project.

## What you do

1. **Run the scanner.** It is a mechanical pass — nothing here is judgment yet, only counting:

   ```bash
   bash <scanner-path> > docs/undocumented-report.md
   ```

   (The exact path is given below, computed for this checkout.) It compares public Scala types
   against what `docs/` already covers and writes a first-pass Markdown report: a coverage summary,
   the existing reference pages, undocumented types grouped by module, broken internal links, stub
   pages under 20 lines, packages with no documentation at all, and a first-cut priority split by
   how many source files reference each undocumented type.

   Exit code `2` means invocation failed — no `docs/` directory, or a bad project root. Report the
   error and stop; there is nothing to enrich.

2. **Enrich it.** The script counts; you judge. For every undocumented type it flagged:
   - Read the source file to understand what the type actually does.
   - Classify its priority:
     - **Critical** — core public API a user interacts with directly (`Schema`, `Codec`, `Chunk`).
       Needs a dedicated reference page.
     - **High** — supporting types that appear in public signatures (`Validation`, `Modifier`,
       `DynamicValue`). Needs at least a section in a related page.
     - **Medium** — internal-but-visible types advanced users may encounter (`Deriver`,
       `ReflectTransformer`). Needs brief mention.
     - **Low** — genuinely internal types, platform-specific implementations, test helpers. Skip.
   - Move it into the report's matching priority section — the script's own high/medium split by
     reference count is a starting heuristic, not the final word; a type referenced twice but central
     to the public API can still be Critical.

3. **Check depth on pages that already exist.** For every type that DOES have a page, read the page
   and its source side by side and look for: public methods on the type or companion the page never
   mentions, prose with no code example, a signature in the doc that no longer matches the source, and
   related types that should cross-reference each other but don't. Add these as a "Documentation
   Depth" section.

4. **Look past types, for conceptual gaps**: is there a getting-started guide for new users, any
   version-migration doc that's needed, how-to guides for tasks people actually ask about, an
   architecture overview for contributors. Add these as a "Conceptual Gaps" section.

5. **Write the final report**, replacing the scanner's first pass, in this structure:

   ```markdown
   ---
   id: undocumented-report
   title: "Documentation Coverage Report"
   ---

   # Documentation Coverage Report

   ## Summary
   <coverage statistics table from the scanner>

   ## Critical: Missing Reference Pages
   <types that need dedicated doc pages, with a one-line description of each>

   ## High Priority: Incomplete Coverage
   <types with pages needing expansion, or important types with no page>

   ## Medium Priority: Brief Mentions Needed
   <types that should be mentioned in a related page>

   ## Documentation Depth Issues
   <existing pages needing updates — missing methods, examples, stale signatures>

   ## Conceptual Gaps
   <missing guides, overviews, tutorials>

   ## Low Priority / Skip
   <internal types that don't need documentation, with a brief reason each>

   ## Suggested Actions
   <ordered TODO checklist>
   ```

   Every actionable item is a `- [ ]` checkbox, carries its source file path, and estimates scope
   ("new page", "new section", "brief mention", "update existing"). Group suggestions by module.

6. **Commit.** `git add docs/undocumented-report.md && git commit -m "docs: refresh documentation coverage report"`.

## What you are not

You write no reference page, no how-to guide, no subsection, and no sidebar entry — a Critical gap
this report finds is a TODO item for a later `flue run src/agent.ts` (a new page, or the
`add-missing-section` skill) to act on, not something this run writes itself. And you never add this
report to `docs/index.md` — it tracks the docs, it is not one of them.

## Reporting

The coverage percentage, how many types moved priority tiers from the scanner's first pass and why,
and confirmation the file was written to `docs/undocumented-report.md`.
