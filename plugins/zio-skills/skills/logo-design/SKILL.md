---
name: logo-design
description: "Criteria and process for designing a logo or brand sheet for any software project or library. Use when asked to design, explore, critique or refine a logo, symbol, wordmark, favicon, app icon or brand identity, or to build a brand sheet (logo, colour, type, voice, usage) for a project. Applies to any project, not only ZIO."
tags: [logo, branding, brand-sheet, design, identity, favicon]
---

# Logo Design

## Before drawing

1. **Research the project.** Read its README and docs. Write a one-paragraph brief: what it does, for whom, its 3–4 core ideas.
2. **Check the family.** If the project belongs to an ecosystem, collect sibling marks first: shared grid, tile shape, corner radius, typefaces, ink colour, lockup pattern, and which hues are taken. Reuse the system; change only the idea and the accent.
3. **Map ideas to visual hooks.** For each core idea, name a shape that shows it (e.g. many dots → one bar for batching). A mark should tell what the project does, not just spell its name.
4. **Write constraints down.** Sizes it must survive, colours taken, trademarks to avoid, clichés to avoid.

## Criteria for a mark

- **Meaningful:** built from the project's own concept. If the story needs a paragraph, it is too weak.
- **Simple:** one idea, few parts. Readable as a silhouette.
- **Scalable:** test at 16 px (favicon), 32 px, 64 px and large. Gaps under ~1/12 of the width close up when small; provide a simpler small cut if needed.
- **Distinct:** not a generic shape (offset shadow, ring around a letter, node-and-line graph) unless the concept earns it. Not close to a sibling or a well-known brand.
- **Colour-independent:** works in one colour, reversed on dark, and on a coloured tile.
- **Balanced:** even visual weight; centred optically, not just geometrically.
- **Ownable:** original geometry. Never trace a third-party logo; check trademark policy when nodding to one.
- **No tropes:** no lightning bolts, rockets, glowing gradients, generic magnifying glasses or emoji-like icons.

## Colour

- One ink, one accent; optional light tint for a second tone inside the mark.
- Pick an accent hue clearly apart from siblings in hue *and* lightness.
- Check WCAG contrast: text needs 4.5:1, large shapes 3:1. Define shades: base, a darker one for text on light, a lighter one for dark grounds.

## Typography

- Wordmark in one typeface, ideally free (Google Fonts) and shared across the family. Sentence case.
- Pair with a monospace for code and labels.
- Ship the wordmark outlined, not as live text.

## Process

1. **Round 1:** 6–12 sketches, grouped by idea, numbered for picking. Show each one on its tile, bare in ink, at 32 and 16 px, and in the lockup. Give each a one-line story and an honest weakness.
2. **Iterate:** the user picks favourites; each later round refines them with one change per variant. Record decisions (tile, typeface, accent) as their own comparison boards.
3. **Lock the logo,** then build the brand sheet from [resources/brand-sheet-template.md](resources/brand-sheet-template.md): 11 sections, 0 Overview to 10 Assets and tokens, each with numbered subsections.
4. **Export and deliver** once the sheet is approved, following [resources/export-and-delivery.md](resources/export-and-delivery.md): build the files into a flat `brand/` folder at the repo root, wire them into the docs site and README, and open a PR.

## Rules

- Never invent facts, stats or taglines as final; mark copy as a proposal for maintainers.
- Present options with trade-offs; let the user choose. Don't pick a final mark alone.
- Keep rationale in the conversation, not on the artwork.
