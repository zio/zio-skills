# Data Type Reference Review Checklist

Verify every item. The reference page is not done until all pass.

## Structure

- Opening definition appears immediately after the frontmatter with NO heading.
- The opening includes a plain ```scala structural block (no method bodies) showing the type's shape.
- A "Usage" section is present, and its code is a **single `mdoc:reset` block** — not split
  across multiple blocks.
- Sections appear in the template order (definition → motivation → showcase → installation →
  creating values → predefined instances → core operations → subtypes → comparisons → advanced →
  integration → running the examples).
- Installation appears only for top-level module types; internal types omit it.
- Each Core-Operations method is a `####` under its `###` category; a single-method category is fine when no related one fits.

## Coverage & Content Quality

- Every public constructor / companion factory is documented under Creating Values.
- Every public method is documented under Core Operations, grouped by category.
- Each method subsection has: a `` `Name` — description `` header, plain-language explanation,
  a plain-`scala` signature block, and an `mdoc:silent:reset`/`mdoc:reset` usage example.
- Comparison sections (if present) use padded tables.
- "Running the Examples" (when standalone example files exist) embeds each via a
  `mdoc:embed:<path>:show-line-numbers` block inside a collapsible `<details>`.
- Writing style is checked mechanically rule-by-rule before this checklist runs — do not re-verify
  the `writing-style` rules here.

## Technical Accuracy

- All method signatures and type names match the actual source code. Verify each against its cited
  `source` (`path:L<start>-L<end>`) in the research: jump to those lines; if the member isn't there
  (source drifted), `grep "def <name>"` in that same file. Never trust the page's prose alone.
- Every constructor / operation / subtype carries a `source`, and a sampled path resolves to a real file, although you shouldn't refer/cite a link to the source code.
- No deprecated methods or outdated patterns.
- `sbt "docs/mdoc --in docs/reference/<type>.md --out website/docs/reference/<type>.md"` reports zero
  `[error]` lines (mandatory before done).

## Review Cadence

- Fix every failing item in one editing pass, then call review again to confirm.
- The repeat re-checks only what failed, so confirming is cheap — do it.
- Finish when the review passes. Name any genuinely unfixable item in the final summary.
