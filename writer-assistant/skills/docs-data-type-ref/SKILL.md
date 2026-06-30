---
name: docs-data-type-ref
description: Write reference documentation for a specific ZIO data type. Research the type, write comprehensive documentation with examples, verify mdoc compilation, and integrate into docs.
tags: [documentation, data-type, reference, zio, agent-skills]
---

# Write Data Type Reference Page

You are an expert technical writer for ZIO library documentation. Your task is to produce a reference documentation page for a specific data type. The page must be comprehensive, accurate, and follow ZIO documentation conventions.

## Core Guidelines

- Document every public method on the type and its companion object
- All code examples must compile with zero errors
- Follow the document structure precisely
- Use ASCII art for type hierarchies
- Link to related docs using relative paths: `[TypeName](./type-name.md)`

## The 4-Phase Workflow

### Phase 1: Research

Research the data type thoroughly:

1. Locate the source file and read the complete type definition
2. Study the test files to understand usage patterns
3. Find real-world examples in the ZIO ecosystem
4. Document all public methods and companion object methods
5. Note important properties, subtypes, and integration points

### Phase 2: Write Documentation

Write the reference document following this structure precisely:

#### Section 1: Opening Definition (required)

- NO markdown heading — start immediately after frontmatter
- Use inline code for the type signature (e.g., `` `TypeName[A]` ``)
- Explain type parameters and core purpose in 1-3 sentences
- List key properties as bullet points
- Include the source definition in a plain `scala` code block (no mdoc)
- Show only structural shape: trait/class declaration with type parameters and variance
- End with section heading for next section (e.g., `## Quick Showcase`)

Pattern:

```
`TypeName[A]` is a **key concept** that does X. The fundamental operations are `op1` and `op2`.

`TypeName`:
- Property 1 — brief explanation
- Property 2 — brief explanation

\`\`\`scala
trait TypeName[+A] {
  // structural definition only
}
\`\`\`

## Quick Showcase
```

#### Section 2: Motivation / Use Case (if applicable)

Write what the problem is and why this type is the solution using a realistic scenario.

#### Section 3: Quick Showcase (required)

Show core capabilities through 1-3 examples in a single `mdoc:reset` block (10-20 lines).
Goal: readers grasp the core idea immediately.

#### Section 4: Installation (if applicable)

Only for top-level module types. Include Scala version support (2.13.x and 3.x).

#### Section 5: Construction / Creating Instances (required)

Document all ways to create values:

- Factory methods (`apply`, `empty`, `from*`, `of`, `derived`)
- Smart constructors
- Builder patterns
- Conversions from other types
- Predefined instances

Each method gets a subsection with explanation and code example.

#### Section 6: Predefined Instances (if applicable)

List predefined instances (e.g., `TypeId.int`, `TypeId.string`) in a table or code block.

#### Section 7: Core Operations (Required)

Group related methods under subsections:

- Element Access (get, apply, head, etc.)
- Transformations (map, flatMap, filter, etc.)
- Combining (++, combine, merge, etc.)
- Querying (exists, forall, find, contains, etc.)
- Conversion (toList, toArray, toString, etc.)

For each method subsection:

1. Use pattern: `` `MethodName` — Brief Description ``
2. Explain what it does in plain language
3. Show method signature in plain `scala` code block (no mdoc)
4. Show usage example with setup + output in single `mdoc:reset` block
5. Include explanatory paragraph between code blocks (never leave blank lines between blocks)
6. Note performance characteristics when relevant (e.g., "O(1)", "O(n)")
7. Use admonitions for important caveats

#### Section 8: Subtypes / Variants (if applicable)

Document important subtypes with: when to use, how to create, operations that differ, conversion examples.

#### Section 9: Comparison Sections (when applicable)

Compare with analogous concepts (Java, Scala stdlib, theoretical CS) when it adds clarity.

#### Section 10: Advanced Usage / Building Blocks (if applicable)

Show how the type composes with other types or builds higher-level abstractions.

#### Section 11: Integration (high-confidence only)

Include ONLY when ALL of these are true:

- The type has non-trivial integration with another specific ZIO module or external library (e.g., ZIO HTTP, ZIO Kafka, SLF4J MDC).
- The integration requires setup or wiring beyond a simple `import` or method call.
- There is a concrete, runnable code example to show — not just a prose description.

Skip this section if the "integration" is just using the type alongside other ZIO primitives (Fiber, ZLayer, Ref) in normal ZIO programs — that is not integration, it is basic usage. When in doubt, omit.

#### Section 12: Running the Examples (required when standalone examples exist)

Create runnable example project and embed using `mdoc:embed:path/to/file.scala:show-line-numbers` inside a `<details>` block, with description → embedded source → run command.

### Phase 3: Verify

Verify documentation quality and correctness:

1. **Run markdown linting** — check for formatting issues
2. **Extract method list** — ensure all public methods are documented
3. **Check method coverage** — verify every public method has an entry
4. **Compile with mdoc** — ensure all code blocks compile with zero errors
   ```bash
   sbt "docs/mdoc --in docs/reference/<type-name>.md"
   ```
5. **Fix compilation errors** — iterate until zero mdoc errors

### Phase 4: Format and Integrate

1. Format all Scala files: `sbt scalafmtAll`
2. Run lint checks: `sbt check`
3. Invoke the **`docs-integrate`** skill to complete site wiring:
   - sidebars.js — add under "Reference" category
   - docs/index.md — add cross-reference
   - Related docs — add inbound "See also" links
   - Mandatory compilation gate — mdoc + full Docusaurus build
4. Verify CI passes before claiming completion

## Key Conventions

### File Location

Place the file in `docs/reference/<type-name-kebab-case>.md` with frontmatter:

```yaml
---
id: <kebab-case-id>
title: '<TypeName>'
description: '<One-sentence summary of what the type does, ≤150 characters>'
keywords:
  - '<Feature Name>'
  - '<Pattern or Concept>'
  - '<Related Synonyms>'
---
```

### mdoc Code Blocks

- Use `mdoc:reset` for blocks that reset compiler state
- Use `mdoc:silent:reset` to hide output but reset state
- Combine setup and output in a SINGLE block
- Always include explanatory paragraph before code blocks
- Never leave blank lines between consecutive code blocks

### Docusaurus Admonitions

Use for important caveats and notes:

```markdown
:::info
This is an informational note
:::

:::warning
This requires special care
:::

:::caution
Watch out for this edge case
:::
```

## Input Requirements

You will receive the type name and documentation directory path.
Ask for clarification if either is missing or ambiguous.

## Output

Return a structured result:

```json
{
  "typeName": "string",
  "filePath": "string",
  "status": "success|partial|failed",
  "phasesCompleted": ["research", "write", "verify", "integrate"],
  "mdocErrors": 0,
  "methodsCovered": "number/total",
  "notes": "string"
}
```
