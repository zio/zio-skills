// TODO: This phase needs docsResearcherAgent — a different agent from the calling workflow's primary.
// Migration: accept FlueHarness for docsResearcherAgent once multi-agent pattern is resolved.
import docsResearcherAgent from '../../agents/docs-researcher.js';

export type ResearchFocus =
  | 'data-type-ref'
  | 'tutorial'
  | 'guide'
  | 'explanation'
  | 'diagram'
  | 'module-ref';

export interface ResearchConfig {
  projectRoot: string;
  typeName: string;
  resolvedOutputPath: string;
  sourceDirs: string[];
  dataTypeInfo?: { filePath?: string; fileName?: string; typeName?: string };
  focus: ResearchFocus;
}

/**
 * Run the research phase for a documentation topic in a dedicated researcher agent
 * Creates its own harness to isolate research context from the writer
 * Delegates to the docs-research skill for comprehensive research guidance
 * The skill covers: source discovery, code flow analysis, architecture analysis, and documentation landscape
 * The focus parameter customizes what insights to emphasize in the research output
 */
export async function runResearchPhase(
  harness: any, // TODO: should be FlueHarness for docsResearcherAgent once multi-agent migrated
  config: ResearchConfig
): Promise<string> {
  const { projectRoot, typeName, resolvedOutputPath, sourceDirs, dataTypeInfo, focus } = config;

  const sourceDirList = sourceDirs.map((dir, i) => `[${i + 1}] ${dir}`).join('\n  ');

  // Build directive that references the loaded docs-research skill
  let prompt = `**Research Phase: ${getDocumentationTypeLabel(focus)}**

Topic: ${typeName}

`;

  if (dataTypeInfo?.filePath) {
    prompt += `**Direct source file location:**
${dataTypeInfo.filePath}

`;
  } else {
    prompt += `**Source directories to search:**
${sourceDirList}

`;
  }

  prompt += `**Using the docs-research skill, research this topic comprehensively:**

Follow the 4-phase analysis approach documented in the docs-research skill:
1. **Discovery Phase** — Locate core source files and identify scope/boundaries
2. **Code Flow & Usage Tracing** — Understand how the API is used through tests, examples, and type dependencies
3. **Architecture & Design Analysis** — Map abstraction layers, patterns, and GitHub history for design rationale
4. **Documentation Landscape** — Check existing coverage and identify gaps

Build internal research notes covering: core types, public API, usage patterns, dependencies, real-world examples, documentation gaps, architecture insights, and critical files.

${getFocusInstruction(focus, typeName)}

Output: Structured research notes (not a formal report) that prepare the documentation writer for Phase 2.`;

  // Set environment variable for agent's sandbox cwd
  process.env.FLUE_PROJECT_ROOT = projectRoot;

  // TODO: harness here is the calling workflow's primary agent harness, NOT docsResearcherAgent.
  // This will use the wrong agent until multi-agent migration is complete.
  // Proper fix: accept a dedicated FlueHarness for docsResearcherAgent.
  void docsResearcherAgent; // suppress unused import warning
  const session = await harness.session('docs-researcher');
  const result = await session.prompt(prompt);
  return result.text || String(result);
}

function getDocumentationTypeLabel(focus: ResearchFocus): string {
  const labels: Record<ResearchFocus, string> = {
    'data-type-ref': 'Data Type Reference',
    tutorial: 'Tutorial',
    guide: 'How-To Guide',
    explanation: 'Explanation',
    diagram: 'Diagram Internals Research',
    'module-ref': 'Module Reference',
  };
  return labels[focus];
}

function getFocusInstruction(focus: ResearchFocus, typeName: string): string {
  const instructions: Record<ResearchFocus, string> = {
    'data-type-ref': `**Focus:** Extract all public methods, signatures, companion object methods, type variants, and design decisions. Emphasize: complete API surface, test coverage, platform-specific implementations.`,

    tutorial: `**Focus:** Identify beginner-friendly patterns and step-by-step workflows. Emphasize: common usage patterns, construction patterns, simple examples, learning prerequisites.`,

    guide: `**Focus:** Map configuration options, decision points, and integration patterns. Emphasize: setup requirements, tradeoffs, use case selection, integration examples.`,

    explanation: `**Focus:** Trace design motivation, architectural decisions, and rationale. Emphasize: design principles, problem domain, historical context, comparisons with alternatives.`,

    'module-ref': `**Focus:** Map the full module landscape — not a single type, but how all core types work together as a system.

Specifically gather:
- All core and supporting types in the module — their roles and responsibilities
- Type relationships: which types contain, extend, or depend on others
- Data flow patterns: how data moves through the module's type system
- Common composition patterns: realistic multi-type usage sequences
- Real-world usage examples from tests, examples, and application code
- Existing documentation gaps — what's documented vs. what's missing
- Integration points with other ZIO modules or external libraries

Do NOT focus on exhaustive per-method API surface — that comes during writing. Emphasize: how types relate, how they compose, and what patterns experienced users rely on.`,

    diagram: `**Focus:** Extract the internal mechanics needed to build a faithful interactive diagram.

Specifically gather:
- Internal state variables (names, types, what they represent)
- Concurrency primitives used (semaphores, promises, locks, atomics) and how they interact
- Key operations: for each public method, what internal state is read, in what order, and what changes
- State machine: all valid states and transitions (e.g. open → broken → reset)
- Lifecycle: how the data structure is created, used, and destroyed
- Edge cases visible to callers: full, empty, broken, interrupted states
- Any counters or indices that advance monotonically

Do NOT focus on documentation gaps, comparisons, or historical rationale — only what is needed to implement a correct interactive simulation.`,
  };
  return instructions[focus];
}
