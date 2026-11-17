---
name: docs-module-ref
description: Write reference documentation for a module containing multiple related data types. Use when documenting a cohesive domain model (HTTP model, resource management) where types work together. Produces comprehensive type-level pages plus module-level narrative showing relationships, patterns, and composition.
argument-hint: "[module-name (e.g., 'http-model', 'resource-management')]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(sbt:*), Bash(sbt gh-query*), Bash(git:*), AskUserQuestion, Task, Skill
---

# Module Reference Documentation

**REQUIRED BACKGROUND:** Use `docs-writing-style` for prose conventions and `docs-mdoc-conventions` for code block syntax. Each hierarchical subpage follows `docs-data-type-ref`'s structure completely — read that skill before Step 6.

## Target Module

$ARGUMENTS

## Agent Workflow

**Phase 1 — Research and Classify (Steps 1–2, no files yet)**

Complete Step 1 (research the module). Complete Step 2 (classify its shape — this decides the layout
and everything downstream, so get it right before writing anything; halt and ask if genuinely
uncertain). Before writing any file, create one task per remaining step. Present the task list to the
user for confirmation before proceeding.

**Phase 2 — Write (Steps 3–5)**

Write the module page, the per-type documentation (inline for flat, subpages for hierarchical), and
examples, in that order. Mark each task `completed` as you finish it.

**Phase 3 — Verify and Complete (Steps 6–10)**

Execute in order: compliance, method coverage, mdoc, fact-check, integrate, final review. Fact-check
and final review must be last — fact-check needs the finished prose to check against source, and final
review grades the page's integrated, sidebar-linked state.

## Overview

This skill produces comprehensive reference documentation for modules with multiple related types. Unlike `docs-data-type-ref` (single type), `docs-module-ref` emphasizes:
- **Module narrative:** How types work together, common patterns, architectural relationships
- **Type-level comprehensiveness:** Each type gets full `docs-data-type-ref` coverage, contextualized within the module
- **Multi-type examples:** Show composition and cross-type usage, not just single-type API

---

## Step 1: Research & Map the Module

Delegate to the **`docs-researcher`** agent with the `Task` tool — it must NOT share your
conversation, so its only knowledge of what to research is what you tell it:

```
Task(
  description: "Research <module-name> module",
  subagent_type: "documentation:docs-researcher",
  prompt: "Research the <module-name> module for a module reference page. The scope is free-form —
           only the module name was given — so DISCOVER which types belong to it, and classify each as
           core or supporting (a supporting type exists to serve the core types; app code rarely
           touches it directly).
           Find a real multi-type test that exercises the types together, and base the module's
           workflow on it — this is the heart of the research, more than any single type's exhaustive
           API (that happens per type, later).
           Identify named patterns, integration points, imports, the sbt dependency.
           Search commit history for why the module is factored this way, which types it gained or
           extracted, and where a platform differs."
)
```

Build a mental model of core types (primary exports), supporting types (helpers), their relationships, and data flow.

---

## Step 2: Classify the Shape

**This decides the layout and the whole page's organization — get it right before writing anything.**
Classify by **reader intent**, never by type count.

**Discriminator:** does the module have core data types each worth their own reference, or co-equal
types that only mean something combined? When it's fuzzy, remove the biggest type: one type still
carries the domain → core-type; the value lived in the combination → DSL.

| Shape | What it is | Layout | Body | Reader asks |
|---|---|---|---|---|
| `single-core` | one dominant core type, one domain | flat | one page, `##`/`###` per type | "what does it do?" |
| `core-family` | several co-equal core types, one domain | hierarchical | index + one subpage per core type | "what does each do?" |
| `multi-domain` | core types spanning ≥ 2 sub-domains | hierarchical | index = map + per-sub-domain index + subpages | "which domain, then?" |
| `dsl` | no dominant core; co-equal types combined into a DSL | flat | one page organized **by task**, NO per-type sections | "how do I build X?" |

Inside the core-type branch: one dominant type the rest support → `single-core`; two or more peers
where no single type carries the domain → `core-family` (two co-equal types already qualify — don't
let type count talk you out of it); those peers spanning ≥ 2 sub-domains → `multi-domain`.

**Halt on doubt.** If the shape is still genuinely uncertain after the discriminator test, use
`AskUserQuestion` and stop — never guess and generate the whole doc on a guess. A wrong shape
mis-structures everything (per-type pages for what should be a DSL, or one overloaded page for a
multi-core module), and the cost is the whole run.

---

## Step 3: Write Module-Level Documentation

### File Location & Frontmatter

**Flat** (`single-core` or `dsl`): `docs/reference/<module-name>.md`

```yaml
---
id: <module-name-kebab-case>
title: "<Module Title>"
description: "A 50-150 character summary of what this module provides."
keywords:
  - "General Domain Concept"
  - "Page-Specific Concept"
  - "<Module Name>"
---
```

**Hierarchical** (`core-family` or `multi-domain`): `docs/reference/<module-name>/index.md`

```yaml
---
id: index
title: "<Module Title>"
description: "A 50-150 character summary of what this module provides."
keywords:
  - "General Domain Concept"
  - "Page-Specific Concept"
  - "<Module Name>"
---
```

`description` and each `keywords` entry are double-quoted; `keywords` is a block list (one `-
"item"` per line), 3-6 entries. Write these now — don't ship the page relying on a later
docs-backfill-metadata pass to fill them in.

### Module-Level Sections (BOTH STRUCTURES)

Keep them in this order. **(required)** must appear; **(if applicable)** appears only when relevant.

#### 1. Opening Definition (required — NO HEADING)

Immediately after frontmatter, state what the module provides:
- Lead with WHAT it is and WHY it exists — the problem it solves — not HOW it works. Defer mechanics to later sections.
- List core types as inline code: `` `Type1`, `Type2`, `Type3` ``
- A plain `` ```scala `` block (NOT mdoc) showing the structural shape of the 2-3 main types (declarations only — no bodies).
- Flag any core type that's a low-level building block a higher-level API wraps, naming the high-level alternative to prefer (writing-style rule 26).

**Example:**

```
    `zio-http-model` is a **pure, zero-dependency HTTP data model** for building clients and servers. 
    It provides immutable types representing requests, responses, headers, URLs, paths, and HTTP primitives.
    Core types: `Request`, `Response`, `URL`, `Headers`, `Body`, `Method`, `Status`.
    
    ```scala
    final case class Request(method: Method, url: URL, headers: Headers, body: Body, version: Version)
    final case class Response(status: Status, headers: Headers, body: Body, version: Version)
    final case class URL(scheme: Option[Scheme], host: Option[String], port: Option[Int], ...)
    ```
```

Then continue with `## Motivation` (if applicable) or the next section that applies.

#### 2. Motivation / Use Case (if applicable)

What problem the module solves and why use it over alternatives, drawn from a history finding that
gives a REASON **for the people who use it** — not a reason about the repo's own work (fixtures, test
coverage, tooling, the docs pipeline). Retell it in your own words; never quote a commit message or
cite a PR number on the page. No qualifying finding means no Motivation section — omit it.

#### 3. Installation (if applicable — top-level module only)

```scala
libraryDependencies += "dev.zio" %% "<module-name>" % "@VERSION@"
```

For Scala.js/Native, if cross-built: `%%%` not `%%`. Scala versions ← build (`crossScalaVersions`), no fixed list. >1 artifact → one
`libraryDependencies ++= Seq(...)` block, `//` comment above each line = purpose + platforms, never a
table. Full artifact list only in `index.md#modules` (`docs-integrate`, "The published artifacts list").

#### 4. Overview (hierarchical) / optional for flat

2-3 sentences per core type: what it does, its role, a link to its subpage (hierarchical) or its `##` section (flat).

#### 5. How They Work Together (required — THE CENTERPIECE, never skip)

A module reference missing this section is incomplete, full stop.

- The typical workflow / data flow as numbered steps.
- An ASCII diagram of type relationships and interactions, grounded in real relationships from research — never invented.
- How each type uses / depends on / composes with the others.

**Example for Resource Management:**
```
1. Define dependencies using Wire.shared[T] (macro inspects constructors)
2. Compose wires with Resource.from[App](wire1, wire2, ...)
3. Allocate within a scope: scope.allocate(resource)
4. Use scoped values via $ accessor
5. Cleanup automatic when scope exits
```

**Example for HTTP Model:**
```
Request ──> Method (HTTP verb: GET, POST, etc.)
         ├─> URL ──> Scheme (HTTP, HTTPS, WS, WSS)
         │       ├─> Path (URL path segments)
         │       └─> QueryParams (parameters)
         ├─> Headers (collection of typed headers)
         └─> Body (content + ContentType)

Response ──> Status (HTTP code: 200, 404, etc.)
          ├─> Headers (same as Request)
          └─> Body (response content)
```

#### 6. Common Patterns (required when the module has named patterns)

Named architectural patterns specific to the module — decision trees for choosing between
types/variants, realistic multi-type composition examples (not single-type snippets), typical use
cases organized by scenario.

**Example for Resource Management:**
- Shared Singletons (database connections)
- Per-Request Instances (session state)
- Manual Construction (custom initialization)
- Resource Composition (chaining dependencies)

#### 7. Integration Points (if applicable)

How types relate architecturally and integrate with other modules in the same library — which types
use which other types internally, cross-references to related docs.

**Example:**
```
- Wire uses Resource to manage lifecycles
- Resource uses Scope for finalization
- Headers are used by Request and Response
- URL parsing uses Path and QueryParams
```

#### 8. Type-Level Documentation

- **Flat:** an `##` section per type, in the planned order — see Step 4 (below).
- **DSL shape:** skip this entirely. Do NOT add a per-type `## <TypeName>` section — see the DSL body
  note below.
- **Hierarchical:** not here — each type is its own subpage, Step 5.

#### 9. Running the Examples (required when standalone example files exist)

Prefer ONE module-level section showing a cross-type workflow over one set per type — the cross-type
composition is what a module page is for. See Step 6.

### Shape-Specific Body Organization

**DSL body** (`shape: dsl`): the flat page is organized **by task/composition**, not by type —
sections are recipes ("Building X", "Combining Y and Z") showing how the types compose to solve the
domain problem. If the page grows too large, split into an index + task/topic pages — still never
per-type reference pages.

**Multi-domain sub-nesting** (`shape: multi-domain`, ≥ 2 distinct sub-domains): nest each sub-domain
under `<module-kebab>/<sub-domain-kebab>/` with its own `index.md`; the module `index.md` becomes a
map — a blurb plus a link per sub-domain. See Step 5 for the sub-domain index template. Otherwise
(`core-family`) keep subpages flat under `<module-kebab>/`.

### Grouping Rules (apply everywhere a type or method list appears)

- **Group types by domain, not by depth.** A group label names a concern the types share, never how
  comprehensively a type happens to be documented: ✅ `Routing`, `Http Messages`, `Middlewares`
  ❌ `Core`, `Supporting`, `Core Data Types`. This applies to flat sections, a sub-domain index's type
  roster, and sidebar groups alike.
- **Homogeneous family → one page.** Sibling types with the same shape, differing only by value type,
  share ONE page — the common shape once, then a per-type table/subsection for what differs: ✅
  `Counter`/`UpDownCounter`/`Histogram`/`Gauge` on one `meter.md` ❌ four near-duplicate pages.
- **Adapter / bridge → minimal page, defer outward.** A module that only wires one thing to another
  (an external system or another module) is a stub, not a full reference: the dependency, the one
  entry point, a short example, then a link out to the real docs: ✅ a thin `otel` bridge = install +
  provider entry + link to OpenTelemetry ❌ a full page per exporter type.

### Drafting Rules (all shapes)

- The opening definition has NO heading.
- Open every section with prose, never a code block — lead a signature block with a sentence
  introducing it, then explanatory prose before its example: prose → signature → prose → example.
- Between any two code blocks, an explanatory paragraph — never leave two fenced blocks adjacent.
- Use ASCII art for type relationships. Link related docs with relative paths.
- Ground every signature, example, and relationship in the real source — never invent an API surface
  or a relationship the code doesn't actually have.

---

## Step 4: Write Type-Level Documentation (Flat Structure)

Skip this step entirely for `shape: dsl` — a DSL page has no per-type sections at all (see the DSL
body note above).

**For `single-core`:** Write type sections inline using `##` headings, in the planned order.

**Structure for each type:**
1. **Opening definition (no heading for first type):** Brief definition, type signature, key properties
2. **Subsections by category, titled by capability/topic, not a method name** — the method names and
   signatures live in the body, same rule as `docs-data-type-ref`'s Core Operations: ✅
   `#### Internal Spans` ❌ `#### \`span\` — Create an Internal Span`.
    - **Predefined Instances** (if applicable): List variants, constants
    - **Parsing/Creating** (if applicable): How to construct or parse values
    - **Key Operations**: 2-3 main methods per functionality group
    - **Rendering** (if applicable): How to convert to string/wire format

**Coverage:** Read `docs-data-type-ref` for the fuller structure as a reference, but lighter here:
- Document every public method, but group concisely — one example per operation group, not exhaustive edge cases.
- Performance notes inline where relevant (O(1), O(n), etc.)
- Link to the module-level "How They Work Together" / Common Patterns sections for composition, instead of repeating cross-type examples per type.

**Example (http-model.md):**

```markdown
    ## Method
    
    `Method` represents standard HTTP methods as case objects.
    
    ### Predefined Methods
    GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS, TRACE, CONNECT with examples.
    
    ### Parsing
    fromString("GET") returns Some(Method.GET).
    
    ### Rendering
    Method.GET.name returns "GET".
    
    ## Status
    
    `Status` is an opaque type alias for Int, providing zero-allocation status codes.
    
    ### Predefined Status Codes
    1xx Informational, 2xx Success, 3xx Redirection, 4xx Client Errors, 5xx Server Errors with examples.
```

---

## Step 5: Write Type-Level Documentation (Hierarchical Structure)

**For `core-family` and `multi-domain`:** create one subpage per type.

**File location:** `docs/reference/<module-name>/<type-name-kebab-case>.md` (or, for `multi-domain`,
`docs/reference/<module-name>/<sub-domain-kebab>/<type-name-kebab-case>.md`).

**One type at a time, fully isolated — never batch.** Research and write each subpage as its own
complete pass: read that type's own source and tests before drafting it, and never carry another
type's plan or research into this one's page, even when two types look small enough to combine. This
is where cross-contamination happens — a page for one type ends up naming methods that belong to its
sibling because both were drafted from a merged context. Two subpages, two full passes.

**Depth tier:** a **core** type (Step 1's classification) gets the full `docs-data-type-ref` treatment.
A **supporting** type gets the minimal page `docs-data-type-ref`'s own depth-tier rule describes
(opening definition + one Usage example + admonitions, skipping Creating Values/Core
Operations/Comparisons/Integration). Don't write nineteen full pages when several are genuinely minor.

**Frontmatter:**
```yaml
---
id: <type-name-kebab-case>
title: "<TypeName>"
description: "A 50-150 character summary of what this type does."
keywords:
  - "General Domain Concept"
  - "Page-Specific Concept"
  - "<TypeName>"
---
```

**Structure:** Follow `docs-data-type-ref` COMPLETELY (structure, fact-checkable signature blocks,
capability-grouped Core Operations, the case-class-declaration rule, everything), with the
**Recontextualization rule** layered on top — in each section, note how the type relates to other
types in the module:
- Opening definition — say whether the type is a core export or a supporting helper.
- Creating Values — note when it's built using other module types.
- Core Operations — show composition with sibling types where relevant.
- Integration — highlight module-level relationships (siblings) first, external modules second.
- Comparison sections: can stay per-type (vs other languages, vs related types) or move to the module
  index when comparing types within the module.

### Sub-domain nesting (`multi-domain` shape, ≥ 2 sub-domains)

```
docs/reference/<module-kebab>/index.md                       ← the module map
docs/reference/<module-kebab>/<sub-domain-kebab>/index.md    ← one per sub-domain
docs/reference/<module-kebab>/<sub-domain-kebab>/<type>.md   ← the types
```

Each sub-domain `index.md` is written by hand (it's prose you write yourself, not a per-type
delegation — apply `docs-writing-style` directly), following this structure:

1. **Bare definition** (no `## <object>` heading) that also introduces the sub-domain's entry-point
   object if it has one — lead with WHAT this area gives the reader and WHY they'd reach for it,
   deferring mechanics to the capability sections below.
2. **A `## <capability>` section per behavior** the entry-point object provides. Because it has no page
   of its own, cover it comprehensively here, organized by behavior/task rather than method-by-method
   — represent a method family by its behavior once (e.g. rate-limited logging = the count-based +
   interval-based families across all severities), not one line per method: ✅ `## Rate-Limited
   Logging` covering both families in one place ❌ silently listing 2 of 12 variants. Introduce each
   member's signature INSIDE the capability subsection that covers it — a small declarations-only
   ```scala block right before the example — rather than one monolithic interface block up front.
3. **`## How They Work Together`** — ASCII diagram plus a **Type Relationships:** bullet list.
4. **`## Usage`** — problem-first: name the core job ("track a request through your app"), then ONE
   `mdoc:compile-only` recipe solving it end-to-end via the entry-point object plus the core types.
5. **`## Type Pages`** — the roster: `- **[Type](./type.md)** — role`, grouped by domain concern (see
   Grouping Rules above), never by depth.

No `## Installation` on a sub-domain index — that belongs on the module index only.

**Link each sibling type's first prose mention** to its subpage, as `` [`TracerProvider`](./tracer-provider.md) `` — verify the page exists before linking to it.

---

## Step 6: Running the Examples

Decide where to place runnable examples, one approach per module for consistency:

**Option 1: Module-level examples** (recommended for most modules) — a single section in the module
index or a dedicated examples page, showing cross-type workflows ("create a Request, send it, parse
the Response"). Use the `docs-companion-examples` skill.

**Option 2: Per-type examples** (only if each type has standalone value) — examples in individual type
pages (flat) or individual type files (hierarchical), using `docs-companion-examples` separately per
type.

Do this **before** Step 8 (mdoc verify) — an embedded example file that doesn't exist yet fails mdoc
outright, whichever embedding mechanism this project uses (see `docs-companion-examples`).

---

## Step 7: Verify Documentation Compliance

Run `docs-check-compliance` (or `docs-verify-compliance`) against the module page (flat) or the index
plus every subpage (hierarchical). Fix everything reported before continuing.

---

## Step 8: Verify Method Coverage

For every type documented — inline sections (flat) or subpages (hierarchical) — run
`docs-data-type-list-members` piped into `docs-report-method-coverage`, the same as
`docs-data-type-ref`'s coverage step, once per type. Every member showing "missing" needs either an
added subsection/table row or a documented reason for the omission.

---

## Step 9: Verify Documentation

Run mdoc, scoped — never `--watch` (that's for continuous local development; it never exits, and will
hang an automated run indefinitely) and never unscoped (`sbt docs/mdoc` alone recompiles the entire
docs tree):

**Flat:**
```bash
sbt "docs/mdoc --in docs/reference/<module-name>.md --out website/docs/reference/<module-name>.md"
```

**Hierarchical:** one `--in`/`--out` pair per page — the index, then every subpage:
```bash
sbt "docs/mdoc --in docs/reference/<module>/index.md --out website/docs/reference/<module>/index.md \
  --in docs/reference/<module>/<type1>.md --out website/docs/reference/<module>/<type1>.md \
  --in docs/reference/<module>/<type2>.md --out website/docs/reference/<module>/<type2>.md"
```

**Success criterion:** zero `[error]` lines across every page checked.

---

## Step 10: Fact-Check

**Same reason as `docs-data-type-ref`'s fact-check step**: the plain ` ```scala ` signature blocks in
every type's Core Operations are never mdoc-compiled, so nothing before this step can catch a wrong
one. **A module reference carries an extra risk on top of that**: an invented RELATIONSHIP between two
real types — a claim in "How They Work Together" or Integration Points that type A uses type B in some
way the source doesn't actually show. Watch for that specifically; it's the drift a module reference is
most likely to carry that a single-type reference never could.

Run once per page checked — the flat page, or the hierarchical index plus each subpage (each stands on
its own claims). Delegate each to the **`docs-reviewer`** agent with the `Task` tool
(`subagent_type: "documentation:docs-reviewer"`), asking it to fact-check, same shape as
`docs-data-type-ref`'s Step 8, with one addition to the brief: explicitly ask it to verify every
claimed cross-type relationship against real source (an import, a call site, a field of that type) —
not just per-type signatures and behavior. It reports each drift with the exact corrected statement,
not just a description of what's wrong.

Never fix a drift yourself: delegate every reported drift, verbatim (its exact statement included), to
the **`docs-fixer`** agent with the `Task` tool (`subagent_type: "documentation:docs-fixer"`) —
correcting only the **page**, never the source. **Bounded rounds, shared across every page this run
checks**: delegate everything a check reports to `docs-fixer` before spending a confirming round;
re-run mdoc after `docs-fixer` returns, then re-delegate the fact-check to confirm. If a confirming
round finds genuinely NEW drifts (not repeats), delegate those too and confirm again, up to 3
confirming rounds total across the whole run. A round repeating the same drifts as before ends it —
name the unrepairable drift in your summary.

---

## Step 11: Integrate

Delegate to the **`docs-integrator`** agent with the `Task` tool. For a hierarchical layout, give it
each sub-domain (or, for `core-family`, each type) with its subpage ids in reading order, so the
sidebar becomes a category holding the index plus one entry (or sub-category, for `multi-domain`) per
group. A flat layout is a single doc entry. Reference pages are linked TO from tutorials and how-to
guides — also ask for inbound "See also" links from an existing guide using this module where relevant:

```
Task(
  description: "Integrate <module-name> module reference",
  subagent_type: "documentation:docs-integrator",
  prompt: "Page: docs/reference/<module-name>.md (or docs/reference/<module-name>/index.md for a
           hierarchical layout, plus one entry/sub-category per <sub-domain-or-type> subpage: <list>)
           Category: Reference
           Layout: <flat | hierarchical>
           Cross-reference direction: this page is linked TO from tutorials and how-to guides that use
           this module — add inbound 'See also' links from those pages where relevant."
)
```

### sidebars.js Shape

**Flat:**
```javascript
{
  type: "doc",
  id: "reference/<module-name>"
}
```

**Hierarchical (`core-family`):**
```javascript
{
  type: "category",
  label: "HTTP Model",
  link: { type: "doc", id: "reference/<module-name>/index" },
  items: [
    "reference/<module-name>/<type-name-1>",
    "reference/<module-name>/<type-name-2>",
  ]
}
```

**Hierarchical (`multi-domain`):** nest a sub-category per sub-domain, each with its own `link` to that
sub-domain's index and its own `items` list of that sub-domain's type ids.

### docs/index.md Update

```markdown
- [HTTP Model](./reference/<module-name>.md) — Pure, zero-dependency HTTP data model for requests, responses, and primitives.
```

---

## Step 12: Final Review

The last gate, run against the page's final, integrated state — after Step 11, since this grades what
a reader actually sees, sidebar and cross-references included.

Delegate to the **`docs-reviewer`** agent with the `Task` tool
(`subagent_type: "documentation:docs-reviewer"`), asking for a full-page review of the module page
(flat page, or hierarchical index) against this checklist, and telling it to give the exact corrected
statement for every failing item, not just what's wrong:

```
Task(
  description: "Review <module-name> module reference",
  subagent_type: "documentation:docs-reviewer",
  prompt: "Full-page review (not a fact-check): evaluate
           docs/reference/<module-name>.md (or the hierarchical index plus each subpage) against this
           checklist. For every failing item, give the exact corrected statement to apply.

## Module Narrative
- Opening definition immediately after frontmatter, NO heading, states purpose, lists core types as inline code.
- Includes a plain scala structural block (no bodies) showing the shape of the main types.
- "How They Work Together" is present — numbered workflow steps AND an ASCII diagram. Missing this FAILS the page.
- Motivation, where present, gives a reason the reader shares, not a reason about the repo's own work.
- Common Patterns documented when the module has named patterns, with realistic cross-type examples.
- Integration Points explain internal and cross-module relationships with working relative-path links.

## Layout & Structure
- The layout matches the shape classified in Step 2 (flat for single-core/dsl, index+subpages for
  core-family/multi-domain) — type count is never grounds to fail this, shape follows reader intent.
- Flat: every core and supporting type has a section, each covering every public member concisely.
- Hierarchical: the index links to every type subpage; the Overview introduces each core type with a working link.
- Sections appear in template order.
- Between any two code blocks there is an explanatory paragraph — no two fenced blocks adjacent.

## Coverage & Accuracy
- Every core type discovered in research is documented — none dropped.
- Relationships and composition shown reflect the real source, not invented links.
- Writing-style rules pass (evaluate in this same pass; report violations as failing items too).
- mdoc reports zero [error] lines for every page checked — run it now, scoped, never --watch."
)
```

Never fix a failing item yourself: delegate everything review reports, verbatim (the exact statement
for each), to the **`docs-fixer`** agent with the `Task` tool
(`subagent_type: "documentation:docs-fixer"`).

**Bounded rounds, same discipline as fact-check:** after `docs-fixer` returns, re-run mdoc, then
delegate the same review to `docs-reviewer` once more — that confirming round is what records the
page as passing. Genuinely NEW failing items in a confirming round earn another round (delegate those
to `docs-fixer` too), up to 3 total; a round repeating the same failures ends it. A review that
reported nothing needs no confirming round.

### Final Formatting

```bash
sbt scalafmtAll
sbt check
```
