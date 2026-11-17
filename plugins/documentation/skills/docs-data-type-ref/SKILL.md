---
name: docs-data-type-ref
description: Write a reference documentation page for a specific data type in a ZIO library. Use when the user asks to document a data type, write an API reference for a type, or create a reference page for a class/trait/object.
argument-hint: "[fully-qualified-type-name or simple-type-name]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(sbt:*), Bash(sbt gh-query*), Bash(git:*), Task, Skill
---

# Write Data Type Reference Page

**REQUIRED BACKGROUND:** Use the `docs-writing-style` skill for prose conventions and the
`docs-mdoc-conventions` skill for code block syntax throughout.

## Target Type

$ARGUMENTS

If no type name appears above ask the user which data type they want to document before proceeding. Do not invent a type name.

## Agent Workflow

**Phase 1 — Research and Plan (Steps 1–2, no writing yet)**

Complete Step 1 (deep source code research). Complete Step 2 (the page's plan: depth tier, which
optional sections apply, and how the API groups). Before writing any documentation file, create one
task per section you'll write plus tasks for Steps 4–10 (compliance, examples, coverage, mdoc,
fact-check, integrate, review). Present the task list to the user for confirmation before proceeding.

**Phase 2 — Write (Step 3)**

Write the page following the plan from Step 2. Mark each task `completed` as you finish it.

**Phase 3 — Verify and Complete (Steps 4–10)**

Execute Steps 4–10 in order: compliance, examples, method coverage, mdoc, fact-check, integrate,
review. Do not reorder these — Step 6 (examples) must land before Step 7 (mdoc) because an embedded
example file that doesn't exist yet fails mdoc outright, and Step 10 (review) must be last because it
grades the page's final, integrated state. Complete all tasks before claiming done.

## Step 1: Deep Source Code Research

Delegate to the **`docs-researcher`** agent with the `Task` tool — it must NOT share your
conversation, so its only knowledge of what to research is what you tell it. It already knows how to
trace source, tests, examples, and commit history, and how to cite what it finds; give it only what
this page needs:

```
Task(
  description: "Research <TypeName> for a reference page",
  subagent_type: "documentation:docs-researcher",
  prompt: "Research <TypeName> for a data type reference page. Find the full public API surface —
           structural signature, type parameters, every companion constructor and factory, predefined
           instances, EVERY public operation with its verbatim signature and a short real usage
           snippet, subtypes or variants, worthwhile comparisons, the imports and sbt dependency, and a
           closing grounding-detail section of verbatim excerpts. This page is exhaustive: an omitted
           operation is a defect.
           Also ask what the commit history states: it is the only source for why the type is shaped
           this way, what a member used to be called, and where a platform differs."
)
```

Reference pages are exhaustive: an operation the agent didn't find is a defect, not an omission you
can shrug off. If its findings are missing or thin, say so and delegate again rather than filling the
gap yourself.

## Step 2: Plan the Page

Before writing a word, decide these from the research — getting them wrong here means rewriting later:

- **Depth tier.** A **supporting** type — research marks it that way, or application code rarely uses
  it directly because it exists to serve other module types — gets a MINIMAL page: the opening
  definition (audience-tier signal + structural shape block) plus one `## Usage` example and, if
  needed, an admonition or two. Skip Creating Values, Core Operations subsections, Comparisons, and
  Integration entirely. A **core** type gets the full structure in Step 3.
- **Does Motivation apply?** Only when a history finding gives a REASON a reader shares — the problem
  the type solves *for people who use it*. Counting findings is not the test: a rename or a platform
  note motivates nothing. No qualifying finding means no Motivation section — omit it rather than
  inventing one.
- **How the API groups.** Core Operations methods are grouped by capability/task (Element Access,
  Transformations, Combining, Querying, Conversion, …) — plan the categories and which methods sit in
  each before drafting, not while drafting.
- **Overload families and sealed hierarchies.** A family differing only by type (`getInt`/`getLong`/…)
  is ONE subsection listing every overload's signature, not one subsection each. A closed sealed
  hierarchy of homogeneous variants (nullary cases, single-field wrappers, no variant-specific API) is
  one shared construction example plus a table in Subtypes/Variants, not one subsection per variant.

## Step 3: Write the Documentation

### File Location and Frontmatter

Place the file in `docs/reference/<type-name-kebab-case>.md`. Open with exactly these four fields, in this order:

```
---
id: <kebab-case-id>
title: "<TypeName>"
description: "A 50-150 character summary of what this page documents."
keywords:
  - "General Domain Concept"
  - "Page-Specific Concept"
  - "<TypeName>"
---
```

The `id` must match the filename (without `.md`). `description` and each `keywords` entry are
double-quoted; `keywords` is a **block list** (one `- "item"` per line) — Docusaurus does not read the
inline `["a", "b"]` form. 3-6 entries, general concept first, the type name last. Write these now,
grounded in the page you're about to write — do not ship the page without them and rely on a later
metadata-backfill pass to catch it.

### Document Structure

Follow this structure precisely. Every section below marked **(required)** must appear for a **core**
type (Step 2). A **supporting** type gets only the Opening Definition and Usage, per Step 2's depth
tier — skip straight to Running the Examples if it has standalone examples.

#### 1. Opening Definition (required)

**NO HEADING FOR THIS SECTION.** Start with a concise, technical definition immediately after the frontmatter—do NOT add any heading (## or otherwise). This content forms the natural opening of the document.

Lead with WHAT the type is and WHY it exists — the problem it solves — not HOW it operates; defer
mechanics to later sections. Use inline code for the type signature. Explain the type parameters.

**State the audience tier.** If research classified this type (or a key method) as a low-level
building block that a higher-level API wraps, signal that up front: "You rarely call this directly; it
is an advanced API for `<case>` — prefer `<high-level API>`." (writing-style rule 26). Document it
fully regardless — this changes the framing, not the coverage.

Pattern:

```
`TypeName[A]` is a **key concept in two or three words** that does X. The fundamental operations are `op1` and `op2`.
```

Then list key properties as bullet points if applicable — only the important, non-obvious ones:

```
`TypeName`:
- Lock-Free — safely shared across fibers with no synchronization overhead
- Atomic — no observer can witness a partially updated state
```

The definition should be concise but informative, with enough detail about type parameters and variance. For example, the `Chunk[A]` is an immutable, indexed sequence of elements of type `A`, optimized for high-performance operations.

After the definition paragraph, include the source definition of the data type in a Scala code block (using plain `` ```scala `` without mdoc, since this is for illustration):

- Show only the structural shape — the trait/class declaration with type parameters, variance annotations, and extends clauses.
- Strip method bodies and private members. Show representative members, not every overload — collapse long homogeneous lists (e.g. `given` instances) to one commented line plus a sentence noting more exist.
- **Keep the real declaration keywords for the TYPE itself** — `case class`, `sealed trait`, `final` on the type. Strip them only from individual *method* signatures shown later (see Core Operations below). A type's own shape is a fact to report accurately, not to simplify away.

After the structural definition, follow immediately with a section header (e.g., `## Usage`) for the next section.

#### 2. Motivation / Use Case (if applicable — see Step 2)

Write what the problem is and why this type is the solution, in storytelling style, as a realistic
scenario — drawn from the history finding that gave the reason. Retell it in your own words; never
quote a commit message or cite a PR number on the page itself.

#### 3. Usage (required)

Show core capabilities through examples, in one `mdoc:reset` block (~10-20 lines). Goal: readers grasp the core idea without reading further. For a simple type one example suffices; for a rich type combine 2-3 scenarios in that single block rather than splitting across several.

#### 4. Installation (if applicable)

Only include this for top-level module types (e.g., `Chunk`, `Context`, `TypeId`). Skip for internal types that come as part of a larger module.

```scala
libraryDependencies += "dev.zio" %% "<library-name>" % "@VERSION@"
```

For cross-platform (Scala.js, Scala Native):

```scala
libraryDependencies += "dev.zio" %%% "<library-name>" % "@VERSION@"
```

Scala versions ← build (`crossScalaVersions`), no fixed list. >1 artifact → one
`libraryDependencies ++= Seq(...)` block, `//` comment above each line = purpose + platforms, never a
table. Full artifact list only in `index.md#modules` (`docs-integrate`, "The published artifacts list").

#### 5. Creating Values (required)

Document every way to create values of the type: factory methods on the companion object (`apply`,
`empty`, `from*`, `of`, `derived`), smart constructors, builder patterns, conversion from other types,
predefined instances. One Markdown subsection per method or capability group.

**When the type is a `case class` built via its primary constructor, show the real case-class
declaration** (`final case class T(..params..) { ... }`) — never a fabricated `def apply`. Only render
a companion-level `apply`/`empty`/`from*` signature when the companion source actually declares one.
Guessing a constructor's parameter names or shape from convention is exactly the kind of thing that
looks right and compiles wrong; copy it from the real declaration your research cited.

#### 6. Predefined Instances (if applicable)

List predefined instances (like `TypeId.int`, `TypeId.string`) organized by category in a table or code block.

#### 7. Core Operations (Required)

Document the primary API organized by category. Group related methods under markdown subsections:

For example:
- **Element Access** (get, apply, head, etc.)
- **Transformations** (map, flatMap, filter, etc.)
- **Combining** (++, combine, merge, etc.)
- **Querying** (exists, forall, find, contains, etc.)
- **Conversion** (toList, toArray, toString, etc.)

Each category `###` opens with a one-line intro previewing what the category does and naming its
methods, before the first `####` — never stack the category heading directly against a subsection
heading with nothing between them.

**Group by capability, not one subsection per method.** A subsection covers a *group* of related
methods under a title naming the intent, not a single API symbol:

- ✅ `#### Transforming elements` — body covers `map(f)`, `flatMap(f)`, `collect(pf)` together
- ❌ `#### \`map\` — Transform each element`, then a separate `#### \`flatMap\` — Transform and flatten`, then a separate `#### \`collect\` — ...`

A type with fifteen transformation methods gets one well-organized "Transforming elements" subsection
with a signature block listing all of them and one or two representative examples — not fifteen nearly
identical subsections each repeating the same shape. Exhaustiveness is satisfied by covering every
member somewhere (a signature block entry counts), not by giving each one its own heading. The single
exception: a member whose behavior or caveats genuinely differ enough to need its own explanation earns
its own subsection.

For each capability group:
a. **Use a Markdown subheader** naming the capability, not a method: `` #### Transforming Elements ``, not `` #### `map` — Transform Each Element ``.
b. **Explain what the group does** in plain language, naming the methods it covers.
c. **Show the method signature(s)** in a plain `scala` code block using the simplest trait interface format — just the method name, parameters, and return type, without extra keywords like `override`, `final`, `sealed`. When the group is an overload family (`getInt`/`getLong`/…), list every overload in this one block. For example:

```scala
trait Chunk[+A] {
  def map[B](f: A => B): Chunk[B]
}
```

If the method is in the companion object, show it as a function in the companion object's simplest form:

```scala
object Chunk {
  def apply[A](as: A*): Chunk[A]
}
```
d. **Show a usage example** using the Setup + Evaluated Output pattern:
   - Combine setup and output in a **single code block** using `mdoc:silent:reset` (or just `mdoc:reset` if resetting state)
   - Setup code goes first (define types/values needed), followed by the method call and output
   - This demonstrates both how to call the method AND what it returns

   Example pattern:
   ```
   ​```scala mdoc:reset
   case class Person(name: String)
   val p = Person("Alice")

   p.name  // Shows: val res0: String = Alice
   ```

   **Style rule:** Between any two code blocks, include an **explanatory paragraph** that introduces or describes what the following code demonstrates. Do NOT leave empty lines between code blocks.

   ✅ Correct:
   ```
   ​```scala mdoc
   val x = 1
   ```
   Now let's use x to compute a result:

   ​```scala mdoc
   val y = x + 1
   ```
   ```

   ❌ Wrong:
   ```
   ​```scala mdoc
   val x = 1
   ```

   ​```scala mdoc
   val y = x + 1
   ```
   ```

e. **Note important caveats** using [Docusaurus admonitions](#docusaurus-admonitions)

#### 8. Subtypes / Variants (if applicable — omit when self-evident, e.g. trivial value wrappers)

Document important subtypes (e.g., `NonEmptyChunk` for `Chunk`) with: when to use, how to create, operations that differ, and conversion examples. When kept: one table (variant | field type | meaning) plus one `match` example — a variant earns its own subsection only if it genuinely differs from its siblings, not by default.

#### 9. Comparison Sections (rare — usually omit)

Only worth including against a real, widely-known external analogue where it genuinely adds clarity —
Java's standard library, Scala's stdlib, or established theory. Never a strawman comparison invented to
fill the section. Examples where this earns its place:
- "Ref vs AtomicReference in Java"
- "Chunk vs List vs Array"
- "TypeId vs Scala's TypeTag vs Java's Class"

Use padded table columns for readability (see **`docs-writing-style`** for table formatting rules).

#### 10. Advanced Usage / Building Blocks (if applicable)

Show how the type composes with other types or how it can be used to build higher-level abstractions.

#### 11. Integration (if applicable)

Show this type's direct edges only — a few sentences plus relative-path links (e.g.
`[Schema](./schema.md)`), added after explaining the integration of each related type. Omit if Creating
Values / Core Operations already cover the relationship. If this type belongs to a module that has its
own module reference page, link to that page's "How They Work Together" section rather than redrawing
the same diagram here.

#### 12. Running the Examples (required when standalone example files exist)

**How to create the section:**
1. Use the **`docs-companion-examples`** skill to commission the example files — see that skill for
   the choice between `SourceFile.print` and `mdoc:embed`, and its warning that either mechanism must
   have its file on disk before mdoc runs (Step 6, below, handles the ordering).
2. Embed each example with a short description paragraph, source link, and run command.
3. Place the section at the very end of the page (after Integration).

**When invoking `docs-companion-examples`:** Pass the examples module name (e.g., `schema-examples`), repo name, package name, and specify this is a **data type reference** (for the embedding template).

### Writing Rules

- Document every public method on the type and its companion object.
- Use ASCII art for type hierarchies and data structures.
- Link to related docs using relative paths: `[TypeName](./type-name.md)`.

## Step 4: Verify Documentation Compliance

Run the `docs-check-compliance` skill against both `docs-writing-style` and `docs-mdoc-conventions`
(or `docs-verify-compliance`, which does both). Fix everything it reports before continuing — this
catches prose and code-block issues early, before the more expensive steps below.

## Step 5: Write Examples

Use the **`docs-companion-examples`** skill to commission and verify runnable examples. Do this now,
**before** mdoc verification (Step 7) — an embedded example file that doesn't exist yet fails mdoc
outright, whichever embedding mechanism this project uses.

Pass as context: the examples module name, the package name derived from the type name (lowercase, hyphens removed), and that this is a **data type reference** page.

**Data-type-ref specific:** When printing expression results in examples, prefer `util.ShowExpr.show(expr)` to display both the expression and its evaluated value — this is more informative than `println` for reference documentation, where the project has that helper available.

## Step 6: Verify Method Coverage

Use **`docs-data-type-list-members`** to extract members, then **`docs-report-method-coverage`** to verify coverage:

```bash
/docs-data-type-list-members <TypeName> | /docs-report-method-coverage <TypeName> docs/reference/<type-name>.md
```

Or save members to file first, then report:
```bash
/docs-report-method-coverage <TypeName> docs/reference/<type-name>.md members.txt
```

Coverage report shows completeness by category: Companion Object, Public API, Inherited Methods. Every
member showing "missing" needs either an added subsection/table row, or a documented reason it's
excluded (e.g. it's deprecated, or covered by an overload family's shared signature block).

## Step 7: Verify Documentation

Run mdoc to verify all code blocks compile correctly, scoped to the file(s) you touched — never
unscoped, which recompiles every doc in the repo:

```bash
# Single file:
sbt "docs/mdoc --in <file_path>.md --out website/<file_path>.md"

# Multiple files — repeat the --in/--out pair per file:
sbt "docs/mdoc --in <file1>.md --out website/<file1>.md --in <file2>.md --out website/<file2>.md"
```

**Success criterion:** zero `[error]` lines in mdoc output. `--out` is the same path prefixed with `website/`.

## Step 8: Fact-Check

**This step exists because mdoc cannot catch it.** Every Core Operations subsection carries a plain
` ```scala ` signature block (Step 3.7c) — deliberately not compiled, since it's an illustrative
declaration, not runnable code. That makes it the one place in an otherwise fully mdoc-verified page
where a wrong signature, a hallucinated method, or a stale citation can sit undetected. Runnable `mdoc`
blocks already passed Step 7; this step exists for what they don't cover.

Delegate to the **`docs-reviewer`** agent with the `Task` tool, asking it to fact-check — it must NOT
share your conversation, so its only knowledge of the page is what you tell it. The agent already
knows what counts as a claim, how to verify it, the drift kinds, severity, and how to report an
incomplete check; give it only the page-specific parameters, and say plainly this is a fact-check
call (not a full-page checklist/style review — the agent covers both jobs now):

```
Task(
  description: "Fact-check <TypeName> reference page",
  subagent_type: "documentation:docs-reviewer",
  prompt: "Fact-check this page against source (not a checklist/style review).
           Page: docs/reference/<type-name>.md
           Subject: <TypeName>
           Library source root: <path>"
)
```

It reports each drift with the exact corrected statement to apply, not just a description of what's
wrong. Never fix a drift yourself: delegate every reported drift, verbatim (the exact statement
included), to the **`docs-fixer`** agent with the `Task` tool — never edit the library's source to
match what the page claims, only the page:

```
Task(
  description: "Apply fact-check fixes to <TypeName> reference page",
  subagent_type: "documentation:docs-fixer",
  prompt: "Page: docs/reference/<type-name>.md
           Findings (apply each verbatim):
           <every drift from the fact-check reply, its exact statement included>"
)
```

A drift with `high` or `medium` severity blocks calling this step done; delegate its fix before
moving on.

**Bounded rounds, same shape as Step 10's review:** after `docs-fixer` returns, re-run mdoc, then
delegate the same fact-check to `docs-reviewer` once more — that confirming round is what actually
records the page as clean, since the result is whichever check ran last. If that confirming round
reports genuinely NEW drifts (not the same ones repeated), delegate those to `docs-fixer` too and
confirm again — up to 3 confirming rounds total. If a round repeats the exact same drifts as the
round before it, stop: name the unrepairable drift in your final summary rather than looping. A check
that reported nothing needs no confirming round.

## Step 9: Integrate

Delegate to the **`docs-integrator`** agent with the `Task` tool. It already knows the sidebars.js,
index.md, and build-verification procedure; give it only the page-specific parameters. Reference pages
are linked TO from tutorials and how-to guides that use this type, so ask it for inbound "See also"
links from those pages where relevant:

```
Task(
  description: "Integrate <TypeName> reference page",
  subagent_type: "documentation:docs-integrator",
  prompt: "Page: docs/reference/<type-name>.md
           Category: Reference
           Cross-reference direction: this page is linked TO from tutorials and how-to guides that use
           <TypeName> — add inbound 'See also' links from those pages where relevant."
)
```

## Step 10: Final Review

The last gate, run against the page's final, integrated state — not before Step 9, since this grades
what a reader actually sees, sidebar entry and cross-references included.

Delegate to the **`docs-reviewer`** agent with the `Task` tool, asking for a full-page review. The
agent already knows to run any command an item names rather than trust it, that "cannot verify" fails
the item, and to report the exact corrected statement for every failing item; give it only the page
path and the checklist itself:

```
Task(
  description: "Review <TypeName> reference page",
  subagent_type: "documentation:docs-reviewer",
  prompt: "Full-page review (not a fact-check): evaluate
           docs/reference/<type-name>.md against this checklist. For every failing item, give the
           exact corrected statement to apply, not just what's wrong.

           ## Structure
           - Opening definition appears immediately after the frontmatter with NO heading.
           - The opening includes a plain scala structural block (no method bodies) showing the type's
             real shape (case class / sealed trait / etc. — not simplified away).
           - A Usage section is present as a single mdoc:reset block, not split across several.
           - Sections appear in template order (definition -> motivation -> usage -> installation ->
             creating values -> predefined instances -> core operations -> subtypes -> comparisons ->
             advanced -> integration -> running the examples).
           - Installation appears only for top-level module types.
           - Motivation, where present, gives a reason the reader shares, not a reason about the repo's
             own work (fixtures, tooling, the docs pipeline).
           - Core Operations subsections are grouped by capability (e.g. 'Transforming Elements'), not
             one subsection per individual method name.

           ## Coverage & Content Quality
           - Every public constructor / companion factory is documented under Creating Values, and
             uses the type's real declaration (never a fabricated def apply for a case class).
           - Every public method is documented under Core Operations, grouped by category — accounted
             for by a signature-block entry or table row at minimum, a full subsection where it
             genuinely differs from its siblings.
           - Comparison sections, if present, use padded tables and compare against a real analogue.
           - Running the Examples (if present) embeds each example with a description, source link,
             and run command.
           - Writing-style rules pass (evaluate them in this same pass; report violations as failing
             items too).

           ## Technical Accuracy
           - All method signatures and type names match the real source (spot-check a sample against
             the actual file).
           - No deprecated methods or outdated patterns shown as current.
           - sbt \"docs/mdoc --in docs/reference/<type-name>.md --out website/docs/reference/<type-name>.md\"
             reports zero [error] lines — run it now."
)
```

Never fix a failing item yourself: delegate everything review reports, verbatim (the exact statement
for each), to the **`docs-fixer`** agent with the `Task` tool:

```
Task(
  description: "Apply review fixes to <TypeName> reference page",
  subagent_type: "documentation:docs-fixer",
  prompt: "Page: docs/reference/<type-name>.md
           Findings (apply each verbatim):
           <every failing item from the review reply, its exact statement included>"
)
```

**Bounded rounds:** after `docs-fixer` returns, re-run mdoc, then delegate the same review to
`docs-reviewer` once more — that confirming round is what records the page as passing, since the
verdict is whichever review ran last. If that confirming round reports genuinely NEW failing items,
delegate those to `docs-fixer` too and confirm again — up to 3 confirming rounds total. A round that
repeats the same failing items as before earns no further round: stop, name what's still failing in
your summary, and report the page as not fully passing. A review that reported nothing needs no
confirming round — you're done.
