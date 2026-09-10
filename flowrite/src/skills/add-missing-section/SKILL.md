---
name: add-missing-section
description: Insert one missing section — Construction, Predefined Instances, Comparison, When to Use, Advanced Usage, or Motivation — into an existing reference page, at its canonical position, fully written and mdoc-verified. Load when a required section is entirely absent from a reference page (not when it exists but is thin).
---

# Add a Missing Section

The section-type templates are provided verbatim in the add-section agent's instructions (single
source of truth: [`references/section-patterns.md`](references/section-patterns.md)). It carries the
subsection layout, table shape, and code-block modifier for each of the six section types, plus the
cross-pattern rules shared by all of them (code-block modifiers, the sentence-before-a-fence rule,
plain-`scala` signatures).

Nothing mounts this skill today: the `add-missing-section` gate skill in `src/agent.ts` folds the
patterns in directly, because that single-purpose skill needs them on turn 1 of every activation and
progressive disclosure would only add a turn and a way to skip it. The directory is a skill so that a
consumer which needs it *sometimes* — the drafter, writing a fresh page whose sections match one of
these six shapes — can mount it without moving content.
