# flowrite backlog

Open findings, each measured on a fixture run rather than guessed. Every entry names the run that
produced the evidence, so a fix can be checked against the same shape.

Opened 2026-08-17 from `tinyproject-archive/write-tutorial-turn1`, the first tutorial run since the
phase-tool conversion. Ranked by whether the agent currently ships something wrong.

---

## 1. A run invents artifacts to satisfy a check it broke — FIXED in `9406235`, unverified

Fixed at the four sites that could each have prevented it (integrator prohibition broadened, the
tutorial integrate step, "Where to Go Next", writing-style rule 7), plus a deterministic detector:
`pages-outside-one-root` flags a run whose pages land under more than one docs root, and the report now
prints every page path. **Not yet confirmed by a run** — the next tutorial run should write only under
`docs/guides/`, and the flag must stay silent on a hierarchical module run's three pages under one root.


**Evidence — `write-tutorial-turn1`.** A *tutorial* run shipped two stub *reference* pages,
`docs/reference/tally/Ledger.md` and `Window.md`, and wired both into `sidebars.js`. The chain:

1. the drafter wrote links as `{{< tally_reference_path "Ledger" >}}` — a Hugo shortcode, invented, in a
   Docusaurus page
2. those became `../reference/tally/Ledger.md`, which did not exist, and `docusaurus.config.js` sets
   `onBrokenLinks: 'throw'`, so the build would fail
3. the root agent's integrate brief said: *"ensure they have reference pages and link to them … If not,
   **create stub reference pages** with placeholder content"*
4. the integrator obliged — 26 lines each, PascalCase filenames against the kebab rule, unreviewed,
   because review only covers the page the run was asked to write

**Why it matters.** Two defects ship at once: content nobody reviewed, and `Ledger.md` colliding with the
module run's `ledger.md` on any case-insensitive filesystem. It is also the second instance of one repair
pattern — #66 hardcoded `0.1.0` when `@VERSION@` failed rather than fixing the build. The model satisfies
the check by creating something, instead of removing the cause.

**Fix.** State the rule where a run can act on it — a broken link is fixed by not making the claim, never
by inventing the target:
✅ drop the link, or link a page this run wrote ❌ create a stub so the build passes
Then remove the stub-creation licence from the integrate brief, and give the drafter the Docusaurus link
form so it stops reaching for shortcode syntax.

---

## 2. The examples phase has never run since the conversion — FIXED in `c08c5d9`, unverified

Both hedges removed: the write step now states the embed requirement as the template states it and says
not to soften it, and step 5 is unconditional — a draft that came back inlined is a defect to fix, not a
reason to skip the phase. The tutorial checklist gained items for the embed pattern and for every
embedded path existing, so inlining fails review instead of passing as it did on turn1. **Not yet
confirmed by a run** — the next tutorial run should delegate to `examples_builder`, leave `.scala` files
under `tinyproject-examples/`, and carry embeds rather than inlined blocks.

**Evidence — `write-tutorial-turn1`.** Four delegations: researcher, designer, drafter, docs_integrator.
No `examples_builder`, and `tinyproject-examples/` contains no `.scala` file.

The cause is a hedge, not a broken phase. `tutorial-structure` requires
`mdoc:embed:<path>:show-line-numbers` per concept plus one for "Putting It Together"; the delegation brief
downgraded it to *"Putting It Together: Complete Workflow (may include embedded examples)"*. No embed
means nothing to build, so the phase has no reason to fire:

```
"may include" → drafter inlines code → no mdoc:embed → examples phase skipped → 93-line role untested
```

**Why it matters.** `examples-builder.md` is the largest untested surface in the project, and the
`mdoc:embed` single-source-of-truth arrangement is bypassed entirely — the page duplicates code the
examples module is supposed to own.

**Fix.** Make the brief say what the template says. Then re-run and check `tinyproject-examples/` is
non-empty and the page carries embeds rather than inlined blocks.

---

## 3. The structure template's list numbers become headings

**Evidence — `write-tutorial-turn1`.** `tutorial-structure/references/structure.md` enumerates its spec as
`1. Introduction`, `2. Background`, `3. Concept sections (3-6, one new idea each)`. The page emitted twelve
numbered `##` headings, with two schemes colliding:

```
## 6. Concept 4: Bounded Windows and Automatic Removal
## 7. Concept 5: Detecting Window Saturation
## 9. Putting It Together: Complete Workflow
## 11. What You've Learned
```

**Why it matters.** Not fabrication and not a stale rule — an ambiguity in how the template represents
itself. A numbered list reads as prescribed output, and nothing says the digits order the spec. The same
ambiguity exists in the data-type and module templates, which are numbered the same way.

**Fix.** Say once, in each template, that the numbering orders the template and is not heading text; or
renumber the templates as bullets. Add a checklist item for numbered headings so the reviewer can catch it.

---

## 4. Tutorial mdoc guidance is wrong for concept-per-section tutorials

**Evidence — `write-tutorial-turn1`, from the run's own retrospective.**

> "The initial draft used inline mdoc blocks with shared scope, causing variable redefinition errors
> across independent concept examples … Switched all concept examples to `mdoc:compile-only` …
> **Tutorial guidance should explicitly recommend `mdoc:compile-only`**"

`mdoc-conventions` says the opposite: *"A tutorial builds one concept on the previous, so favor a shared,
accumulating scope."* Where each concept redefines `ledger`/`window`, accumulation fails to compile, and
the model worked around its own instructions.

**Why it matters.** The model paid compile errors and edit turns to discover what the skill could have
told it. The advice is right for a tutorial that genuinely accumulates and wrong for one built as
independent concepts — and the template asks for independent concepts.

**Fix.** Split the advice by shape: accumulate when later blocks reuse earlier definitions; isolate with
`mdoc:compile-only` when each concept restates its own setup. Name the redefinition error as the signal.

---

## 5. The reviewer can only check what its checklist names — and one item is over-strict

**Evidence — `write-tutorial-turn1`.** Both defects above (missing embeds, numbered headings) **passed**
review, because no checklist item covers either. Meanwhile an item failed the page for something correct:

> "Sections 1 (Introduction) and 11 (What You've Learned) are pure prose with no code examples.
> **The checklist exempts only Background sections**"

An introduction and a summary are legitimately code-free. **That half is fixed in `c08c5d9`** — the item
now exempts Introduction, Background, "What You've Learned" and "Where to Go Next" — and the missing
embed item landed with it. What remains open here is the numbered-headings gap and the model-generated
item list.

Related, and measured across three runs: the reviewer **synthesises its own item list** — round 1
enumerated 46 items, round 2 enumerated 44, the module run 41 — inventing per-section instances like
`rule 8 (Section 3)`. So `42/46` and `42/44` are not comparable, and a "N/M items passed" line cannot be
tracked across rounds or runs.

**Why it matters.** The checklist is the reviewer's entire competence: it does not have the structure
skill mounted. Anything a page must have, and anything a reviewer must be able to do, has to appear in the
item that demands it — the lesson `4fcb7cd` already learned for the mdoc command.

**Fix.** Add items for the embed pattern and for numbered headings; exempt Introduction, What You've
Learned and Where to Go Next from the code-example rule. Separately, decide whether the item list should
be fixed rather than model-generated — a stable denominator is what makes the pass count a metric.

---

## 6. The confirming round is spent by a round that finds new failures — FIXED, unverified

`consumeReviewRound` now renews the grant when the round that spent the last one reported items the
round before it never mentioned: that round confirmed nothing, it found more work. Capped at three
confirming rounds, and a round that merely repeats the previous findings still ends the run. **Not yet
confirmed by a run** — the next run whose second review raises new items should get a third round, and
`verdict.json` should describe the page as the run left it.

**Evidence — two runs on 2026-08-19, one fixture and one real repo.**

| Run | Recorded verdict | The page as shipped |
| --- | --- | --- |
| zio-blocks async (`.env.production`) | `failed` — rules 4, 8, 17 | rule 8 fixed (0 dot-prefixed refs), rule 17 fixed (blocks split), rule 4 fixed but for one bullet |
| `write-tutorial-turn3` | `failed` — 4 items | mdoc re-run reports `0 errors`; `var` gone (`foldLeft`); 2 of 4 items real |

Both ran the same shape: round 1 failed, the confirming round was granted, and round 2 raised items
round 1 had missed. The grant was gone, the third call was refused, and `recordedVerdict()` froze on
findings the run then repaired.

**Why it matters.** The verdict is the measurement layer every other finding is judged by — "fixed,
unverified" becomes checkable only when a run's own record describes the page it actually left behind. A
verdict that reports `failed` for a repaired page is indistinguishable from one reporting a real failure,
so no trend can be read across turns.

Both runs proposed this fix in their own retrospectives, independently:

> "Allow one additional confirming round when the second review finds NEW failures not present in the
> first review."

---

## 7. The fact-check gate ships with no live measurement — OPEN

`fact_check_page` and the `fact_checker` role landed with the verdict wired to their result, and
nothing has ever watched them run. The acceptance test exists and did not execute: the run on
2026-08-24 died on turn 1, `tokens=0`, on

```
400 invalid_request_error "You have reached your specified API usage limits.
You will regain access on 2026-09-01 at 00:00 UTC."
```

so the API refused the request before the phase started. What IS verified is local only — `tsc`
clean, 97 unit tests, `vite build`, and the agent assembling far enough to open turn 1 on
`claude-haiku-4-5`. Detection quality is entirely unmeasured.

Do not read the green unit tests as evidence about the gate. They pin the budget arithmetic, the
verdict folding and the section splitting — all the parts that do not involve a model. Whether the
role finds a real drift, and whether it invents one on correct prose, is exactly what they cannot say.

Run `bash test-fixtures/fact-check/verify.sh` when the key works. It plants a page carrying 5 known
drifts and 4 correct claims and runs only the fact-check phase; the script's header documents each
one and the pass criterion. The false-positive half is the half that matters — a gate that fails
correct pages gets switched off, and then the real findings go unread with it.

Three decisions are waiting on that run's evidence, all of them currently guesses:

- `low` drifts are reported but do not fail the run, on the theory that `stale-citation` is where a
  false positive is likeliest. If the run shows otherwise, `low` should gate too.
- 8 chunks × 8,000 chars per round. Serial by necessity (a harness session runs one operation at a
  time, so `Promise.all` over `harness.prompt` throws `SessionBusyError`), which makes this a
  wall-clock budget as much as a token one, and nothing has measured it.
- A hierarchical module run shares one budget across its index and every subpage. That may be too
  tight; a module run is the case to watch.

## 8. `skipPhases` never reached the model — FIXED in this branch, unverified

Only `review_page` and `fact_check_page` are code-gated, so those were the only two phases a skip
could ever stop. Research, design, write and integrate are prose-driven `task` delegations, and
nothing put the skip list in front of the model — so `skipPhases: ["research","design","write"]`
researched, designed and wrote anyway, while the run directive it was supposed to override went on
naming the full flow.

That directly contradicts the creation-data field's own description: "Skipping a head-phase prefix
resumes a run whose artifacts already exist, e.g. `["research","design","write"]` runs only the
examples/integrate/review tail."

Found while trying to run the fact-check phase in isolation — which the field promised and could not
deliver. It went unnoticed because nothing needed it: once the other thirteen phase tools were
deleted, the only phases anyone actually skipped were the two still gated in code, so the
enforcement surface moved out from under this field and nothing noticed.

Fixed by `skippedPhases()` plus a `useInstruction` in `useDocsWriter` naming the skipped phases and
saying their artifacts are already on disk. A phase gated in code refuses the call; a phase driven by
prose needs the prose. Unverified for the same reason as finding 7 — no run has exercised it.

## 9. The redundancy editor ships with no live measurement — OPEN

`src/redundancy.ts` landed complete and has never run against a model. Same cause as finding 7: the
key returns `"You have reached your specified API usage limits. You will regain access on 2026-09-01"`,
so the acceptance test was written and not executed. Local evidence only — `tsc` clean, 102 unit tests,
and the mechanical half of `test-fixtures/redundancy/verify.sh` exercised against a simulated good run
and a simulated bad one (it correctly passed the first and reported KILL on the second).

This one carries a risk the fact-check gate does not: **it edits, and nothing downstream re-checks it.**
A fact-checker that invents a drift wastes a round. An editor that cuts the wrong sentence ships a page
with a hole in it, from a page that had already passed review. The bounds in
`src/skills/reduce-redundancy/references/guide.md` are the whole defence, and they are unmeasured prose.

Run `bash test-fixtures/redundancy/verify.sh` when the key works. It plants a page with 7 seeded
redundancies and 5 decoys; the script's header documents every one. The decoys are the half that
matters.

Kill criteria, not tuning knobs — if the run shows any of these, delete the agent rather than adjust it:

- a code block is touched (the guide forbids it outright, and mdoc scope means one cut breaks blocks
  below it),
- a heading moves (structure belongs to the template and the reviewer),
- a decoy is cut — particularly DEC-4, the only place on the page that says `seeded` takes a `Long`.

Two smaller unknowns waiting on the same run:

- The three-occurrence threshold for a repeated *phrase* is a guess. Two occurrences might be worth
  cutting; four might be the real floor.
- Whether the receipt's `left` lines actually get written. They are the only evidence that a bound
  held rather than that nothing was noticed, and an instruction asking for a report of inaction is
  exactly the kind that gets quietly skipped (compare the measured `ask_for_clarification` case in
  `agent.ts`, where naming the alternative as a capability is what made it real).

## 10. The metadata backfiller ships with no live measurement — OPEN

`src/metadata.ts` and `scripts/backfill-metadata.sh` landed complete and have never run against a
model. Same cause as findings 7 and 9: the key returns `"You have reached your specified API usage
limits. You will regain access on 2026-09-01"`. Local evidence only — `tsc` clean, 102 unit tests, the
agent verified to render and submit (it reached the API and returned `backfill-metadata run report:`
with the right label before failing on the limit), the driver exercised against a scratch tree
(`build/` pruned, a complete page skipped, a page carrying decoy `description:`/`keywords:` lines in
its *body* correctly not skipped), and `test-fixtures/metadata/verify.sh` replayed against a simulated
good run (20/20) and a simulated bad one (12 passed, 8 failed, non-zero exit — every planted
misbehaviour caught).

It shares finding 9's risk — **it edits, and nothing downstream re-checks it** — with one difference in
each direction. Smaller: it only fills fields that are empty, so its worst ordinary output is a dull
description where there was none. Larger: it is meant to run over a whole tree unattended, so a silent
mangle is N damages before anyone looks. The answer chosen is `git`, not code: the driver refuses to be
quiet about a dirty working tree, prints the `git diff` command to run, and prints the
`git checkout --` that undoes one page. `scripts/backfill-metadata.sh`'s header records why it does
*not* validate each page itself, and exactly what would earn that check.

Run `bash test-fixtures/metadata/verify.sh` when the key works. Five pages, four of which test
restraint; the script's header documents each one.

Kill criteria, not tuning knobs:

- a page **body** changes (the agent's mandate is two frontmatter fields — `code-heavy.md` carries a
  `---` line inside a yaml fence precisely to probe this),
- `complete.md` is edited at all, or the driver fails to report `skip` for it,
- a pre-existing frontmatter key is reordered, rewritten or dropped — including
  `keywords-missing.md`'s own `description`, which a better-phrasing model must still leave alone.

Two smaller unknowns waiting on the same run:

- **Whether Haiku clears the 50-character floor without padding.** The tier was chosen because a dull
  description beats none; if it pads to reach the floor, the floor is producing filler and the answer
  is Sonnet, not a lower floor.
- **Whether keywords come out as Title-Case concepts or lowercase single words.** The rules say
  `"Trace Sampling"`, not `"tracing"`, and nothing enforces case.

## Observations, recorded while porting the backfiller

Neither is worth a change on its own; both would be cheap to fix inside a change that is already
touching the file.

- **The drafter's frontmatter contract contradicts itself.** `src/subagents/drafter.md:13` says
  "exactly these four fields, in this order, and nothing else", and the structure block joined *after*
  it shows two-field examples — `src/skills/data-type-ref-structure/references/structure.md:7-15` and
  `src/skills/module-ref-structure/references/structure.md:48-63,78` print `id` + `title` frontmatter
  with no `description` and no `keywords`. The model reads the narrower example last. Left alone
  deliberately: it changes the drafting prompt for every kind and needs its own run to judge.
- **Two files now state the same two limits.** `src/subagents/drafter.md` and
  `src/skills/page-metadata/references/rules.md` both say 50-150 characters and 3-6 keywords. This is
  deliberate — the drafter authors four fields from nothing, the backfiller preserves `id`/`title` and
  writes only what is absent, and one text serving both would hedge every sentence — but it is a real
  drift risk. **`drafter.md` is the owner**; `rules.md` says so in its opening lines.
- **`buildRunReport` flags phases that a standalone agent never has.** Both `reduce-redundancy` and
  `backfill-metadata` runs report `review-not-run` and `fact-check-not-run`, which are meaningless
  outside a write flow. Harmless noise today; misleading if anyone ever greps run reports across
  agents.

## 11. The how-to guide kind ships with no live measurement — OPEN

`how-to` is the fourth `DOC_KINDS` member and no run has produced a page. Offline coverage is real —
`tsc` forces the row and both maps, 105 tests pass, and three new assertions cover what had no type
behind it — but everything genre-shaped is unproven:

- **Does the gate classify a task-shaped request as `how-to`?** This is the one that matters. A
  misclassification is silent end to end: `run-telemetry.ts` is kind-agnostic by construction and keys
  on the `docs/` path segment, which is `guides` for both guide kinds, and the reviewer is handed
  whichever checklist the gate chose. A how-to misfiled as a tutorial is reviewed against the tutorial
  checklist, passes, and files `verdict: passed`. The cheap check is one turn: start
  `run-how-to-guide.sh` and Ctrl-C after the classification line (the INT trap archives).
- **Does the "before" block come out as `mdoc:compile-only`, free of the documented library's API?**
  The whole Problem section rests on it. Under a plain fence it becomes the most scrutinized text on
  the page (`fact-checker.md:16`) and a `not-in-source` drift is blocking, so a correct page could fail
  its own run.
- **Does any heading carry template vocabulary?** `## Step 1:` / `## Capability 2:` by the same
  mechanism as finding 3. The checklist has the item; nothing else does.
- **Does `Putting It Together` come out as an empty `mdoc:embed`, or inlined?** If inlined, the
  examples phase has nothing to build — finding 2 again, in a new kind.

**The fixture bounds the answer.** `fixtures/tinyproject` is a dependency-free library with seven
types and no boilerplate to suffer, so the before-block has nothing real to be painful about and the
drafter will invent it — the one thing fact-check can neither confirm nor deny. A passing run proves
the plumbing, not the genre. Also do not run it on `Lens`: `docs/guides/lens.md` is committed and
already how-to-flavoured, so that topic overwrites a page instead of exercising the empty-start path.

## Observations, recorded while porting the how-to kind

None is worth a change on its own; each is cheap inside a change already touching the file.

- **`:showLineNumbers` and `:show-line-numbers` are both in the tree, and neither is proven.**
  `src/skills/mdoc-conventions/SKILL.md:22` says camelCase; the two structure templates and two
  checklists say kebab (4-to-1). One of them does not resolve. **No fixture archive contains a built
  page with either form** — finding 2 records the examples phase never having run since the conversion
  — so a majority vote is not evidence. The how-to files use kebab, matching the other kinds. The first
  run that actually builds an `mdoc:embed` settles it; do not "fix" it before then.
- **Finding 3's diagnosis is wrong, and the mitigation follows the diagnosis.** It blames the
  templates' numbered lists for `## 6. Concept 4: Bounded Windows`, but `## 1.` was *compliant* —
  `src/skills/tutorial-structure/references/structure.md:46` mandates "Use '## 1. Topic'". What leaked
  is the template's **placeholder label**: item 3 reads `Concept sections (3-6, one new idea each)` and
  the page emitted `Concept 4:`. That is writing-style rule 27's category, but rule 27 enumerates
  specific terms, so no reviewer item covered it. The how-to template emits literal headings and its
  checklist carries an explicit item; the other three still inherit the label mechanism. Finding 3's
  claim that "the same ambiguity exists in the data-type and module templates" is also unsupported —
  the numbered-heading mandate exists only in `tutorial-structure`.
- **`GATE_INSTRUCTIONS` is the one place the kinds are enumerated in prose.** Nothing derived it from
  `DOC_KINDS`, so a kind could be fully wired, pass `tsc` and pass every test, and never be offered to
  the model that has to choose it. There is now a test asserting presence — not that the discriminator
  between two kinds is any good, which only a live run reaches.
- **The predecessor's how-to path was partly fictional.**
  `writer-assistant/workflows/phases/verify.ts` told the model to read a checklist that never existed
  in that tree, and `ARCHITECTURE.md` asserted it did. The real material was in
  `plugins/documentation/skills/docs-how-to-guide/`, which is not being deleted. Relevant to the
  remaining audit gaps: a `writer-assistant` file is not evidence that the behaviour it describes ever
  ran.
- **`README.md` and `flowrite/CLAUDE.md` both name fixtures that do not exist.** `tinyoptics` and
  `tinytally` are referenced throughout (README `:98,:167,:173,:177,:253`; CLAUDE.md's whole "which
  fixture to run" section); only `fixtures/tinyproject/` is on disk. So the guidance on which fixture
  to use for a given check points at nothing. Left alone here — it is not this kind's business, and the
  fix is a decision about the fixtures rather than an edit.
- **`npm` cannot run this package's scripts at all.** `devEngines` requires pnpm, so `npm test` and the
  new `npm run typecheck` both die with `EBADDEVENGINES`. The binaries work directly
  (`./node_modules/.bin/tsc --noEmit`), which is what every verification step actually uses.

## 12. The cross-linker ships with no live measurement — OPEN

`src/crossref.ts` makes one orphan page reachable. `tsc` is clean, 105 tests pass, and every shell
recipe in its guide was verified against a real 299-page corpus (see the spec's Verification table) —
but no run has produced an edit. What a first run must answer, in priority order:

- **Did it confirm orphan status before editing anything?** The instruction file makes "already has
  prose links" a hard stop. A run that edits a page which was already reachable has ignored its first
  step, and the receipt is where that shows.
- **Is every inserted link in prose?** Not inside an inline-code span, a fence of any length,
  frontmatter, a heading, or another link. This is the one that matters:
  `docs/reference/services/random.md:14` in zio/zio is a published instance of the inline-code-span
  failure, invisible to `mdoc` and to `onBrokenLinks`, which survived a 94-file human review. The
  guide's grep catches it — `` grep -nE '`\[[^]]*\]\([^)]+\)' `` — and a run should be checked with
  it rather than by eye.
- **At most one link per source page, and did it wrap rather than rewrite?** The bound is prose only;
  nothing enforces it. Any reworded sentence in the diff is a defect, not a style choice.
- **Did it refuse to create a target?** `fixtures/tinyproject/docs/reference/index.md` names modules
  that have no pages, so it is a ready-made adversarial read-only case for finding 1's failure — a run
  pointed near it must drop the link, never manufacture the page.

- **Did a batch stop where it was told?** A request may now name several targets. Three things to check:
  the run worked only the targets named, it emitted the closing `targets: N of N` line, and on a failed
  verification grep it emitted `HALTED:` and abandoned the rest. Both lines are required output
  precisely because their absence is otherwise indistinguishable from a run with nothing to report.

**The fixture cannot exercise this.** Four pages, three of them `index.md`, and writing to it would
modify tracked files, which `flowrite/CLAUDE.md` forbids. So the first real run has to be on a corpus
with prose to link — on a branch, on a clean tree, with the diff read before anything is staged.

**Run a single target before running a batch**, whatever the instructions permit. Every added line of a
one-target run contains that target's path, so a one-token grep audits the entire diff; that is the
cheapest possible read of whether this agent behaves. A batch replaces that with a deliberate
whole-diff audit, which is weaker in exactly the way `random.md:14` demonstrated — it survived a
94-file human review.

## Observations, recorded while adding the cross-linker's batch mode

- **A correct no-op is sticky, and that is why an agent must not pick its own targets.** 44% of a real
  tree's orphans (80 of 181) have their subject phrase in no other page, so "added nothing" is the right
  answer — but the page stays orphaned, so a survey-driven loop returns it first on every invocation.
  The completion test records the *edit* outcome and cannot record "processed, correctly empty". Worth
  generalising: **a file-derived done-test only works when doing the work always changes a file.** The
  metadata backfiller satisfies that; a linker does not.
- **The context window binds long before cost does.** Candidate sets on the real tree: `TRef` 6 files,
  `Promise` 24, `Task` 45, `ZLayer` 63 (~186k tokens). Re-sending earlier targets is cheap at this
  repo's ~0.78 cache ratio — about +58% at three targets — but one large subject read exhaustively is
  most of a window. Also relevant to any future multi-item pass: `run-telemetry.ts:295-299` records that
  no flag watches context growth and why one cannot be built from current data.
- **`pagesWritten` cannot see this agent at all.** `component-usage.ts:240-243` fills it from the `write`
  tool; the cross-linker only ever calls `edit`. So `activity.pagePaths` is always empty and
  `pages-outside-one-root` is dead here — the run report records nothing about which pages were touched,
  leaving the model's own receipt as the only account. Counting `edit` would be a two-line change and is
  the one piece of code worth arguing for, once a run has justified it.

## Observations, recorded while porting the cross-linker

None is worth a change on its own; each is cheap inside a change already touching the file.

- **A link inside an inline-code span is invisible to every gate flowrite has.** `mdoc` does not
  compile it (not a fenced block) and `onBrokenLinks: 'throw'` does not resolve it (not a link). The
  known instance is `docs/reference/services/random.md:14` in zio/zio, merged in `d058fcd26` and still
  present. This is the failure class that justifies the cross-linker's Sonnet tier, and it is worth
  knowing generally: **"the build would catch it" is not true of every markdown defect.**
- **`computeSafeZones` was the best-tested unit in crossref and is still wrong.** 14 tests, and its
  fence regex `/(```|~~~)[\s\S]*?\1/g` diverges from a line-based scan on 7 of 299 real pages —
  leaving the *interior* of a ` ````scala mdoc:passthrough ` block unprotected in
  `docs/reference/test/installation.md`. It protects none of: setext headings, MDX `import`/`export`,
  JSX blocks, link reference definitions (112 in that corpus), 4-backtick fences. Relevant beyond this
  port: it is a clean case of a regex parser that reads as safe, has tests, and is not.
- **`sidebar-parser.ts` returned `{}` on every run for its whole life.** It builds a one-element array
  and indexes `[1]`, throwing into a catch that warns and returns empty. Adjacency was its skill's
  single strongest HIGH-confidence trigger, and `adjacentPages` is empty in 0 of 293 and 0 of 3748 real
  index entries. It had zero tests. The lesson for this repo is the one it already applies to labels:
  a signal whose absence looks like a quiet answer needs an assertion, not a warning.
- **crossref's confidence promotion was unreachable.** `process.ts:379-390` promotes medium→high, but it
  sits after the threshold `continue` at `:343-349`, so at the default threshold it never runs — and all
  84 `medium` suggestions in the real state are still `pending`, confirming it.
- **Two standalone agents now have overlapping link mandates.**
  `src/skills/reduce-redundancy/references/guide.md:37` has the redundancy editor replace a repeated
  definition with a link, while `:73` tells it "links are not yours". Both unmeasured. Reconcile before
  a third pass touches links.
- **Telemetry cannot see an `edit`-only run.** `pages-outside-one-root`
  (`src/runtime/run-telemetry.ts:220-233`) reads `activity.pagePaths`, populated only from the `write`
  tool (`component-usage.ts:240-242`). So a pass that edits in place reports zero pages written, and a
  `write`-based one would fire "one run documents one thing, so the extra pages were not asked for" —
  wrong for a pass that is *meant* to touch several. That flag is one of finding 1's four fix sites and
  is still awaiting its confirming run, so scope it deliberately rather than discovering this later.

## 13. The docs organizer ships with no live measurement — OPEN

`src/organize.ts` groups a reference section into sidebar categories. `tsc` clean, 105 tests, and every
recipe in its guide verified against the fixture — but no run has proposed a grouping. What a first run
must answer:

- **Is the grouping any good?** This is the whole feature and the only part no test can reach. A
  category is a claim about what a set of pages is *for*; a wrong one is durable in a way a wrong link
  is not, because readers navigate by it and later pages get filed into it. Judge the category names
  against the pages, not against plausibility.
- **Did it hold the bounds?** Three pages minimum per category, one home per page, leftovers left at
  the top level, and no "Miscellaneous" invented to reach full coverage.
- **Did anything move?** `git status` should show only new category index pages and one `sidebars.js`
  edit. Any renamed or relocated page is a kill, not a tuning knob — every relative link into it breaks.
- **Does every sidebar id still resolve?** Use the guide's text-extraction recipe, not `require()`, for
  the reason in the observations below.
- **Did it leave other entries alone?** A page it did not group must keep its existing entry byte for
  byte. Removing a sibling's entry to tidy the file is the edit here that loses work invisibly.

The fixture cannot exercise the grouping itself: `fixtures/tinyproject/docs/reference/` holds a single
`index.md`, so there is nothing to group. It is still the right place to check the *bounds* — a correct
run reports that the section is too small and proposes no change.

## 14. Gate ran full `module` authoring on an existing section, then leaked planning jargon into the page — FIXED in this branch, unverified

**Evidence — `improve-error-mgmt-v2`**, live run against real `zio/zio`, requested "Improve the Error
Management documentation section" (existing, ~34 pages). Root's own `thinking` before calling
`set_document_kind`:

> "...doesn't quite fit since I'm improving an existing one. The more relevant skills are things like
> `find-gaps`, `check-compliance`, `enrich-section`... Still, I'll set the document kind as `module`..."

Named the right skills, used the wrong one anyway — no gate skill supports a multi-page sweep in one
activation, so `module`'s full pipeline was the only *capable* tool. Downstream: the drafter hit a
shape the module-shape table doesn't describe (an already-organized section, not a fresh module) and
titled the roster section `## Sub-domain Pages` — the template's own internal jargon, not its actual
heading `## Type Pages`.

**Fix.** `GATE_INSTRUCTIONS`: existing page/section → `find-gaps` then matching skill(s), never
`set_document_kind`. `structure.md`: `## Type Pages` only, "sub-domain" banned from output. Unverified —
needs a real run.

## Observations, recorded while porting the docs organizer

- **`node -e "require('<sidebars.js>')"` is not the verification it looks like, in this repo.**
  `docs-integrator.md` step 1 presents it as "verify it still parses". It does catch a syntax error — a
  deliberately broken file throws `SyntaxError`. But `flowrite/package.json` sets `"type": "module"` and
  `fixtures/tinyproject/` has no `package.json` of its own, so `docs/sidebars.js` loads as **ESM** and
  `require()` returns `{}` with no error for a file whose `module.exports` never took effect. Every
  sidebar id enumeration must therefore read the text, not the loaded object. Left alone in
  `docs-integrator.md` deliberately: it is a working prompt, the check still catches the common failure,
  and changing it affects every write run and needs its own run to judge.
- **The predecessor's organize-types wrote sidebar ids for paths it never created.** Ids of the form
  `reference/<category>/<type>` with no file move anywhere in its 495 lines, and a build-repair phase
  told to "either create the missing file or remove the entry". That is finding 1's failure shipped as
  a design. Worth remembering as a shape: a repair step licensed to *create* is how a broken reference
  becomes unreviewed content.
- **Its prompt cited a `docs-organize-types` skill that never existed.** Second instance of this exact
  pattern after §6's how-to checklist, which makes it a property of the predecessor rather than an
  accident: **a `writer-assistant` prompt naming a skill is not evidence the skill was there.**
- **Grouping by name substring is the cheap-model failure mode.** The original's table matched
  "contains chunk, list, vector" → Collections. It is the thing to look for when judging a live run's
  output, because it produces categories that read plausibly and file `ChunkBuilder` under Collections.

## Verified working, and worth not breaking

Measured on `write-module-ref-turn1` and `write-tutorial-turn1`:

- method coverage 100% with `missing: []`; no fabricated API on a fixture whose names are invented
- the frontmatter contract reproduced from prose, with its validator deleted
- `@VERSION@` resolved by the build rather than hardcoded
- a refused review round no longer reports as a failed phase (`e18c78d`)
- the confirming round earns a post-fix verdict on all three kinds measured (`f15f64a`; `how-to` is
  unmeasured — finding 11) — held until a round
  raised NEW items and spent the single grant; renewal added in finding 6 below
- the `flowrite:` phase timeline, rebuilt from delegation events (`4a32380`)
- `pagesWritten` caught finding 1 as `research-draft-mismatch`, counting pages rather than delegations

## Older items

Pre-existing findings live in the session task list, not here — notably the unpassable-item class
(#60 `read_skill_resource` failing on `references/*.md`), waste (#44 `cd` violations, #45 failed reads),
and #55 per-type research re-discovering the module. Move one here when a run gives it fresh evidence.
