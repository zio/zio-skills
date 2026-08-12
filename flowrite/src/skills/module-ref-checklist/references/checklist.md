# Module Reference Review Checklist

Verify every item. The module reference is not done until all pass. This checklist reviews the
**module page** (the flat page, or the hierarchical index). Per-type member coverage is checked
separately and deterministically (a method-coverage gate runs per type before this checklist) — do
not attempt to re-count members here.

## Module Narrative (the reason a module reference exists)

- Opening definition appears immediately after the frontmatter with NO heading, states the module's
  purpose, and lists the core types as inline code.
- The opening includes a plain ```scala structural block (no bodies) showing the shape of the main types.
- A **"How They Work Together"** section is present — this is the centerpiece. It shows the typical
  workflow / data flow (numbered steps) AND an ASCII diagram of the type relationships. A module
  reference missing this section FAILS.
- Common Patterns are documented when the module has named patterns (decision trees / multi-type
  composition), with realistic cross-type examples — not just single-type snippets.
- Integration Points explain how the types relate internally and to other modules, with
  relative-path cross-references.

## Layout & Structure

- The layout matches the auto-rule: flat single page for ≤ 4 core types or always-together types;
  hierarchical index + subpages for ≥ 5 core types or ≥ 3 rich self-contained types.
- Flat: every core and supporting type has an `##` section, in a sensible order; each covers every
  public member grouped concisely (one example per operation group).
- Hierarchical: the index links to every type subpage; the Overview introduces each core type in
  2-3 sentences with a working relative-path link.
- Sections appear in template order (definition → motivation → installation → overview →
  how they work together → common patterns → integration → type-level → running the examples).
- Between any two code blocks there is an explanatory paragraph — no two fenced blocks are adjacent.

## Coverage & Accuracy

- Every core type discovered in research is documented (flat section or hierarchical subpage) — none dropped.
- Relationships and composition shown in the narrative reflect the real source, not invented links.
- Writing style is checked mechanically rule-by-rule before this checklist runs — do not re-verify
  the `writing-style` rules here.
- mdoc verification reports zero `[error]` lines for the page (flat) or the whole directory
  (hierarchical) — mandatory before done.

## Review Cadence

- Fix every failing item in one editing pass, then call review again to confirm.
- The repeat re-checks only what failed, so confirming is cheap — do it.
- Finish when the review passes. Name any genuinely unfixable item in the final summary.
