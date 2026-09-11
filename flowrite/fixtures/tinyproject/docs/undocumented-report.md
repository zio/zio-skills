---
id: undocumented-report
title: "Documentation Coverage Report"
---

# Documentation Coverage Report

## Summary

| Metric | Count |
|--------|-------|
| Total public types found | 14 |
| Types with dedicated documentation | 0 |
| Types mentioned in existing docs | 1 (Lens) |
| Modules with index pages | 2 |
| Modules with guide pages | 1 |
| Documentation coverage | ~7% (1 incomplete guide, 2 index pages) |

## Existing Documentation

The project currently has:

- **Main index** (`docs/index.md`) — overview of both modules and quick start
- **Guides index** (`docs/guides/index.md`) — landing page for tutorial content
- **Guides/Lens** (`docs/guides/lens.md`) — stub guide for Lens (1 para, no examples)
- **Reference index** (`docs/reference/index.md`) — landing page for API reference

All reference pages are missing. The lens guide exists but is incomplete (signature only, no depth).

## Critical Priority: Missing Dedicated Reference Pages

These six types are the core public API. Users interact with them directly. Each needs a dedicated reference page with signature, methods, laws, and worked examples.

### TinyOptics module (`optics/`)

- [ ] **`Lens[S, A]`** — Focuses on a field always present in a product type. The fundamental optic for nested, immutable updates. Referenced in 5 source files (Lens.scala, Optional.scala, Prism.scala, Demo.scala, examples). Currently has a truncated guide stub that needs expansion into a full reference page.

- [ ] **`Prism[S, A]`** — Focuses on one case of a sum type that may or may not match. The complement to Lens, essential for safe ADT access. Referenced in 4 source files (Prism.scala, Optional.scala, Lens.scala, Demo.scala). **No page exists.**

- [ ] **`Optional[S, A]`** — Result of composing a Lens with a Prism. Handles both always-present and maybe-absent focuses. Referenced in 5 source files (Optional.scala, Lens.scala, Prism.scala, Demo.scala, examples). **No page exists.**

- [ ] **`Iso[S, A]`** — Lossless, reversible conversion between two types. Simpler than Lens when shapes are equivalent. Referenced in 1 core file (Iso.scala) and Demo.scala. **No page exists.**

### TinyTally module (`tally/`)

- [ ] **`Ledger`** — Append-only counter of named events. Accumulates forever, never loses data. Referenced in 3 source files (Ledger.scala, Window.scala, Demo.scala). **No page exists.**

- [ ] **`Window`** — Bounded window of recent readings, oldest dropped first. Pairs with Ledger. Referenced in 2 source files (Window.scala, Demo.scala). **No page exists.**

## High Priority: Example and Supporting Types

These types appear in public examples and guide code. They should be mentioned or documented as:

- **`Person`**, **`Address`**, **`Shape`**, **`Circle`**, **`Rectangle`** — Domain types used throughout optics examples to demonstrate Lens and Prism composition. Covered inline in their respective guides (once written), no separate pages needed.

- **`Celsius`** — Wrapper type demonstrating Iso. Covered in Iso guide (once written).

- **`Favourite`** — Demonstrates Lens-Prism composition via Optional. Covered in Optional guide (once written).

- **`Demo` (optics), `Demo` (tally)** — Runnable example objects. Not API for documentation, internal to examples.

## Documentation Depth Issues

**Lens Guide (`docs/guides/lens.md`)** — Exists but is incomplete:
- Current state: 1 paragraph, title only, no code examples
- Needs: worked examples showing get/set/modify, composition with andThen, at least two composed lenses (personCityL pattern)
- Status: **Expand from stub to full tutorial**

**Index pages** — Both `docs/guides/index.md` and `docs/reference/index.md` are minimal landing pages that link to nothing. They are correct in structure but need backfill once their target pages exist.

## Conceptual Gaps

The following guide-level content is missing and would significantly improve user onboarding:

1. **Module overview guides** — No "Getting Started with TinyOptics" or "Getting Started with TinyTally" tutorial. Both modules jump to API reference with no conceptual introduction.

2. **Prism guide** — No tutorial on pattern matching via Prisms, despite its equal importance to Lens.

3. **Optional guide** — No guide on the result of composing Lens and Prism, even though it is the most common real-world composition.

4. **Iso guide** — Missing, though simpler than Lens; good for users with equivalent types.

5. **Ledger guide** — Missing; the pairing with Window is not explained conceptually.

6. **Window guide** — Missing; the bounded-buffer pattern and its relationship to Ledger needs explanation.

7. **Cross-linking guide** — No guide explaining how optics compose via `andThen`, the unifying idea of the library.

8. **Ledger + Window together** — No guide on using both for event counting over time windows (the motivating example in Demo.recentOnly and Demo.windowCounts).

## Low Priority / Skip

No types are genuinely internal-only and should be skipped entirely.

## Suggested Actions

### New Reference Pages (6 pages, by module)

**TinyOptics:**
- [ ] `docs/reference/optics/lens.md` — Reference page for Lens. Scope: new page (expand guides/lens.md or parallel ref). Source: `optics/src/main/scala/optics/Lens.scala`.
- [ ] `docs/reference/optics/prism.md` — Reference page for Prism. Scope: new page. Source: `optics/src/main/scala/optics/Prism.scala`.
- [ ] `docs/reference/optics/optional.md` — Reference page for Optional. Scope: new page. Source: `optics/src/main/scala/optics/Optional.scala`.
- [ ] `docs/reference/optics/iso.md` — Reference page for Iso. Scope: new page. Source: `optics/src/main/scala/optics/Iso.scala`.

**TinyTally:**
- [ ] `docs/reference/tally/ledger.md` — Reference page for Ledger. Scope: new page. Source: `tally/src/main/scala/tally/Ledger.scala`.
- [ ] `docs/reference/tally/window.md` — Reference page for Window. Scope: new page. Source: `tally/src/main/scala/tally/Window.scala`.

### Expand Existing Pages (1 page)

- [ ] `docs/guides/lens.md` — Expand the Lens guide from stub (1 para) to a full tutorial with worked examples, composition patterns, and at least two deep-focus examples. Scope: enrich existing.

### New Guide Pages (7 pages, by module)

**TinyOptics:**
- [ ] `docs/guides/optics-intro.md` — "Getting Started with TinyOptics" — conceptual intro, the unifying idea of composition. Scope: new tutorial.
- [ ] `docs/guides/prism.md` — Tutorial: safe ADT case access with Prisms. Scope: new tutorial.
- [ ] `docs/guides/optional.md` — Tutorial: composition of Lens and Prism, handling nested maybe-absent data. Scope: new tutorial.
- [ ] `docs/guides/iso.md` — Tutorial: reversible conversions with Iso. Scope: new tutorial.
- [ ] `docs/guides/composing-optics.md` — Advanced: how `andThen` unifies all optic types. Scope: new tutorial.

**TinyTally:**
- [ ] `docs/guides/tally-intro.md` — "Getting Started with TinyTally" — Ledger for counts, Window for recent. Scope: new tutorial.
- [ ] `docs/guides/ledger-and-window.md` — Tutorial: combining Ledger and Window for event counting over time. Scope: new tutorial.

### Update Index Pages (2 pages)

- [ ] `docs/guides/index.md` — Backfill with links to all new guide pages once written.
- [ ] `docs/reference/index.md` — Backfill with sections for optics/ and tally/, each linking to its type pages.

---

## Priority Summary

| Priority | Count | Examples |
|----------|-------|----------|
| Critical (new reference) | 6 | Lens, Prism, Optional, Iso, Ledger, Window |
| Expand existing | 1 | guides/lens.md |
| New guides | 7 | Getting started for each module, composition patterns, Ledger+Window |
| Index backfill | 2 | guides/index.md, reference/index.md |
| **Total actionable items** | **16** | — |

### Estimated effort

- **Quick wins** (1–2 hours each): 4 reference pages for optics/Prism, optics/Optional, tally/Ledger, tally/Window; all have well-documented source with clear examples in Demo.scala.
- **Medium** (2–4 hours each): 2 reference pages for Lens and Iso; both have laws and composed examples already in code.
- **Extended** (4–6 hours each): 7 new guides; require narrative design and worked examples. Start with optics-intro and tally-intro, then per-type tutorials.
- **Minimal**: Index page backfill (30 minutes once links exist).

---

*Report enriched on 2026-09-10 by manual source review. Scanner baseline: 14 types, 0% coverage. Enriched assessment: 6 critical pages missing, 7 guide pages missing, 1 guide stub to expand.*
