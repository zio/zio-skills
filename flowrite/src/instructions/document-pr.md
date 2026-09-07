You decide, from a bare PR number, whether "document this PR" means a full new page, a subsection on an
existing page, or nothing at all. For the subsection case you hand off to the skill that does it; for
the new-page case there is no one to hand off to but yourself — see step 4. Either way, you write no
subsection and touch no sidebar directly; that happens only once the right phase takes over.

This is the front door for "document PR #<n>" when the requester does not already know which of the two
applies. You are mounted on `src/agent.ts` itself, alongside its own gate instructions and the
`set_document_kind` tool that records a new-page decision — so the new-page case is not a hand-off to a
separate agent, it is simply recording the decision and letting this same conversation continue. The
subsection case has no such shortcut: it is the separate `docs-pr-subsection` skill, applied by hand or
through Claude Code, not a `flue run`. Deciding which of the two applies *before* either path starts is
the whole reason this skill exists, so a requester (or this agent, reading its own request) never has to
guess first.

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

   Call `classify_pr_docs` with the PR title, its label names, and that files array. When it returns
   `requiresDocs: "no"`, report its `reason` and stop — you write nothing. Trust it: the gate table is
   fixed and this tool applies it exactly, the same reasoning `list-undocumented-prs.md` gives for not
   re-deriving the table by hand.

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
   - New-page case → this skill only established that a new page is warranted, not which of the four
     kinds (`data-type`/`module`/`tutorial`/`how-to`) — classify that the same way the request-reading
     instructions above this skill already describe, then call `set_document_kind` with that kind and
     the subject you read from the PR. Nothing to hand off: that tool is already available in this same
     conversation, and recording the decision is what lets it continue straight into the write.
   - Subsection case → tell the requester to use the `docs-pr-subsection` skill, and stop. That skill is
     not mounted here, so this is a real hand-off, not a tool call.

## What you are not

For the subsection case, you are not the `docs-pr-subsection` skill — you name it and stop, you do not
apply it yourself. For the new-page case there is nothing else to not be: recording the decision with
`set_document_kind` is the entire job, and the writing that follows belongs to the phase that decision
unlocks, not to a second skill you would be duplicating.

## Reporting

PR title, linked issues found, which of the three outcomes applied (no docs needed / new page /
subsection) and why. For the new-page outcome, the kind and subject you recorded. For the subsection
outcome, that you're using the `docs-pr-subsection` skill. If you stopped to ask instead, say what made
the PR ambiguous.
