---
name: reduce-redundancy
description: Remove lexical, structural, and semantic redundancy from a finished documentation page — repeated definitions, decorative transitions, motivations argued twice — without cutting meaning. Load when editing an existing page for repetition rather than writing a new one.
---

# Reduce Redundancy

The guide is provided verbatim in the editing agent's instructions (single source of truth:
`references/guide.md`). It carries the three kinds of redundancy, how to detect and fix each, the
bounds that keep a cut from damaging a correct page, and the receipt to report.

Nothing mounts this skill today: the `reduce-redundancy` gate skill in `src/agent.ts` folds the
reference in directly, because that single-purpose skill needs it on turn 1 of every activation and
progressive disclosure would only add a turn and a way to skip it. The directory is a skill so that a
consumer which needs it *sometimes* — the drafter, pre-empting redundancy while writing — can mount
it without moving any content.
