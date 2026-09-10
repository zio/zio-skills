# Section-Type-Specific Patterns

Templates for writing each canonical section type used by `add-missing-section`. Load this file once
you've identified which section type you need to write — each pattern below specifies the structural
rules and the minimal code-block template.

---

## Construction Section Pattern

One `###` subsection per major factory method or constructor group.

**For each subsection:**

1. Subsection heading is the method name (e.g., `### apply`, `### empty`, `### from[B]`).
2. One sentence explaining what the method does and its typical use case.
3. Signature block in plain ```` ```scala ```` (not mdoc):
   ```scala
   object TypeName {
     def method(...): TypeName[...]
   }
   ```
4. Prose sentence ending in `:` introducing the example.
5. Self-contained code block using `mdoc:compile-only`:
   ```scala mdoc:compile-only
   // Complete example, no output needed
   ```

---

## Predefined Instances Section Pattern

Use a Markdown table with columns: **Instance Name**, **Type**, **Description**.

Group instances by category (e.g., "Common Types", "Numeric Types", "Collections") if more than 5 instances exist.

After the table, add one example demonstrating usage of a few predefined instances:

```scala mdoc:compile-only
// Show using 2–3 predefined instances together
```

---

## Comparison Section Pattern

1. Create a dimensions table:
   - Column 1: Type / Alternative name.
   - Columns 2–N: Dimensions (Mutability, Performance, API Breadth, Laziness, …).
   - Use `✓` / `✗` for binary dimensions or short text for continuous dimensions.

2. Follow the table with **mandatory** "Use X when… Use Y instead when…" paragraphs:

   > **Use `TypeA` when:**
   > - You need immutability
   > - Performance is critical
   >
   > **Use `TypeB` instead when:**
   > - You need lazy evaluation
   > - API breadth is more important than performance

3. Include a code example **only** if API differences require demonstration of calling conventions. Otherwise, skip the example (comparison is conceptual, not operational).

---

## When to Use Section Pattern

1. Add only when the page documents an operator with a genuine close alternative documented
   elsewhere in the section, and neither page's opening prose already contrasts them — most pages
   get nothing (see `add-section.md`'s stop conditions).
2. Same "Use X when… / Use Y instead when…" pairing as the Comparison pattern above, without the
   dimensions table: 2–4 sentences, cross-linked to the alternative's page.
3. No code example — this is orientation between operators, not a comparison of whole types.

---

## Advanced Usage Section Pattern

Create 2–4 `###` subsections, each with:

1. Subsection heading: realistic scenario name (e.g., `### Composing with Results`, `### Custom Derivations`).
2. Brief explanation of the scenario.
3. Prose sentence ending in `:` introducing the example.
4. Code block using `mdoc:compile-only`:
   ```scala mdoc:compile-only
   // Realistic scenario code
   ```

---

## Motivation Section Pattern

1. **Problem paragraph**: describe a limitation or gap that motivated the type's creation.
2. **Naive approach paragraph**: show what a reader might try without this type and why it fails.
3. **Working example**: show how this type solves the problem:
   ```scala mdoc:compile-only
   // Solution using the type
   ```

---

## Cross-Pattern Rules

- Every code block must respect the `mdoc-conventions` skill — pick the right modifier (`mdoc`, `mdoc:silent`, `mdoc:compile-only`, `mdoc:reset`) based on whether the block needs scope sharing or output rendering.
- Prose immediately preceding a code block must end with `:` (`writing-style` Rule 15).
- Type definitions use plain ```` ```scala ```` without mdoc modifiers — they are structural illustrations, not executable examples.
- Method signatures inside Construction subsections likewise use plain ```` ```scala ```` (signature is illustrative; the runnable example follows).
