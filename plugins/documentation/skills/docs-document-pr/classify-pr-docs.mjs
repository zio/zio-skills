#!/usr/bin/env node
//
// classify-pr-docs.mjs — deterministic classification of whether a merged PR needs documentation.
//
// Ported from flowrite's `src/tools/classify-pr-docs.ts` (`classifyDocsRequirement`), which exists
// for the reason this script does: the gate table below is ~16 ordered boolean conditions, and a
// model applying them by hand across a batch of PRs is exactly where one gets silently reordered or
// skipped — a wrong classification that looks plausible, not a loud failure. Both copies must stay
// in sync; flowrite's version has the test suite (`classify-pr-docs.test.ts`, one case per gate).
//
// Usage:
//   node classify-pr-docs.mjs <pr-facts.json>
//   echo '{"title":"...","labels":[...],"files":[...]}' | node classify-pr-docs.mjs
//
// Input JSON shape: { "title": string, "labels": string[], "files": [{ "path": string, "status": string }] }
// Output JSON shape: { "requiresDocs": "yes"|"no"|"uncertain", "gate": string, "reason": string }

import { readFileSync } from 'node:fs';

function usage() {
  console.error(`Usage: classify-pr-docs.mjs [pr-facts.json]

Reads PR facts as JSON (from the given file, or stdin if no file is given) and prints the
classification as JSON to stdout.

Input shape: { "title": string, "labels": string[], "files": [{ "path": string, "status": string }] }
`);
}

// `gh api .../files` reports repo-root-relative paths with no leading slash (`src/main/...`, not
// `/src/main/...`), so every directory check below matches the segment at the START of the path too,
// not only nested under something else.
const isTestFile = (path) => /(Test|Spec|Suite)\.scala$/.test(path) || /(^|\/)src\/test\//.test(path);

const isMainScala = (path) => path.endsWith('.scala') && /(^|\/)src\/main\//.test(path);

const isInternal = (path) =>
  path.includes('/internal/') || path.includes('/impl/') || path.includes('/private/');

const isInfra = (path) =>
  /\.ya?ml$/.test(path) ||
  path.startsWith('.github/') ||
  path.includes('/.github/') ||
  /(^|\/)Dockerfile/.test(path);

const isBuild = (path) =>
  path === 'build.sbt' ||
  path.endsWith('/build.sbt') ||
  path.startsWith('project/') ||
  path.includes('/project/') ||
  path.endsWith('.sbt');

const CC_PREFIX_RE = /^(feat|fix|chore|refactor|test|ci|build|docs|perf|style|revert)(\(.+\))?(!)?:/i;

const hasLabel = (labels, ...names) => labels.some((l) => names.includes(l.toLowerCase()));

// Whole-word, case-insensitive: guards against "add" matching inside "added" or "CI".
const titleHasWord = (title, word) => new RegExp(`\\b${word}\\b`, 'i').test(title);

/** First match wins, in this order: overrides, then NO-1..NO-9, then YES-1..YES-5, then UNCERTAIN. */
export function classifyDocsRequirement({ title, labels, files }) {
  const filesTest = files.filter((f) => isTestFile(f.path));
  const filesMainScala = files.filter((f) => isMainScala(f.path) && !isTestFile(f.path));
  const filesInternal = filesMainScala.filter((f) => isInternal(f.path));
  const filesPublicMain = filesMainScala.filter((f) => !isInternal(f.path));
  const filesNewPublicMain = filesPublicMain.filter((f) => f.status === 'added');
  const filesInfra = files.filter((f) => isInfra(f.path));
  const filesBuild = files.filter((f) => isBuild(f.path));

  const ccMatch = CC_PREFIX_RE.exec(title);
  const ccPrefix = ccMatch?.[1]?.toLowerCase();
  const ccBreaking = Boolean(ccMatch?.[3]);
  const isBump =
    /^(bump|upgrade|update).*\b(to v?\d|version|dep)/i.test(title) || /^build\(deps\)/i.test(title);
  const isRevert = /^Revert "/.test(title);

  // ─── Overrides ───────────────────────────────────────────────────────────
  if (ccBreaking) {
    return { requiresDocs: 'yes', gate: 'OVERRIDE-BREAKING', reason: 'Title carries a `!:` breaking-change marker.' };
  }
  if (hasLabel(labels, 'documentation-needed')) {
    return { requiresDocs: 'yes', gate: 'OVERRIDE-DOCS-NEEDED', reason: 'Labeled `documentation-needed`.' };
  }

  // ─── NO gates, first match wins ──────────────────────────────────────────
  if (isBump || hasLabel(labels, 'renovate', 'dependabot') || (ccPrefix === 'build' && filesMainScala.length === 0)) {
    return { requiresDocs: 'no', gate: 'NO-1', reason: 'Dependency update — no user-facing API change.' };
  }
  if (
    filesPublicMain.length === 0 &&
    (filesInfra.length > 0 || filesBuild.length > 0) &&
    (hasLabel(labels, 'ci', 'infrastructure') || ccPrefix === 'ci' || ccPrefix === 'build')
  ) {
    return { requiresDocs: 'no', gate: 'NO-2', reason: 'CI/infrastructure-only change, corroborated by label or commit prefix.' };
  }
  if (files.every((f) => isTestFile(f.path) || isInfra(f.path) || isBuild(f.path)) && filesPublicMain.length === 0) {
    return { requiresDocs: 'no', gate: 'NO-3', reason: 'Test/infra/build-only change — no public source touched.' };
  }
  if (ccPrefix === 'fix' && filesNewPublicMain.length === 0) {
    return { requiresDocs: 'no', gate: 'NO-4', reason: '`fix:` prefix with no new public files — existing docs remain valid.' };
  }
  if (
    ccPrefix !== undefined &&
    ['chore', 'refactor', 'test', 'ci', 'docs', 'style', 'perf', 'revert'].includes(ccPrefix) &&
    filesNewPublicMain.length === 0
  ) {
    return { requiresDocs: 'no', gate: 'NO-5', reason: `\`${ccPrefix}:\` prefix signals maintenance, no new public files.` };
  }
  if (filesPublicMain.length === 0 && filesInternal.length > 0 && hasLabel(labels, 'refactor', 'internal')) {
    return { requiresDocs: 'no', gate: 'NO-6', reason: 'Internal-only refactor — no public API touched.' };
  }
  if (
    hasLabel(labels, 'bug', 'fix', 'bugfix') &&
    filesNewPublicMain.length === 0 &&
    !hasLabel(labels, 'feature', 'enhancement', 'api-change', 'breaking-change')
  ) {
    return { requiresDocs: 'no', gate: 'NO-7', reason: 'Bug-fix label, no new public files, no offsetting feature label.' };
  }
  if (hasLabel(labels, 'chore', 'internal') && filesPublicMain.length === 0) {
    return { requiresDocs: 'no', gate: 'NO-8', reason: 'Chore/internal label with no public source changes.' };
  }
  if (isRevert) {
    return { requiresDocs: 'no', gate: 'NO-9', reason: "Revert — the original PR's documentation is no longer needed." };
  }

  // ─── YES gates, first match wins ─────────────────────────────────────────
  if (ccPrefix === 'feat') {
    return { requiresDocs: 'yes', gate: 'YES-1', reason: '`feat:` is the authoritative signal for new functionality.' };
  }
  if (filesNewPublicMain.length > 0) {
    return {
      requiresDocs: 'yes',
      gate: 'YES-2',
      reason: `New public Scala file(s) added: ${filesNewPublicMain.map((f) => f.path).join(', ')}`,
    };
  }
  if (hasLabel(labels, 'breaking-change', 'api-change')) {
    return { requiresDocs: 'yes', gate: 'YES-3', reason: 'Labeled `breaking-change` or `api-change`.' };
  }
  if (hasLabel(labels, 'feature', 'enhancement', 'new-feature') && filesMainScala.length > 0) {
    return { requiresDocs: 'yes', gate: 'YES-4', reason: 'Feature/enhancement label with actual source changes.' };
  }
  if (filesPublicMain.length > 0 && ['introduce', 'deprecate', 'breaking', 'API'].some((w) => titleHasWord(title, w))) {
    return { requiresDocs: 'yes', gate: 'YES-5', reason: 'Public file(s) modified with interface-change language in the title.' };
  }

  // ─── Fallback ─────────────────────────────────────────────────────────────
  const signals = [
    ccPrefix ? `commit prefix \`${ccPrefix}:\`` : 'no conventional-commit prefix',
    labels.length > 0 ? `labels [${labels.join(', ')}]` : 'no labels',
    filesPublicMain.length > 0 ? `${filesPublicMain.length} public main file(s) touched` : 'no public main files touched',
    filesTest.length > 0 ? `${filesTest.length} test file(s) touched` : 'no test files touched',
  ].join('; ');
  return { requiresDocs: 'uncertain', gate: 'UNCERTAIN', reason: `No gate fired. Observed: ${signals}.` };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  usage();
  process.exit(0);
}

const arg = process.argv[2];
let raw;
try {
  raw = arg ? readFileSync(arg, 'utf8') : readFileSync(0, 'utf8');
} catch (err) {
  console.error(`Error: could not read input: ${err.message}`);
  usage();
  process.exit(2);
}

let facts;
try {
  facts = JSON.parse(raw);
} catch (err) {
  console.error(`Error: input is not valid JSON: ${err.message}`);
  process.exit(2);
}

if (typeof facts.title !== 'string' || !Array.isArray(facts.labels) || !Array.isArray(facts.files)) {
  console.error('Error: input must have { title: string, labels: string[], files: {path,status}[] }');
  process.exit(2);
}

console.log(JSON.stringify(classifyDocsRequirement(facts)));
