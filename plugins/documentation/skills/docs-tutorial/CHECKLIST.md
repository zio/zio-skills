# Tutorial Review Checklist

After writing, verify every item on this checklist:

## Content Quality

- [ ] The tutorial clearly states who it is for (newcomer, assumed prior knowledge)
- [ ] Learning objectives are stated upfront as a bullet list
- [ ] Learning objectives are restated at the end in "What You've Learned"
- [ ] The tutorial follows a strict linear path (no branching, no "alternatively")
- [ ] Every section introduces exactly one new concept or builds incrementally
- [ ] No section is pure prose without a code example
- [ ] Every code example is annotated line-by-line with bullet-point explanations
- [ ] Intermediate results are shown (printed or observed) after each major step
- [ ] The running example is simple and clearly demonstrates the core concepts
- [ ] Types and APIs are introduced only as needed (no front-loaded theory)
- [ ] The tone is warm and welcoming (uses "welcome", "let's", "notice that")
- [ ] The "Background" section (if present) explains motivation without code

## Technical Accuracy

- [ ] All method signatures and type names match the actual source code
- [ ] All code examples use correct mdoc modifiers and would compile
- [ ] Imports are complete and correct in every code block
- [ ] The sbt dependency (if mentioned) is correct
- [ ] No deprecated methods or outdated patterns are used
- [ ] Run `sbt "docs/mdoc --in docs/guides/<tutorial-id>.md --out website/docs/guides/<tutorial-id>.md"` and confirm zero `[error]` lines (this is mandatory before claiming the tutorial is done). Note the path: tutorials live in `docs/guides/`, not `docs/tutorials/` — this checklist previously disagreed with SKILL.md's own file-location instructions on this.
- [ ] "Putting It Together" matches the page shape: present only on a `one-program` tutorial, as prose naming every difference from the sections plus an EMPTY `scala mdoc:embed:<path-to-CompleteExample.scala>` block (or the project's `SourceFile.print` equivalent); absent on a `recipes` tutorial

## Companion Examples

- [ ] The companion examples and their embeds pass every item of the `docs-examples` "Checklist"

## Style and Integration

- [ ] The frontmatter `id` matches the filename
- [ ] The tutorial is in `docs/guides/` (same directory as how-to guides)
- [ ] The tutorial is added to `sidebars.js` under the "Tutorials" category, which sits directly before "How-to Guides"
- [ ] The tutorial is linked from `docs/index.md`
- [ ] Related reference pages link back to this tutorial
- [ ] Every link in "Where to Go Next" points at a page that actually exists — check before linking, and leave a mention unlinked (never a placeholder) when it doesn't. Never accept a stub page written just to make a link resolve.
- [ ] Writing style follows the rules (warm tone, present tense, "we"/"you", concise, no emojis)
- [ ] Admonitions are used sparingly and for genuinely important callouts
