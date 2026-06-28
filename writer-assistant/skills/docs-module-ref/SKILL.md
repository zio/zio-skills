---
name: docs-module-ref
description: Write reference documentation for a module containing multiple related data types. Use when documenting a cohesive domain model (e.g. http-model, resource-management) where types work together as a system.
tags: [documentation, module, reference, zio, agent-skills]
---

# Write Module Reference Documentation

You are an expert technical writer for ZIO library documentation. Your task is to produce reference documentation for a module — a cohesive set of related data types that work together.

## Core Guidelines

- Document every public method on every core type
- All code examples must compile with zero errors
- **The "How They Work Together" section is the centerpiece — never skip it**
- Use ASCII art for type relationships and data flows
- Link between types using relative paths: `[TypeName](./type-name.md)`

## Step 1: Decide Structure

Apply this rule automatically (only ask if the user explicitly overrides):

| Module shape                                               | Structure                                 |
| ---------------------------------------------------------- | ----------------------------------------- |
| ≤ 4 core types, or types always used together              | **Flat** — single file                    |
| ≥ 5 core types, OR ≥ 3 types with rich self-contained APIs | **Hierarchical** — index + per-type pages |

**Flat:** `docs/reference/<module-name>.md`
**Hierarchical:** `docs/reference/<module-name>/index.md` + `docs/reference/<module-name>/<type>.md`

## Step 2: Frontmatter

**Flat or hierarchical index:**

```yaml
---
id: <module-name-kebab-case>
title: '<Module Title>'
---
```

**Hierarchical type page:**

```yaml
---
id: <type-name-kebab-case>
title: '<TypeName>'
---
```

## Step 3: Module-Level Sections

Write these sections in the module index (flat: same file; hierarchical: `index.md`):

### Opening Definition (NO heading — immediately after frontmatter)

- 1–3 sentences: what the module provides
- List core types as inline code: `` `Type1`, `Type2`, `Type3` ``
- Plain `scala` block (no mdoc) showing structural shape of 2–3 main types

Then continue with `## Introduction` or `## Motivation`.

### Introduction (hierarchical) OR Motivation (flat)

- **Hierarchical:** Brief welcome — module role, what readers will learn
- **Flat:** Problem solved, advantages over alternatives, bullet points

### Installation

```scala
libraryDependencies += "dev.zio" %% "<module-name>" % "@VERSION@"
```

Supported Scala versions: 2.13.x and 3.x

### Overview (hierarchical only, optional)

2–3 sentences per core type: what it does, its role, link to its page.

### How They Work Together (REQUIRED for all structures)

**This is the centerpiece — write it carefully.**

Explain the typical workflow as numbered steps, plus an ASCII diagram:

```
Type1 ──> Type2 ──> Type3
     └──> Type4 (variant)
```

Show: type relationships, data flow, composition patterns, dependency order.

### Common Patterns

Named architectural patterns specific to this module:

- Decision tree for choosing between types/variants
- Typical use cases by scenario
- Multi-type composition examples (not single-type snippets)

### Integration Points

How types relate and integrate with other modules:

- Which types use which other types internally
- How this module integrates with the broader ZIO ecosystem
- Cross-references to related docs

## Step 4: Type-Level Sections

### Flat structure — inline `##` headings per type

Each type gets these subsections:

1. **Opening definition** (no sub-heading for the first type): brief definition, type signature, key properties
2. **Predefined Instances** (if applicable): variants, constants
3. **Parsing/Creating**: all construction methods
4. **Key Operations**: grouped methods with 1 example per group
5. **Rendering** (if applicable): conversion to string/wire format

Cover every public method. Group concisely — 1 example per operation group. Performance notes inline (O(1), O(n)).

### Hierarchical structure — full page per type

Follow `docs-data-type-ref` completely for each `<type>.md` file, with one addition:

**Recontextualization rule:** In each section, note how the type relates to other module types:

- Motivation: is this a core or supporting type?
- Construction: note if commonly constructed alongside other module types
- Core Operations: show composition with sibling types where relevant
- Integration: highlight intra-module relationships specifically

## Step 5: mdoc Conventions

- Use `mdoc:reset` for isolated blocks
- Use `mdoc:silent:reset` to hide output but reset state
- Combine setup + output in a SINGLE block — never split them
- Always include an explanatory paragraph before code blocks
- **Never leave blank lines between consecutive code blocks**
- Method signatures: plain `scala` block (no mdoc)
- Usage examples: `mdoc:reset` block

## Step 6: Verify

Compile all files with mdoc:

**Flat:**

```bash
sbt "docs/mdoc --in docs/reference/<module-name>.md"
```

**Hierarchical:**

```bash
sbt "docs/mdoc --in docs/reference/<module-name>/"
```

Success: zero `[error]` lines.

## Step 7: Format and Integrate

1. `sbt scalafmtAll` — format all Scala files
2. `sbt check` — lint checks
3. Update `sidebars.js`:
   - **Flat:** `{ type: "doc", id: "reference/<module-name>" }`
   - **Hierarchical:** category with link to index + items for each type page
4. Update `docs/index.md` — add module link under "Reference Documentation"
5. Add cross-references from related docs

## Output

Return a structured result:

```json
{
  "moduleName": "string",
  "structure": "flat|hierarchical",
  "outputPath": "string",
  "status": "success|partial|failed",
  "phasesCompleted": ["research", "write", "verify", "integrate"],
  "mdocErrors": 0,
  "typesCovered": "number",
  "notes": "string"
}
```
