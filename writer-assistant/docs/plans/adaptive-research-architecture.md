# Plan: Adaptive Architecture — Single-Session vs Separate Researcher

## Context

After the A/B test, we know:
- **Separated researcher agent**: Better context management but 37% more tokens — worth it for large, complex types
- **Single session (baseline)**: Fewer tokens, sufficient for small types where context window pressure is not a concern

The goal is to route automatically based on source file size: small files stay single-session, large files get the isolated researcher agent.

---

## Architecture Decision

The **single decision point** is in `write-data-type-ref.ts` before Phase 1 starts. We measure the resolved source file size in bytes and branch:

```
Source file size > 15KB  →  Separated researcher agent  (current impl)
Source file size ≤ 15KB  →  Single session (all phases in one writer session)
Source file size unknown →  Separated (safe default — size can't be determined without filePath)
```

**Why 15KB?** Covers small utility types (Dequeue ~3KB, CountdownLatch ~2KB) vs large types (ZIO.scala ~180KB, ZStream.scala ~300KB). Easily tunable via `LARGE_SOURCE_THRESHOLD_BYTES`.

---

## Changes Required

### 1. `agents/docs-writer.ts`

Restore `docsResearchSkill` to the writer agent's skills list. When the single-session path runs, the writer agent must have research guidance available for Phase 1.

```typescript
skills: [docsResearchSkill, docsDataTypeRefSkill],  // restored both skills
```

`docs-researcher.ts` remains unchanged — it still loads only `docsResearchSkill` for the separated path.

---

### 2. `workflows/phases/research.ts`

Add back the **session-based research function** alongside the existing harness-based one:

```typescript
// Existing (separated path): creates its own harness
export async function runResearchPhase(
  init: FlueContext['init'],
  config: ResearchConfig
): Promise<string>

// New (single-session path): uses the writer's own session
export async function runResearchPhaseInSession(
  session: FlueSession,
  config: ResearchConfig
): Promise<string>
```

`runResearchPhaseInSession` uses the same `buildResearchPrompt(config)` helper — identical prompt content, just delivered via the shared session instead of a child harness.

---

### 3. `workflows/write-data-type-ref.ts`

This is the only file with real structural change. The key shape:

```typescript
// Threshold constant (easy to tune)
const LARGE_SOURCE_THRESHOLD_BYTES = 15_000;

// Resolve and measure source file
const absoluteSourcePath = dataTypeInfo?.filePath
  ? path.resolve(projectRoot, dataTypeInfo.filePath)
  : null;
const sourceFileSizeBytes = absoluteSourcePath && fs.existsSync(absoluteSourcePath)
  ? fs.statSync(absoluteSourcePath).size
  : null;
const useSeparateResearcher = !sourceFileSizeBytes || sourceFileSizeBytes > LARGE_SOURCE_THRESHOLD_BYTES;

// Log the routing decision
console.log(`  Architecture: ${useSeparateResearcher ? 'separate researcher agent' : 'single session'}`);
if (sourceFileSizeBytes) {
  const kb = (sourceFileSizeBytes / 1024).toFixed(1);
  console.log(`  Source file: ${kb}KB (threshold: ${LARGE_SOURCE_THRESHOLD_BYTES / 1000}KB)`);
}

// Branch: both paths produce `researchResult: string` and `session: FlueSession`
let researchResult: string;
let session: FlueSession;

if (useSeparateResearcher) {
  // Phase 1 in isolated researcher agent → fresh writer session
  researchResult = await runResearchPhase(init, config);
  const harness = await init(docsWriterAgent, { name: 'docs-write-data-type-ref' });
  session = await harness.session();
} else {
  // Single session: writer handles all phases
  const harness = await init(docsWriterAgent, { name: 'docs-write-data-type-ref' });
  session = await harness.session();
  researchResult = await runResearchPhaseInSession(session, config);
}

// Phase 2 prompt: inject research explicitly only for the separated path
const writePrompt = useSeparateResearcher
  ? `**Research Findings (from research phase):**\n${researchResult}\n\n---\n\n**Phase 2: Write Documentation**\nBased on the research findings above...`
  : `**Phase 2: Write Documentation**\nBased on your research from Phase 1...`;
```

Phases 3 and 4 are unchanged — they use `session.prompt(...)` and work identically regardless of which path was taken.

---

## Files to Modify

| File | Change |
|------|--------|
| `agents/docs-writer.ts` | Restore `docsResearchSkill` import and add back to `skills: []` |
| `workflows/phases/research.ts` | Add `runResearchPhaseInSession(session, config)`; extract shared prompt builder |
| `workflows/write-data-type-ref.ts` | Add threshold constant, size measurement, routing branch, conditional Phase 2 prompt |

`agents/docs-researcher.ts` — **no change** (stays research-only)  
`lib/scala-source-discovery.ts` — **no change** (size measurement done inline with `fs.statSync`)

---

## Verification

### Step 1: Build

```bash
cd writer-assistant && npm run build
# Zero TypeScript errors
```

### Step 2: Small file test (Dequeue.scala ~3KB → single session)

```bash
npx flue run write-data-type-ref --target node --payload '{
  "projectRoot": "/home/milad/sources/scala/zio-2.x-new",
  "outputPath": "docs/reference/concurrency/dequeue-adaptive.md",
  "dataTypePath": "core/shared/src/main/scala/zio/Dequeue.scala"
}'
```

Expected in log:
```
Architecture: single session
Source file: X.XKB (threshold: 15KB)
[docs-write-data-type-ref] ...  ← only one harness
```

No `[docs-researcher]` line should appear.

### Step 3: Large file test (ZIO.scala ~180KB → separate researcher)

```bash
npx flue run write-data-type-ref --target node --payload '{
  "projectRoot": "/home/milad/sources/scala/zio-2.x-new",
  "outputPath": "docs/reference/core/zio.md",
  "dataTypePath": "core/shared/src/main/scala/zio/ZIO.scala"
}'
```

Expected in log:
```
Architecture: separate researcher agent
Source file: XX.XKB (threshold: 15KB)
[docs-researcher] ...           ← Phase 1 harness
[docs-write-data-type-ref] ...  ← Phase 2-4 harness (fresh session)
```

### Step 4: Unknown path test (type name only → defaults to separated)

```bash
npx flue run write-data-type-ref --target node --payload '{
  "projectRoot": "/home/milad/sources/scala/zio-2.x-new",
  "outputPath": "docs/reference/core/chunk.md",
  "dataTypePath": "Chunk"
}'
```

Expected: `Architecture: separate researcher agent` (no `Source file:` line)
