# Tutorial Review Checklist

Verify every item. The tutorial is not done until all pass.

## Content Quality

- States who it is for (newcomer, assumed prior knowledge).
- Learning objectives stated upfront as a bullet list.
- Learning objectives restated at the end in "What You've Learned".
- Follows a strict linear path (no branching, no "alternatively").
- Every section introduces exactly one new concept or builds incrementally.
- No section is pure prose without a code example.
- Every code example is explained.
- Intermediate results are shown (printed or observed) after each major step.
- The running example is simple and clearly demonstrates the core concepts.
- Types and APIs are introduced only as needed (no front-loaded theory).
- Warm, welcoming tone ("welcome", "let's", "notice that").
- "Putting It Together" is a complete, self-contained, copy-paste-ready example.
- A "Background" section, if present, explains motivation without code.
- Writing style is checked mechanically rule-by-rule before this checklist runs — do not re-verify the `writing-style` rules here.

## Technical Accuracy

- All method signatures and type names match the actual source code. Verify against each core type's
  cited `source` (`path:L<start>-L<end>`) in the research: jump to those lines; if the type isn't there
  (source drifted), `grep` its name in that same file. Never trust the tutorial's prose alone.
- No deprecated methods or outdated patterns.
- `sbt "docs/mdoc --in docs/guides/<id>.md --out website/docs/guides/<id>.md"` reports zero `[error]` lines (mandatory before done).

## Review Cadence

- Fix every failing item in one editing pass, then call review again to confirm.
- The repeat re-checks only what failed, so confirming is cheap — do it.
- Finish when the review passes. Name any genuinely unfixable item in the final summary.
