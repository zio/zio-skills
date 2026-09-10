#!/usr/bin/env node
//
// generate-plugin-skill.mjs — assembles a self-contained Claude Code plugin SKILL.md from a
// flowrite standalone agent's instructions file plus the skill references it reads.
//
// Why this exists: flowrite deliberately splits "instructions" (workflow) from "skills" (expertise
// loaded on demand, or a mounted rules file) to keep a run's per-turn context small — see
// SKILLS-ONLY-DESIGN.md. A Claude Code plugin skill has no such split; it is loaded whole, once, so
// the two have to be folded into one self-contained file to be marketplace-installable. Most of a
// flowrite instructions file's prose is ALREADY portable as-is (no Flue mechanics inside the body —
// checked per skill before adding it here); what needs changing is small and mechanical: frontmatter,
// a relative link instead of a skill-mount reference, and the odd Flue-internal cross-reference this
// generator's manifest strips or rewords. The manifest is curated data, not derived — deciding WHAT
// to substitute needed reading each source file, the same as authoring the plugin skills originally
// did. This script only does the mechanical assembly, matching CLAUDE.md's own tool philosophy: pay
// for a contract where breaking it would be silent (a stale relative path, a missing frontmatter
// field), not for a judgement call.
//
// Output is staged under `dist/plugin-export/`, never written directly into `../plugins/documentation`
// — promoting a generated skill into the live marketplace plugin is a separate, reviewed step.
//
// Usage: node scripts/generate-plugin-skill.mjs [--out <dir>]

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FLOWRITE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const outArgIdx = process.argv.indexOf('--out');
const OUT_DIR = path.resolve(
  outArgIdx >= 0 ? process.argv[outArgIdx + 1] : path.join(FLOWRITE_ROOT, 'dist/plugin-export'),
);

const rd = (relPath) => readFileSync(path.join(FLOWRITE_ROOT, relPath), 'utf8');

/** Applies find/replace pairs in order. `find` is a literal string unless it is a RegExp. */
function applySubstitutions(text, substitutions = []) {
  let out = text;
  for (const [find, replace] of substitutions) {
    const before = out;
    out = typeof find === 'string' ? out.split(find).join(replace) : out.replace(find, replace);
    if (out === before) {
      throw new Error(`substitution had no effect (source may have changed): ${find}`);
    }
  }
  return out;
}

function frontmatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (key === 'description' && value.length > 70) {
      lines.push(`${key}: >`);
      for (const chunk of wrap(value, 78)) lines.push(`  ${chunk}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

function wrap(text, width) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) {
      lines.push(line.trim());
      line = w;
    } else {
      line = `${line} ${w}`;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

/**
 * One entry per generated skill. `frontmatter` fields land verbatim in the output's YAML block.
 * `instructions` is the flowrite source whose body becomes the skill's body, after `substitutions`
 * (required to be a no-op check — see applySubstitutions — so a source edit that removes the text
 * being replaced fails loudly instead of silently emitting stale content). `references` are copied
 * alongside the SKILL.md, each through its own optional substitutions. `scripts` are copied and
 * marked executable — used for a skill whose flowrite counterpart already bundles a deterministic
 * script.
 */
const MANIFEST = [
  {
    name: 'docs-cross-linker',
    frontmatter: {
      name: 'docs-cross-linker',
      description:
        'Make one or more existing ZIO documentation pages reachable by adding inbound prose links ' +
        'from pages that already discuss their subject. Use when a page is finished but nothing ' +
        'links to it, or the user asks to "cross-link", "make reachable", or "fix orphan pages".',
      'argument-hint': '"<path/to/page.md> [path/to/another.md ...]"',
      'allowed-tools': 'Read, Glob, Grep, Edit, Bash(git:*)',
    },
    instructions: 'src/instructions/crossref.md',
    // Every one of the 7 occurrences of the bare word "guide" in this file means the same thing — the
    // reference guide, which for flowrite is a mounted skill (no link needed) but for a standalone
    // plugin skill is a sibling file. One regex turns all 7 into a relative link; the trailing `'s` on
    // a possessive occurrence sits fine right after the closing `)`.
    substitutions: [
      [/\bguide\b/g, '[guide](references/guide.md)'],
      // "the guide\n   below" made sense when the guide was inlined at runtime (flue join, not a
      // separate file); moved to references/guide.md, "below" is simply wrong.
      ['from the [guide](references/guide.md)\n   below.', 'from the [guide](references/guide.md).'],
      // Same Flue-internal leak: this line about flowrite's own history means nothing to a standalone
      // Claude Code skill, which has no notion of "flowrite" as the tool running it.
      [
        'This matters more here than anywhere else in flowrite, because your job is',
        'This matters more here than in most maintenance work, because your job is',
      ],
    ],
    references: [{ from: 'src/skills/cross-linker/references/guide.md', to: 'references/guide.md' }],
  },
  {
    name: 'docs-backfill-metadata',
    frontmatter: {
      name: 'docs-backfill-metadata',
      description:
        'Fill in the missing `description` and `keywords` frontmatter fields on one documentation ' +
        'page, without touching anything else on it. Use when a page has no description or keywords ' +
        'for Docusaurus to index it with, or the user asks to "backfill metadata" or "add frontmatter".',
      'argument-hint': '"<path/to/page.md>"',
      'allowed-tools': 'Read, Edit',
    },
    instructions: 'src/instructions/metadata.md',
    // "the rules below" made sense when metadata.ts joined rules.md directly beneath the instructions
    // at runtime; moved to a separate references/ file, "below" no longer means anything.
    substitutions: [
      [
        'Write only those fields**, following the rules below, editing the frontmatter block in place.',
        'Write only those fields**, following [`references/rules.md`](references/rules.md), editing the\n   frontmatter block in place.',
      ],
    ],
    references: [
      {
        from: 'src/skills/backfill-metadata/references/rules.md',
        to: 'references/rules.md',
        substitutions: [
          [
            'The whole four-field contract — which fields a page carries, in what order, and how the body follows\nthem — is stated in `src/subagents/drafter.md`. That file is authoritative. This one covers only the\ntwo fields you write, and if the two ever disagree, `drafter.md` wins.',
            'This covers only the two fields this skill writes — `description` and `keywords` — never the rest of a page\'s frontmatter contract.',
          ],
        ],
      },
    ],
  },
  {
    name: 'docs-add-missing-section',
    frontmatter: {
      name: 'docs-add-missing-section',
      description:
        'Insert one missing section — Construction, Predefined Instances, Comparison, Advanced ' +
        'Usage, or Motivation — into an existing data-type reference page, at its canonical ' +
        'position, fully written and mdoc-verified. Use when a required section is entirely absent ' +
        'from a reference page (not when it exists but is thin — that is docs-enrich-section).',
      'argument-hint': '"[path/to/reference-doc.md] [description of missing section and why it is needed]"',
      'allowed-tools': 'Read, Glob, Grep, Edit, Bash(sbt:*), Bash(git:*), Skill',
    },
    instructions: 'src/instructions/add-section.md',
    substitutions: [
      [
        'You insert one missing section into an existing reference page, at its canonical position, fully\nwritten and verified — and you touch nothing else on the page.',
        '**REQUIRED BACKGROUND:** Use the `docs-writing-style` skill for prose conventions and the\n`docs-mdoc-conventions` skill for code block syntax throughout.\n\nYou insert one missing section into an existing reference page, at its canonical position, fully\nwritten and verified — and you touch nothing else on the page.',
      ],
      [
        "load the `add-missing-section`\n   skill's `references/section-patterns.md` for the exact subsection layout, table shape, and\n   code-block modifiers.",
        'load [`references/section-patterns.md`](references/section-patterns.md) for the exact\n   subsection layout, table shape, and code-block modifiers.',
      ],
    ],
    references: [
      {
        from: 'src/skills/add-missing-section/references/section-patterns.md',
        to: 'references/section-patterns.md',
      },
    ],
  },
  {
    name: 'docs-reduce-redundancy-v2',
    frontmatter: {
      name: 'docs-reduce-redundancy-v2',
      description:
        'Remove repetition from one finished documentation page — the page is not rewritten, ' +
        'restructured, or corrected, only de-duplicated. Use when a page says the same thing twice. ' +
        'Generated from flowrite; plugins/documentation already ships docs-reduce-redundancy for the ' +
        'same job — this is a staged comparison, not a replacement.',
      'argument-hint': '"[path/to/doc.md]"',
      'allowed-tools': 'Read, Edit, Grep, Bash(git:*)',
    },
    instructions: 'src/instructions/redundancy.md',
    substitutions: [
      [/\bguide\b/g, '[guide](references/guide.md)'],
      ['against the [guide](references/guide.md) below.', 'against the [guide](references/guide.md).'],
    ],
    references: [{ from: 'src/skills/reduce-redundancy/references/guide.md', to: 'references/guide.md' }],
  },
  {
    name: 'docs-organize-reference-docs',
    frontmatter: {
      name: 'docs-organize-reference-docs',
      description:
        'Group an existing reference section into sidebar categories — propose the grouping from ' +
        'what the pages document, write each category index page, update sidebars.js, and move no ' +
        'file. Generated from flowrite; plugins/documentation already ships docs-organize-types, a ' +
        'differently-scoped tool (categorizes individual types, not whole sections) — this is a ' +
        'staged comparison, not a replacement.',
      'argument-hint': '"[docs/reference or a subdirectory of it]"',
      'allowed-tools': 'Read, Glob, Grep, Edit, Bash(git:*)',
    },
    instructions: 'src/instructions/organize.md',
    substitutions: [[/\bguide\b/g, '[guide](references/guide.md)']],
    references: [
      { from: 'src/skills/organize-reference-docs/references/guide.md', to: 'references/guide.md' },
    ],
  },
  {
    name: 'docs-check-compliance-v2',
    frontmatter: {
      name: 'docs-check-compliance-v2',
      description:
        'Audit one documentation page against the writing-style rules, the mdoc-conventions rules, ' +
        'or both, fixing every violation with one commit each and proving the page still compiles. ' +
        'Generated from flowrite; narrower by design than plugins/documentation\'s ' +
        'docs-check-compliance, which works against ANY named rule skill, not just these two — this ' +
        'is a staged comparison, not a replacement.',
      'argument-hint': '"[path/to/doc.md] [writing-style|mdoc-conventions|both, default both]"',
      'allowed-tools': 'Read, Edit, Grep, Bash(sbt:*), Bash(git:*), Skill',
    },
    instructions: 'src/instructions/check-compliance.md',
    substitutions: [
      [
        'The rule sets are appended below, verbatim, in full. Treat them as closed:',
        'Load the `docs-writing-style` and `docs-mdoc-conventions` skills for the rule sets in full. Treat them as closed:',
      ],
      ['The 28 rules below are numbered', 'The 28 rules in `docs-writing-style` are numbered'],
      [
        "You do not add a rule that isn't in the text below, and you do not soften one you'd personally relax.",
        "You do not add a rule that isn't in `docs-writing-style` or `docs-mdoc-conventions`, and you do not soften one you'd personally relax.",
      ],
    ],
    references: [],
  },
  {
    name: 'docs-pr-subsection',
    frontmatter: {
      name: 'docs-pr-subsection',
      description:
        'Turn a GitHub pull request into one subsection appended to a page that already documents ' +
        'the area it touches — no new page, no sidebar edit. Use for a PR that only enhances or ' +
        'fixes something already documented, or when the docs-document-pr skill names this as the ' +
        'subsection case.',
      'argument-hint': '"<PR number>"',
      'allowed-tools': 'Read, Edit, Grep, Bash(gh:*), Bash(sbt:*), Bash(git:*)',
    },
    instructions: 'src/instructions/pr-subsection.md',
    substitutions: [
      [
        'This is the small half of "document this PR." The other half — a PR introducing a genuinely new\nmodule, type, or feature, with nothing existing to extend — is a full new page, and that is\n`src/agent.ts` (`flue run src/agent.ts -m "document PR #<n>"`), not this skill: its own gate\ninstructions already read the PR and take the kind and subject from what it changed. Reach for this\nskill only when something already documents the area the PR lands in.',
        'This is the small half of "document this PR." The other half — a PR introducing a genuinely new\nmodule, type, or feature, with nothing existing to extend — is a full new page: use the\n`docs-document-pr` skill instead. Reach for this skill only when something already documents the area\nthe PR lands in.',
      ],
      [
        'stop. Say so, and name `src/agent.ts` as the right agent for it.',
        'stop. Say so, and name `docs-document-pr` as the right skill for it.',
      ],
      [
        'Follow `writing-style` for\n   the prose and `mdoc-conventions` for the code block.',
        'Follow `docs-writing-style` for\n   the prose and `docs-mdoc-conventions` for the code block.',
      ],
      [
        "No existing page covers the PR's area.** This is a new-page case — say so, name `src/agent.ts`,",
        "No existing page covers the PR's area.** This is a new-page case — say so, name `docs-document-pr`,",
      ],
    ],
    references: [],
  },
  {
    name: 'docs-enrich-section-v2',
    frontmatter: {
      name: 'docs-enrich-section-v2',
      description:
        'Expand a thin documentation section — signature and toy example, no motivation — into one ' +
        'that explains why a reader would choose this API, using the five-part expansion pattern. ' +
        'Generated from flowrite; plugins/documentation already ships docs-enrich-section for the ' +
        'same job — this is a staged comparison, not a replacement.',
      'argument-hint': '"[path/to/doc.md] [section name]"',
      'allowed-tools': 'Read, Edit, Grep, Bash(sbt:*), Bash(git:*), Skill',
    },
    instructions: 'src/instructions/enrich-section.md',
    substitutions: [
      [
        "Nothing here is about creating a section that doesn't exist — that is `add-missing-section`, a",
        "Nothing here is about creating a section that doesn't exist — that is `docs-add-missing-section`, a",
      ],
      [
        "load the `enrich-section` skill's\n   `references/pattern.md` for the exact shape of each part,",
        'load [`references/pattern.md`](references/pattern.md) for the exact shape of each part,',
      ],
    ],
    references: [{ from: 'src/skills/enrich-section/references/pattern.md', to: 'references/pattern.md' }],
  },
  {
    name: 'docs-find-documentation-gaps-v2',
    frontmatter: {
      name: 'docs-find-documentation-gaps-v2',
      description:
        'Scan a checkout for documentation gaps and write one coverage report — no page written, no ' +
        'page edited, no sidebar touched. Generated from flowrite; plugins/documentation already ' +
        'ships docs-find-documentation-gaps, the same bundled scanner script — this is a staged ' +
        'comparison, not a replacement.',
      'argument-hint': "\"[optional: module name]\"",
      'allowed-tools': 'Read, Write, Glob, Grep, Bash(bash:*), Bash(git:*)',
    },
    instructions: 'src/instructions/find-gaps.md',
    substitutions: [
      [
        'bash <scanner-path> > docs/undocumented-report.md',
        'bash ${CLAUDE_PLUGIN_ROOT}/skills/docs-find-documentation-gaps-v2/scan-undocumented.sh > docs/undocumented-report.md',
      ],
      ['(The exact path is given below, computed for this checkout.) ', ''],
      [
        'a TODO item for a later `flue run src/agent.ts` (a new page, or the\n`add-missing-section` skill) to act on, not',
        'a TODO item for `docs-document-pr` or `docs-add-missing-section` to act on later, not',
      ],
    ],
    references: [],
    scripts: [{ from: 'scripts/scan-undocumented.sh', to: 'scan-undocumented.sh' }],
  },
  {
    name: 'docs-list-undocumented-prs-v2',
    frontmatter: {
      name: 'docs-list-undocumented-prs-v2',
      description:
        'Audit merged PRs for missing documentation, one batch per run, using a bundled deterministic ' +
        'gate classifier instead of hand-evaluating the rule table. Generated from flowrite; ' +
        'plugins/documentation\'s docs-list-undocumented-prs was already upgraded with the same ' +
        'classify-pr-docs.mjs script — this is a staged comparison, not a replacement.',
      'argument-hint': '"[optional: base-ref or --reset]"',
      'allowed-tools': 'Read, Write, Glob, Grep, Bash(git:*), Bash(gh:*), Bash(jq:*), Bash(node:*)',
    },
    instructions: 'src/instructions/list-undocumented-prs.md',
    substitutions: [
      [
        "Read `.flowrite/pr-audit-state.json`. If it does not exist, start from",
        'Read `.docs-audit-state.json`. If it does not exist, start from',
      ],
      [
        '   Call `classify_pr_docs` with the title, the label names, and the files array from the second call —\n   it returns `requiresDocs` (`yes`/`no`/`uncertain`), which gate fired, and why. Trust it; the gate\n   table is fixed and this tool applies it exactly, so there is nothing to re-derive by hand.',
        '   Build `{"title": ..., "labels": [...], "files": [...]}` from the two calls above (the `files`\n   array needs only `path` and `status` per entry) and run:\n\n   ```bash\n   echo \'<the json>\' | node ${CLAUDE_PLUGIN_ROOT}/skills/docs-list-undocumented-prs-v2/classify-pr-docs.mjs\n   ```\n\n   It returns `requiresDocs` (`yes`/`no`/`uncertain`), which gate fired, and why. Trust it; the gate\n   table is fixed and this script applies it exactly, so there is nothing to re-derive by hand.',
      ],
      [
        '- 🔴 on a PR that introduced something genuinely new → `flue run src/agent.ts -m "document PR #<N>"`\n     - 🔴 on a PR that only touches something already documented → no flowrite agent for that; use the\n       `docs-pr-subsection` skill\n     - 🟠 / 🟡 → `flue run src/agent.ts -m "enrich <section> in <path>"`, naming the stub/thin path you\n       found',
        "- 🔴 on a PR that introduced something genuinely new → the `docs-document-pr` skill\n     - 🔴 on a PR that only touches something already documented → the `docs-pr-subsection` skill\n     - 🟠 / 🟡 → the `docs-enrich-section` skill, naming the stub/thin path you found",
      ],
      [
        "is this run's own final answer, not a file you create. `.flowrite/pr-audit-state.json` stays local:\nsay once, only if the checkout's `.gitignore` doesn't already exclude `.flowrite/`, that it should.",
        "is this run's own final answer, not a file you create. `.docs-audit-state.json` stays local: say\nonce, only if the checkout's `.gitignore` doesn't already exclude it, that it should.",
      ],
    ],
    references: [],
    scripts: [
      {
        from: '../plugins/documentation/skills/docs-list-undocumented-prs/classify-pr-docs.mjs',
        to: 'classify-pr-docs.mjs',
      },
    ],
  },
  {
    name: 'docs-document-pr',
    frontmatter: {
      name: 'docs-document-pr',
      description:
        'Decide, from a bare PR number, whether it needs a full new page, a subsection on an existing ' +
        'page, or nothing at all — then name the right skill for the job, writing nothing itself. Use ' +
        'when the user asks to document a PR and it is not already clear whether that means a new ' +
        'page or an addition to one that exists.',
      'argument-hint': '"<PR number>"',
      'allowed-tools': 'Read, Glob, Grep, Bash(gh:*), Bash(node:*)',
    },
    instructions: 'src/instructions/document-pr.md',
    substitutions: [
      [
        'You decide, from a bare PR number, whether "document this PR" means a full new page, a subsection on an\nexisting page, or nothing at all. For the subsection case you hand off to the skill that does it; for\nthe new-page case there is no one to hand off to but yourself — see step 4. Either way, you write no\nsubsection and touch no sidebar directly; that happens only once the right phase takes over.',
        'You decide, from a bare PR number, whether "document this PR" means a full new page, a subsection ' +
          'on an existing page, or nothing at all, then name the skill that does it. You write no ' +
          'subsection and touch no sidebar yourself; that happens only once the right skill takes over.',
      ],
      [
        'This is the front door for "document PR #<n>" when the requester does not already know which of the two\napplies. You are mounted on `src/agent.ts` itself, alongside its own gate instructions and the\n`set_document_kind` tool that records a new-page decision — so the new-page case is not a hand-off to a\nseparate agent, it is simply recording the decision and letting this same conversation continue. The\nsubsection case has no such shortcut: it is the separate `docs-pr-subsection` skill, applied by hand or\nthrough Claude Code, not a `flue run`. Deciding which of the two applies *before* either path starts is\nthe whole reason this skill exists, so a requester (or this agent, reading its own request) never has to\nguess first.',
        'This is the front door for "document PR #<n>" when the requester does not already know which of the ' +
          'two applies. Use it before invoking `docs-data-type-ref`, `docs-module-ref`, `docs-tutorial`, ' +
          '`docs-how-to-guide`, or `docs-pr-subsection` directly, so the requester never has to guess ' +
          'which one first.',
      ],
      [
        'Call `classify_pr_docs` with the PR title, its label names, and that files array. When it returns\n   `requiresDocs: "no"`, report its `reason` and stop — you write nothing. Trust it: the gate table is\n   fixed and this tool applies it exactly, the same reasoning `list-undocumented-prs.md` gives for not\n   re-deriving the table by hand.',
        'Build `{"title": ..., "labels": [...], "files": [...]}` from the title, label names, and that\n   files array, and run:\n\n   ```bash\n   echo \'<the json>\' | node ${CLAUDE_PLUGIN_ROOT}/skills/docs-document-pr/classify-pr-docs.mjs\n   ```\n\n   When it returns `requiresDocs: "no"`, report its `reason` and stop — you write nothing. Trust it:\n   the gate table is fixed and this script applies it exactly, the same reasoning\n   `docs-list-undocumented-prs` gives for not re-deriving the table by hand.',
      ],
      [
        '4. **Act on the decision:**\n   - New-page case → this skill only established that a new page is warranted, not which of the four\n     kinds (`data-type`/`module`/`tutorial`/`how-to`) — classify that the same way the request-reading\n     instructions above this skill already describe, then call `set_document_kind` with that kind and\n     the subject you read from the PR. Nothing to hand off: that tool is already available in this same\n     conversation, and recording the decision is what lets it continue straight into the write.\n   - Subsection case → tell the requester to use the `docs-pr-subsection` skill, and stop. That skill is\n     not mounted here, so this is a real hand-off, not a tool call.',
        '4. **Act on the decision:**\n   - New-page case → tell the requester which page-kind skill fits — `docs-data-type-ref` (one\n     data type), `docs-module-ref` (a module of related types), `docs-tutorial` (learning-oriented),\n     or `docs-how-to-guide` (task-oriented) — and stop.\n   - Subsection case → tell the requester to use the `docs-pr-subsection` skill, and stop.',
      ],
      [
        'For the subsection case, you are not the `docs-pr-subsection` skill — you name it and stop, you do not\napply it yourself. For the new-page case there is nothing else to not be: recording the decision with\n`set_document_kind` is the entire job, and the writing that follows belongs to the phase that decision\nunlocks, not to a second skill you would be duplicating.',
        'You are not `docs-data-type-ref`, `docs-module-ref`, `docs-tutorial`, `docs-how-to-guide`, or\n`docs-pr-subsection` — you make the call among them and stop there. Writing any part of a page yourself\nis out of scope.',
      ],
      [
        "PR title, linked issues found, which of the three outcomes applied (no docs needed / new page /\nsubsection) and why. For the new-page outcome, the kind and subject you recorded. For the subsection\noutcome, that you're using the `docs-pr-subsection` skill. If you stopped to ask instead, say what made\nthe PR ambiguous.",
        "PR title, linked issues found, which of the three outcomes applied (no docs needed / new page /\nsubsection) and why, and — for the two writing outcomes — which skill you're handing off to. If you\nstopped to ask instead, say what made the PR ambiguous.",
      ],
    ],
    references: [],
    scripts: [
      {
        from: '../plugins/documentation/skills/docs-list-undocumented-prs/classify-pr-docs.mjs',
        to: 'classify-pr-docs.mjs',
      },
    ],
  },
];

/**
 * One entry per generated Claude Code subagent, mechanically derived from a flowrite subagent under
 * `src/subagents/`. Unlike MANIFEST, output is a single flat file (`OUT_DIR/agents/<name>.md`), not a
 * folder — Claude Code subagents have no `references/` sibling. `frontmatter` fields land verbatim in
 * the output's YAML block via the same `frontmatter()` helper skills use; omitting `tools` inherits
 * every tool, which is the closest equivalent to a flowrite subagent inheriting its parent's sandbox
 * (none of these declare a `useTool` beyond researcher's `gh_query`, itself just a bash-wrapped
 * `git`/`gh` call the body already tells the model to run directly). `skills` mirrors a `useSkill()`
 * mount 1:1 — only `drafter` has any.
 *
 * `drafter`, `designer` AND `reviewer` are a known, documented gap, not a workaround: flowrite's
 * `drafter.ts` composes `structureBlock(docKind()) + styleBlock()`, `designer.ts` composes
 * `structureBlock(docKind())`, and `reviewer.ts` composes `checklistBlock(docKind()) + styleBlock()`,
 * into the prompt AT RENDER TIME, chosen per-invocation from which page kind is being reviewed/
 * written. A static Claude Code agent file has no per-call templating equivalent, so
 * `docs-drafter.md`/`docs-designer.md`/`docs-reviewer.md`'s bodies are their flowrite `.md` sources
 * verbatim and nothing more — whoever delegates to any of them must supply the kind-specific
 * structure/checklist/style material in the `Task()` prompt itself.
 *
 * `fixer` is deliberately NOT in that group, even though it's also an editing role added alongside
 * `reviewer`'s merge with `fact_checker`: it composes nothing at render time (no docKind(), no mounted
 * skill) because it applies a fix `reviewer` already wrote out in full, rather than composing or
 * judging anything itself — see `fixer.ts`'s own doc-comment. `docs-fixer.md` is a plain, complete
 * body with no gap to document.
 */
const AGENT_MANIFEST = [
  {
    name: 'docs-researcher',
    frontmatter: {
      name: 'docs-researcher',
      description:
        'Researches a ZIO topic across source, tests, examples, and GitHub history; returns ' +
        'structured research answers in the shape the caller requests.',
      model: 'haiku',
      effort: 'low',
    },
    instructions: 'src/subagents/researcher.md',
    substitutions: [
      [
        'Write your findings to the file path your task names, under `.flowrite/research/`, with the `write`\ntool',
        'Write your findings to the file path your task names, with the `Write`\ntool',
      ],
    ],
  },
  {
    name: 'docs-designer',
    frontmatter: {
      name: 'docs-designer',
      description: 'Turns research findings into a validated plan for a ZIO documentation page.',
      model: 'sonnet',
      effort: 'medium',
    },
    instructions: 'src/subagents/designer.md',
  },
  {
    name: 'docs-drafter',
    frontmatter: {
      name: 'docs-drafter',
      description:
        'Writes a complete ZIO documentation page as Docusaurus markdown from a given plan and ' +
        'research findings.',
      model: 'sonnet',
      effort: 'high',
      skills: 'docs-mdoc-conventions, docs-ascii-diagram, docs-markdown-table',
    },
    instructions: 'src/subagents/drafter.md',
    substitutions: [
      ['Write the page with the `write` tool', 'Write the page with the `Write` tool'],
    ],
  },
  {
    name: 'docs-examples-builder',
    frontmatter: {
      name: 'docs-examples-builder',
      description:
        'Creates and compiles companion example files for a documentation page (one per section + a ' +
        'complete example). Use after the draft exists.',
      model: 'sonnet',
      effort: 'medium',
    },
    instructions: 'src/subagents/examples-builder.md',
  },
  {
    name: 'docs-integrator',
    frontmatter: {
      name: 'docs-integrator',
      description:
        'Wires a new documentation page into the ZIO documentation site: sidebars.js, index.md, ' +
        'cross-references, and build verification. Use after mdoc passes.',
      model: 'sonnet',
      effort: 'medium',
    },
    instructions: 'src/subagents/docs-integrator.md',
  },
  {
    name: 'docs-reviewer',
    frontmatter: {
      name: 'docs-reviewer',
      description:
        'Evaluates a written ZIO documentation page two ways: a full-page check against a checklist ' +
        'and writing-style rules supplied in the task, or a fact-check of one section against the ' +
        'library source. Reports per-item pass/fail or per-drift findings, each with the exact ' +
        'corrected statement to apply.',
      model: 'sonnet',
      effort: 'low',
    },
    instructions: 'src/subagents/reviewer.md',
    substitutions: [
      // Moved here from the retired docs-fact-checker entry: this text now lives inside merged
      // reviewer.md's "## Fact-check" section, not a separate file.
      [
        'A research file under `.flowrite/research/` may exist.',
        'A research file may exist at a path your task names.',
      ],
    ],
  },
  {
    name: 'docs-fixer',
    frontmatter: {
      name: 'docs-fixer',
      description:
        'Applies fixes docs-reviewer already composed: given a location and the exact corrected ' +
        'statement for it, edits the page to match — verbatim, no re-deriving, no rephrasing.',
      model: 'sonnet',
      effort: 'low',
    },
    instructions: 'src/subagents/fixer.md',
    // No substitutions: fixer.md names no Flue internal (no .flowrite/, no finish call, no task()).
  },
];

function generate(entry) {
  const skillDir = path.join(OUT_DIR, entry.name);
  mkdirSync(skillDir, { recursive: true });

  const body = applySubstitutions(rd(entry.instructions), entry.substitutions ?? []);
  const output = frontmatter(entry.frontmatter) + '\n' + body;
  writeFileSync(path.join(skillDir, 'SKILL.md'), output);

  for (const ref of entry.references ?? []) {
    const refOutPath = path.join(skillDir, ref.to);
    mkdirSync(path.dirname(refOutPath), { recursive: true });
    const content = ref.substitutions
      ? applySubstitutions(rd(ref.from), ref.substitutions)
      : rd(ref.from);
    writeFileSync(refOutPath, content);
  }

  for (const script of entry.scripts ?? []) {
    const scriptOutPath = path.join(skillDir, script.to);
    mkdirSync(path.dirname(scriptOutPath), { recursive: true });
    copyFileSync(path.join(FLOWRITE_ROOT, script.from), scriptOutPath);
    chmodSync(scriptOutPath, 0o755);
  }

  console.log(`generated ${entry.name} -> ${path.relative(FLOWRITE_ROOT, skillDir)}`);
}

function generateAgent(entry) {
  const agentsDir = path.join(OUT_DIR, 'agents');
  mkdirSync(agentsDir, { recursive: true });

  const body = applySubstitutions(rd(entry.instructions), entry.substitutions ?? []);
  const output = frontmatter(entry.frontmatter) + '\n' + body;
  const agentOutPath = path.join(agentsDir, `${entry.name}.md`);
  writeFileSync(agentOutPath, output);

  console.log(`generated agent ${entry.name} -> ${path.relative(FLOWRITE_ROOT, agentOutPath)}`);
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
for (const entry of MANIFEST) generate(entry);
for (const entry of AGENT_MANIFEST) generateAgent(entry);
