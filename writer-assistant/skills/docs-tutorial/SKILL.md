---
name: docs-tutorial
description: Write a tutorial for newcomers learning a topic in a ZIO library. Tutorials teach concepts step-by-step in a linear path for learning-oriented, not task-oriented, purposes. Use when writing comprehensive learning guides.
allowed_tools: Read, Glob, Grep, Bash
---

# Write a Tutorial

Write comprehensive, learning-oriented tutorials for newcomers to ZIO library topics.

## Overview: What Makes a Good Tutorial

A tutorial is **learning-oriented** — it teaches concepts and builds mental models for newcomers encountering a topic for the first time. It is neither a reference page (which documents an API exhaustively) nor a how-to guide (which helps practitioners accomplish a specific task). A tutorial assumes the reader has no prior knowledge and follows a linear, carefully controlled learning path.

Key properties of a good tutorial:

- **Targets newcomers**: The reader is encountering this topic for the first time. Assume nothing.
- **Teaches concepts, not tasks**: The goal is understanding, not accomplishing a specific thing yet.
- **Linear path**: No branching ("if you need X, do Y instead"). Pick one path and follow it.
- **Minimal, annotated code**: Code demonstrates concepts; it is not production-ready. Every code example is annotated line-by-line.
- **Learning objectives stated upfront**: The reader knows what they will understand by the end.
- **Intermediate output**: After each step, show results so the learner can verify they're on track.
- **Warm, welcoming tone**: Use "Welcome", "Let's", "notice that", "try changing X to see Y".
- **Recap at the end**: "What You've Learned" restates objectives as completed achievements.

---

## Step 1: Deep Research — Understand the Topic Landscape

Before writing, build a complete mental model of every type, method, pattern, and concept relevant to the tutorial topic. **Delegate the source research procedure (finding source files, tests, examples, and GitHub history) to the `docs-research` skill.**

### Research Questions to Answer

You must be able to answer every one of these questions before proceeding to writing:

**About the learning goals:**

1. What is the ONE core concept or skill this tutorial teaches?
2. What prerequisite knowledge must the learner already have? (e.g., "basic Scala syntax", "understanding of case classes")
3. What will the learner be able to do after completing this tutorial?
4. What mental model or conceptual framework will the learner have?

**About the types involved:**

5. For each core type: What is it, in one sentence? What role does it play in learning this concept?
6. What is the dependency/composition order? (e.g., "First understand X, then understand how Y builds on X, then combine them with Z")
7. Which factory methods and constructors will the learner actually use?
8. What type class instances are derived automatically vs. must be created manually?

**About the narrative arc:**

9. What is the simplest possible starting point? (The "hello world" for this concept)
10. What layers of complexity can be added incrementally? (e.g., start with a flat structure, then add nesting, then add variation)
11. Where should you pause to show intermediate results? (e.g., print output, display a value, demonstrate behavior)
12. What is the natural ending point — the "complete" version?
13. What is one key "aha moment" you want the learner to have?

**About the ecosystem:**

14. What imports does the learner need?
15. What sbt dependencies are required?
16. Are there Scala 2 vs. Scala 3 differences the learner should know about?
17. Does this integrate with other ZIO libraries (ZIO HTTP, ZIO Streams, etc.)?

---

## Step 2: Design the Tutorial Structure

### Structural Template

```
1. Introduction
   - Who this is for (newcomer with no prior knowledge)
   - Learning objectives (bullet list)
   - Overview of what the tutorial covers (brief outline)
   - "We recommend reading from top to bottom"

2. Background / The Big Picture (optional, 1-2 paragraphs)
   - Conceptual framing: what problem this API was designed to solve
   - No code — just mental model

3. Concept sections (3-6 sections, each one new idea)
   - Explanation of the concept (1-3 sentences)
   - Minimal working code block (annotated line-by-line)
   - Output or result showing it worked
   - No branching, no "alternatively"

4. Putting It Together
   - The complete, runnable example combining all concepts
   - mdoc:compile-only block

5. Running the Examples
   - Git clone + sbt runMain per step (same format as how-to guides)

6. What You've Learned
   - Bullet-point recap of each learning objective

7. Where to Go Next
   - Links to how-to guides (for applying the knowledge in practice)
   - Links to reference pages (for API depth)
```

### Section Design Rules

- **Linear progression**: No branching. Never say "if you need X, do Y instead". Pick one path.
- **One concept per section**: Each section introduces exactly one new idea or builds incrementally on previous sections.
- **Concept before code**: Always explain what the code will do and why before showing it.
- **Every section has code**: No pure-prose sections. Every concept is demonstrated with code.
- **Line-by-line annotation**: Every code block is followed by a bullet-point breakdown explaining each line or block of lines.
- **Show intermediate output**: After meaningful steps, show or print results so the learner can verify they're on track.
- **Limit scope aggressively**: Stay focused on the learning objective — don't try to explain everything about a type.

---

## Step 3: Write the Tutorial

### File Location and Frontmatter

Place the file in `docs/guides/` directory (same location as how-to guides):

```
---
id: <kebab-case-id>
title: "<Tutorial Title>"
---
```

The `id` must match the filename (without `.md`).

### Writing the Sections

**Section Heading Format:** Use numbered section headings (e.g., "## 1. Topic Name", "## 2. Next Topic").

#### Introduction

Start with a welcome:

```
Welcome to [Tutorial Title]! This tutorial is for [target learner] who [assumed prior knowledge].
You don't need any prior experience with [topic] to follow along.

## Learning Objectives

By the end of this tutorial, you will understand:

- What [concept A] is and why it matters
- How to [do task B] with [API C]
- The relationship between [concept D] and [concept E]

We'll learn these concepts through:

1. [Section Title]
2. [Section Title]
3. [Section Title]

We recommend reading from top to bottom — each section builds on the previous one.
```

#### Background / The Big Picture (Optional)

If helpful, include 1-2 paragraphs that frame the conceptual motivation (what problem was this API designed to solve, what is the big mental model). **No code in this section.**

#### Concept Sections (3-6 sections, 1 new concept per section)

For each concept section:

1. **Lead with 1-3 sentences** explaining the concept and why it matters.
2. **Show minimal, annotated code** in an appropriate mdoc block.
3. **Annotate the code line-by-line** with bullet points immediately after:

````
```scala mdoc
val x = foo()  // create something
println(x)
````

The code above:

- `foo()` — creates [what]
- `println(x)` — prints the result to see what was created

```

4. **Show the result** — if the code produces output, use `mdoc` (not `mdoc:compile-only`) to show evaluated output.
5. **Add a brief explanation** if the result is non-obvious.
6. **Use Docusaurus admonitions** for important notes (use sparingly):

```

:::note[Title]
[Important observation that the learner should remember.]
:::

:::tip[Title]
[Practical guidance or a useful pattern.]
:::

:::caution[Title]
[Something to watch out for or a common mistake.]
:::

```

7. **Provide copy-pasteable code** — never use pseudo-code or fake error messages.
8. **Never branch** — no "alternatively" or "if you need X".

#### Putting It Together

Show the complete working example combining everything from the tutorial. Use `mdoc:compile-only` or `mdoc:silent:reset` + `mdoc:compile-only`.

#### Running the Examples

All examples in this tutorial have corresponding runnable Scala files in the `zio-examples` module. Run them in order to progressively build your understanding in practice.

For each companion example, add a `###` subsection with this structure:

1. **Narrative** (1–2 sentences): what the example demonstrates and why it matters.
2. **Embedded source** in a `<details>` block:
```

   <details>
     <summary>path/to/ExampleFile.scala</summary>

`​`​`scala mdoc:embed:path/to/ExampleFile.scala:show-line-numbers
   `​`​`

   </details>
   ```
3. **"Observe X:"** — one sentence describing what to watch in the output, ending with `:`.
4. **Run command** in a `bash` block:
   ```bash
   sbt "module/runMain package.ClassName"
   ```

> **Dependency**: `mdoc:embed` requires `"dev.zio" %% "zio-sbt-source" % "0.6.0"` in `libraryDependencies`.

#### What You've Learned

Recap as achievements, mirroring the "Learning Objectives" section:

```

## What You've Learned

In this tutorial, you learned:

- What [concept A] is and why it matters
- How to [do task B] with [API C]
- The relationship between [concept D] and [concept E]

You now have a solid foundation in [topic]. The next step is to see how to [apply this in practice].

```

#### Where to Go Next

Provide links to deepen knowledge:

```

## Where to Go Next

- **Ready to use this in practice?** Check out the how-to guide [Guide Name](../guides/guide-name.md).
- **Want to dive deeper into the API?** Read the reference page for [`TypeName`](../reference/type-name.md).
- **Interested in related concepts?** Explore [Related Topic](./related-topic.md).

```

### Writing Style Rules

**Use the `docs-writing-style` skill for universal prose style, Scala version rules, and code block conventions.**

**Additional style notes for tutorials:**

- Use warm, welcoming language: "Welcome", "Let's", "Notice that", "Try changing X to see what happens"
- Use present tense: "we learn", "we see", "we observe"
- Address the learner directly: "you now understand", "you can now do"
- Keep explanations brief and clear

### Compile-Checked Code Blocks with mdoc

**Use the `docs-mdoc-conventions` skill** for the complete mdoc modifier table, key rules, and guidance on choosing modifiers for tutorials (use `mdoc:reset` at the start of concept sections for isolation).

---

## Step 4: Verify Mdoc Compilation

Before integration, verify all code examples compile:

```bash
sbt "docs/mdoc --in docs/guides/<tutorial-name>.md"
```

**Important:** Always use `--in <file.md>`. Never use bare `sbt docs/mdoc` (it recompiles all documentation).

---

## Step 5: Review Checklist

Before submitting, work through the **[CHECKLIST.md](./CHECKLIST.md)** — all 38 items across 5 groups:

1. **Content Quality** (13 items) — Linear path, one concept per section, warm tone, etc.
2. **Technical Accuracy** (6 items) — Signatures match source, mdoc modifiers correct, no deprecated patterns, zero compilation errors
3. **Companion Examples** (8 items) — One file per concept, `CompleteExample.scala`, all compile
4. **Running the Examples** (4 items) — git clone, sbt runMain, sbt compile
5. **Style and Integration** (7 items) — Frontmatter `id` matches filename, in `docs/guides/`, added to sidebars under "Guides", linked from docs/index.md

---

## Step 6: Integrate into Docs

Place the tutorial file in `docs/guides/` (not `docs/reference/`), then invoke the **`docs-integrate`** skill to complete site wiring:

- sidebars.js — add under "Guides" category (not "Reference")
- docs/index.md — add cross-reference
- Related reference pages — add reciprocal links in "See also" sections
- Mandatory compilation gate — mdoc + full Docusaurus build
