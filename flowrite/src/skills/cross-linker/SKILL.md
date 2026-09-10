---
name: cross-linker
description: Make an orphan documentation page reachable — find the existing pages that should mention it, and add one prose link from each, without touching code, headings or frontmatter. Load when retro-fitting links into a docs tree rather than writing a new page.
---

# Cross-Linker

The guide is provided verbatim in the linking agent's instructions (single source of truth:
`references/guide.md`). It carries the shell recipes that measure inbound links, the rules for where a
link may and may not sit, the anchor rules, and the bounds that keep an edit from damaging a finished
page.

Nothing mounts this skill today: the `cross-link-page` gate skill in `src/agent.ts` folds the
reference in directly, because that single-purpose skill needs it on turn 1 of every activation and
progressive disclosure would only add a turn and a way to skip it. The directory is a skill so that a
consumer which needs it *sometimes* — the docs-integrator, choosing cross-references while wiring a
new page — can mount it without moving any content.
