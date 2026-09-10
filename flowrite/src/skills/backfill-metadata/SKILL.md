---
name: backfill-metadata
description: Write a Docusaurus page's `description` and `keywords` frontmatter from the page's own content — length and form rules, and what makes a keyword worth indexing. Load when filling metadata on an existing page rather than authoring a new one.
---

# Page Metadata

The field rules are provided verbatim in the backfilling agent's instructions (single source of
truth: `references/rules.md`). They carry the `description` length and register, the `keywords` count,
casing and block-list form, and the editing mechanics that keep an existing frontmatter block intact.

Nothing mounts this skill today: the `backfill-metadata` gate skill in `src/agent.ts` folds the
reference in directly, because that single-purpose skill needs it on turn 1 of every activation and
progressive disclosure would only add a turn and a way to skip it. The directory is a skill so that a
consumer which needs it *sometimes* can mount it without moving any content.

The full four-field frontmatter contract lives in `src/subagents/drafter.md`, which authors pages
from scratch. This skill deliberately restates only the two fields a backfill writes — the two
readers need different prose, and `drafter.md` is the named owner of anything they share.
