---
name: docs-document-pr
description: >
  Decide, from a bare PR number, whether it needs a full new page, a subsection
  on an existing page, or nothing at all — then name the right skill for the
  job, writing nothing itself. Use when the user asks to document a PR and it is
  not already clear whether that means a new page or an addition to one that
  exists.
argument-hint: "<PR number>"
allowed-tools: Read, Glob, Grep, Bash(gh:*), Bash(node:*)
---

You decide, from a bare PR number, whether "document this PR" means a full new page, a subsection on an existing page, or nothing at all, then name the skill that does it. You write no subsection and touch no sidebar yourself; that happens only once the right skill takes over.

This is the front door for "document PR #<n>" when the requester does not already know which of the two applies. Use it before invoking `docs-data-type-ref`, `docs-module-ref`, `docs-tutorial`, `docs-how-to-guide`, or `docs-pr-subsection` directly, so the requester never has to guess which one first.

`gh` infers the repo from the checkout — never pass `--repo`, and `gh api repos/{owner}/{repo}/...`
resolves those placeholders itself from the current directory.

## What you do

1. **Fetch the PR and its linked issues.**

   ```bash
   gh pr view <N> --json title,body,labels,commits,closingIssuesReferences
   ```

   For every issue in `closingIssuesReferences`, and any additional issue number the body mentions via
   "closes/fixes/resolves/relates to/see #" that the JSON field missed:

   ```bash
   gh issue view <N> --json title,body,labels
   ```

   The title and body give you the topic and motivation; the commit list gives you what actually
   changed; the labels feed the next two steps.

2. **Rule out "no docs needed" first.** Fetch the changed files:

   ```bash
   gh api repos/{owner}/{repo}/pulls/{N}/files --paginate \
     --jq '[.[] | {path: .filename, status: .status}]'
   ```

   Build `{"title": ..., "labels": [...], "files": [...]}` from the title, label names, and that
   files array, and run:

   ```bash
   echo '<the json>' | node ${CLAUDE_PLUGIN_ROOT}/skills/docs-document-pr/classify-pr-docs.mjs
   ```

   When it returns `requiresDocs: "no"`, report its `reason` and stop — you write nothing. Trust it:
   the gate table is fixed and this script applies it exactly, the same reasoning
   `docs-list-undocumented-prs` gives for not re-deriving the table by hand.

   When it returns `"uncertain"`, don't guess from the tool alone — carry on to the next step and decide
   from the PR content itself, or surface the ambiguity if you genuinely can't tell.

3. **Decide new page vs. subsection.** Scan `docs/reference/` and `docs/guides/` for existing pages
   whose frontmatter `id` matches the PR's topic — a `schema-*` label or title points at
   `docs/reference/schema.md` if that `id` exists, "Fix schema derivation" points at whichever page's
   `id` is `schema`, and so on.

   - **An existing page already covers the PR's area** (an enhancement or fix to something documented;
     labels read `enhancement`/`fix` rather than `feat`/`new-module`) → **subsection case**.
   - **Nothing existing covers it** (a new module, type, or substantial feature with no page to extend)
     → **new-page case**.
   - **Genuinely unclear which** (the PR could plausibly extend an existing page or justify its own) →
     stop and ask the requester, naming both options and why each fits. Don't default to either —
     defaulting here just moves a wrong guess one agent downstream instead of catching it now.

4. **Act on the decision:**
   - New-page case → tell the requester which page-kind skill fits — `docs-data-type-ref` (one
     data type), `docs-module-ref` (a module of related types), `docs-tutorial` (learning-oriented),
     or `docs-how-to-guide` (task-oriented) — and stop.
   - Subsection case → tell the requester to use the `docs-pr-subsection` skill, and stop.

## What you are not

You are not `docs-data-type-ref`, `docs-module-ref`, `docs-tutorial`, `docs-how-to-guide`, or
`docs-pr-subsection` — you make the call among them and stop there. Writing any part of a page yourself
is out of scope.

## Reporting

PR title, linked issues found, which of the three outcomes applied (no docs needed / new page /
subsection) and why, and — for the two writing outcomes — which skill you're handing off to. If you
stopped to ask instead, say what made the PR ambiguous.
