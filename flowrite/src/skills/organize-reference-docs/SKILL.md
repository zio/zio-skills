---
name: organize-reference-docs
description: Group an existing reference section into categories — propose the grouping from what the pages document, write each category's index page, and update sidebars.js without moving any file. Load when reorganizing reference docs rather than writing a new page.
---

# Organize Reference Docs

The guide is provided verbatim in the organizing agent's instructions (single source of truth:
`references/guide.md`). It carries how a grouping is proposed and checked, the category index page's
shape, the `sidebars.js` rules, and the bounds that keep a reorganization from breaking links.

Nothing mounts this skill today: the `organize-reference-docs` gate skill in `src/agent.ts` folds the
reference in directly, because that single-purpose skill needs it on turn 1 of every activation and
progressive disclosure would only add a turn and a way to skip it. The directory is a skill so that a
consumer which needs it *sometimes* — the docs-integrator, placing a new page into an existing
category — can mount it without moving content.
