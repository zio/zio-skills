# Module Reference Structure

A module reference documents a **cohesive domain model of several related types** — a module such as
an HTTP model (`Request`, `Response`, `URL`, `Headers`, …) or resource management (`Scope`,
`Resource`, `Wire`). Unlike a data type reference (ONE type, exhaustive), a module reference
emphasizes three things a single-type page cannot:

- **Module narrative** — how the types work together, the common patterns, the architectural relationships.
- **Type-level coverage** — each type documented, contextualized within the module (not in isolation).
- **Multi-type examples** — composition and cross-type usage, not just single-type API snippets.

## Classify the module first

Classify the module by **reader intent**, not by type count — this drives everything below. If the run
supplied a `shapeOverride`, use it and skip the test.

**Discriminator:** does the module have core data types each worth their own reference, or co-equal
types that only mean something combined? Operational test when fuzzy — remove the biggest type: one
type carries the domain → **core-type**; the value lives in the combination → **DSL**.

**Halt on doubt.** If the shape is still genuinely uncertain after that test, STOP and ask the user —
never guess and generate the whole doc. A wrong shape mis-structures everything (per-type pages for a
DSL, or one page for a multi-core module), wasting the run.

| Shape (`shape`) | What it is                                           | `layout`     | Body                                                 | Reader asks           |
|-----------------|------------------------------------------------------|--------------|------------------------------------------------------|-----------------------|
| `single-core`   | one dominant core type, one domain                   | flat         | one page, `##`/`###` **per type**                    | "what does it do?"    |
| `core-family`   | several co-equal core types, one domain              | hierarchical | `index.md` + one subpage per core type               | "what does each do?"  |
| `multi-domain`  | core types across ≥ 2 sub-domains                    | hierarchical | index = map + per-sub-domain index + subpages        | "which domain, then?" |
| `dsl`           | no dominant core; co-equal types combined into a DSL | flat         | one page organized **by task**, NO per-type sections | "how do I build X?"   |

`layout` is only the **file structure** (one page vs index+subpages) — `single-core` and `dsl` share
`flat` and differ solely in body organization (by-type vs by-task, keyed off `shape`). Inside the
core-type branch, ask which type a reader comes for: one dominant type the rest support →
`single-core`; two or more peers where no single type carries the domain → `core-family`; those peers
spanning ≥ 2 sub-domains → `multi-domain`. Two co-equal types already make a family — judge dominance,
and let the type count stay out of it.

## Layout: Flat vs. Hierarchical

The design phase derives the layout from the shape (an explicit `layout` override wins when supplied;
`shapeOverride` wins over both).

**Flat** — single file `docs/reference/<module-kebab>.md`. All types documented inline with `##`
headings. Best when types are tightly coupled or always used together (e.g. an HTTP model).

```
---
id: <module-kebab>
title: "<Module Title>"
---
```

**Hierarchical** — index + subpages: `docs/reference/<module-kebab>/index.md` plus one
`docs/reference/<module-kebab>/<type-kebab>.md` per type, linked from the index. Best when types
have self-contained value and readers benefit from deep-dive pages (e.g. resource management).

```
---
id: index
title: "<Module Title>"
---
```

Each hierarchical subpage follows the **data type reference** structure completely, recontextualized
to the module (see "Recontextualization" below).

**DSL body (`shape: dsl`, flat file).** When the shape is `dsl`, the single flat page is organized
**by task/composition**, not by type: sections are recipes ("Building X", "Combining Y and Z") that
show how the types compose to solve the domain problem. Do NOT add a per-type `## <TypeName>` section
or subpages. If the page grows too large, split into an index + task/topic pages — still never per-type
reference pages.

**Sub-domain nesting (hierarchical, ≥ 2 distinct sub-domains).** Nest each sub-domain under
`<module-kebab>/<sub-domain-kebab>/` with its own `index.md`; the module `index.md` becomes a map — a
blurb + link per sub-domain. Otherwise keep subpages flat under `<module-kebab>/`.

**Sub-domain index page.** Frontmatter `id: index`, `title`. Structure: bare definition that also
introduces the entry-point object (no `## <object>` heading) — lead with WHAT this area gives the
reader and WHY they'd reach for it, deferring mechanics to the capability sections → a `## <capability>` section per
behavior of the object → `## How They Work Together` (ASCII diagram + `**Type Relationships:**`
bullets) → `## Usage` (**problem-first**: name the core job — "track a request through your app" —
then ONE `scala mdoc:compile-only` recipe solving it end-to-end via the entry-point object + core
types) → `## Type Pages` (roster: `- **[Type](./type.md)** — role`). No `## Installation` (module index has it).

**"Sub-domain" is planning vocabulary — never emit it as a heading or in prose.**
✅ `## Type Pages`  ❌ `## Sub-domain Pages` (BACKLOG.md #14)

**An entry-point singleton is documented in its scope's index** — the sub-domain index (multi-domain)
or module index (flat/core-family) — and because it has no page of its own, cover it **comprehensively
and behavior/task-based**: open the page prose with what it is + the zero-setup default + the
production `install` call (no `## <object>` heading), then one `## <capability>` section per behavior
the user achieves, each covering EVERY feature. Represent a method family by its behavior once (e.g.
rate-limited logging = the `Every` count-based + `AtMost` interval-based families across all
severities), not one line per method.
✅ `## Rate-limited logging` (both families, shown once) ❌ silently listing 2 of 12 variants.
Introduce each member's signature INSIDE the capability subsection that covers it — a small
declarations-only ` ```scala ` block right before the example — rather than one monolithic
`object { … }` interface block up front.

**Homogeneous family → one page.** Sibling types with the same shape, differing only by value type,
share ONE page (common shape once, then a per-type table/subsection for what differs):
✅ `Counter`/`UpDownCounter`/`Histogram`/`Gauge` on one `meter.md` ❌ four near-duplicate pages.

**Adapter / bridge → minimal page + defer outward.** A module that only wires one thing to another
(an external system or another module) is a stub — the dependency, the one entry point, a short
example — then a link out to the real docs, not a full reference:
✅ a thin `otel` bridge = install + provider entry + link to OpenTelemetry ❌ a full page per exporter type.

**Group types by domain, not by depth** (applies everywhere a type list appears — flat sections, the
sub-domain index `## Type Pages` roster, sidebar groups). A group label names a concern the types
share (what they do together); depth (how comprehensively a type is documented) is a separate per-type
property, never a heading: ✅ `Routing`, `Http Messages`, `Middlewares` ❌ `Core`, `Supporting`, `Core Data Types`.

## Module-Level Sections (BOTH LAYOUTS — this is the module page / the flat page's top matter)

Keep them in this order. Sections marked **(required)** must appear; **(if applicable)** appear only
when relevant.

```
1. Opening Definition (required) — NO HEADING
   - Immediately after the frontmatter: what the module provides, in 1-3 sentences.
   - Lead with WHAT it is and WHY it exists — the problem it solves — not HOW it works. Defer mechanics
     to later sections.
   - List the core types as inline code: `Type1`, `Type2`, `Type3`.
   - A plain ```scala block (NOT mdoc) showing the structural shape of the 2-3 main types
     (declarations only — no bodies).
   - Flag any core type that is a low-level building block (a higher-level API wraps it) and name the
     high-level alternative to prefer (writing-style rule 26).
2. Motivation / Use Case (if applicable)
   - What problem the module solves and why use it over alternatives; advantages as bullets.
   - Draw it from the history findings that give a REASON the module is factored this way **for the
     people who use it**. Retell them in your own words; never quote a commit or cite a PR number on
     the page. The other findings there belong in the sections they describe. No finding gives a
     reason: no Motivation section.
   - ✅ "Counting across collectors has to merge without losing either total, so `absorb` sums by name"
     ❌ "This module exists to test documentation tooling" (true of the repo, useless to a reader)
3. Installation (if applicable — top-level module only)
   - `libraryDependencies += "dev.zio" %% "<module>" % "@VERSION@"` (`%%%` for cross-platform).
4. Overview (hierarchical) / optional for flat
   - 2-3 sentences per core type: what it does, its role, a link to its subpage (hierarchical)
     or its `##` section (flat).
5. How They Work Together (required — THE CENTERPIECE, never skip)
   - The typical workflow / data flow as numbered steps.
   - An ASCII diagram of the type relationships and interactions.
   - How each type uses / depends on / composes with the others.
6. Common Patterns (required when the module has named patterns)
   - Named, module-specific patterns: decision trees for choosing between variants,
     realistic multi-type composition examples (not single-type snippets).
7. Integration Points (if applicable)
   - Which types use which internally; how this module integrates with other modules;
     relative-path cross-references to related docs.
8. Type-Level Documentation
   - flat: an `##` section per type (see "Per-Type Section — Flat" below), in the planned type order.
   - hierarchical: not here — each type is its own subpage.
9. Running the Examples (required when standalone example files exist)
   - Prefer ONE module-level section showing a cross-type workflow, per data-type-ref's
     `mdoc:embed` + collapsible `<details>` convention. Place last.
```

## Per-Type Section — Flat (lighter than a full data type reference)

For a flat page, document each type inline under an `##` heading. Cover every public member, but
group concisely — this is lighter than a standalone data type reference:

- Brief definition + type signature + key properties (no heading for the first type's definition
  if it directly follows the module top matter; otherwise `##<TypeName>`).
- Subsections by category as they apply: **Predefined Instances**, **Creating Values**,
  **Key Operations** (2-3 representative methods per functionality group), **Rendering**.
- Title an operation subsection by its **capability/topic**, not a method name + description; the
  method names and signatures live in the body: ✅ `#### Internal spans` ❌ `#### \`span\` — Create an internal span`.
- **One example per operation group**, not exhaustive edge cases. Note performance inline (O(1), O(n)).
- Link to the module-level "How They Work Together" / patterns sections for composition, instead of
  repeating cross-type examples per type.

## Per-Type Subpage — Hierarchical (full data type reference depth)

Each subpage follows the data-type-ref structure COMPLETELY. Apply the **Recontextualization rule**:
in each section, note how the type relates to the other types in the module.

- Opening definition — say whether the type is a core export or a supporting helper.
- Creating Values — note when it is built with other module types.
- Core Operations — show composition with sibling types where relevant.
- Integration — highlight module-level relationships first (siblings), external modules second.
- Comparisons may stay per-subpage (vs other languages / related types) or move to the index when
  comparing types within the module.

## Drafting Rules (both layouts)

- The opening definition has NO heading — it is the natural opening prose after the frontmatter.
- The "How They Work Together" section is mandatory and is the reason a module reference exists —
  never omit it; ground its data flow and ASCII diagram in the real relationships from research.
- Between any two code blocks put an explanatory paragraph — never leave two fenced blocks adjacent.
- Open every section with prose, never a code block: lead a signature block with a sentence
  introducing it, then follow it with explanatory prose before its example (prose → signature →
  prose → example).
- Use ASCII art for type relationships. Link related docs with relative paths
  (`[TypeName](./type-name.md)`, or `[TypeName](./<module>/<type>.md)` across pages).
- Ground every signature, example, and relationship in the real source — never invent an API surface
  or a relationship the code does not have.
