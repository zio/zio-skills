You turn a GitHub pull request into one subsection appended to a page that already documents the area
it touches. You write no new page and you touch no other page's sidebar entry — the target page is
already in the sidebar, and staying there is the point.

This is the small half of "document this PR." The other half — a PR introducing a genuinely new
module, type, or feature, with nothing existing to extend — is a full new page, and that is
`src/agent.ts` (`flue run src/agent.ts -m "document PR #<n>"`), not this skill: its own gate
instructions already read the PR and take the kind and subject from what it changed. Reach for this
skill only when something already documents the area the PR lands in.

## What you do

1. **Fetch the PR.** `gh` infers the repo from the checkout, no `--repo` needed:

   ```bash
   gh pr view <N> --json title,body,state,labels,commits,closingIssuesReferences | head -c 6000
   ```

   For every issue in `closingIssuesReferences`, and any additional issue number the body mentions via
   "closes/fixes/resolves/relates to/see #" that the JSON field missed:

   ```bash
   gh issue view <N> --json title,body,labels | head -c 6000
   ```

   The PR title becomes your subsection's context, the body and linked issues give you the motivation,
   the commit list gives you what actually changed, and the labels are a tiebreaker in the next step.

2. **Confirm this belongs on an existing page.** It does when: the PR is an enhancement or fix to
   something already documented, labels read `enhancement`/`fix` rather than `feat`/`new-module`, and
   a page in `docs/reference/` or `docs/guides/` already covers the parent topic. Find that page by
   matching the PR title and labels against the `id` in each candidate page's frontmatter — a
   `schema-*` label points at `docs/reference/schema.md` if it exists, "Fix schema derivation" points
   at the page whose `id` is `schema`, and so on.

   If nothing matches — the PR is a new module, type, or substantial feature with no existing home —
   stop. Say so, and name `src/agent.ts` as the right agent for it.

3. **Write the subsection**, appended near the end of the target page (after its last `##` section,
   before a trailing "Running the Examples" section if the page has one):

   ```markdown
   ## <Feature Name>

   <One or two sentences of context, drawn from the linked issue's motivation — what problem this
   solves, not a changelog restatement of the commit list.>

   ### Changes in this PR

   - <what changed, one bullet per material change>

   ### Example

   <a prose sentence ending in `:`, then a runnable `mdoc:compile-only` block demonstrating the change>

   ### API Reference

   <new types or methods, if any — link to their reference page with a relative path if one exists>
   ```

   Drop "API Reference" entirely when the PR added no new public surface. Follow `writing-style` for
   the prose and `mdoc-conventions` for the code block.

4. **Insert it.** Exactly one blank line above the new `##` heading, exactly one blank line after its
   last line of content. Nothing else on the page changes — no sidebar edit, because the page is
   already there.

5. **Verify.** `sbt "docs/mdoc --in <path> --out website/<path>"` — never bare `sbt docs/mdoc`. Zero
   `[error]` lines.

6. **Commit.** `docs(<doc-stem>): document PR #<n> — <short feature name>`.

## When to stop without writing anything

- **The request names no PR number.** Ask, and stop.
- **No existing page covers the PR's area.** This is a new-page case — say so, name `src/agent.ts`,
  and stop rather than forcing a subsection onto an unrelated page.
- **The PR is a dependency bump or internal refactor with nothing a reader would look up.** Say so and
  stop; not every merged PR earns documentation.

## What you are not

You do not rewrite the rest of the target page, fix unrelated issues you notice on the way (note them
in your report instead), or touch `sidebars.js` — that file is for pages, and this PR did not add one.

## Reporting

PR title, linked issues found, the target page, the subsection heading you wrote, and whether mdoc
compiled clean. If you stopped instead of writing, say which condition applied.
