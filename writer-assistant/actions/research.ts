import { defineAction } from '@flue/runtime';
import * as v from 'valibot';

export type ResearchFocus = 'data-type-ref' | 'tutorial' | 'guide' | 'explanation' | 'diagram';

export interface ResearchConfig {
  projectRoot: string;
  typeName: string;
  resolvedOutputPath: string;
  sourceDirs: string[];
  dataTypeInfo?: { filePath?: string; fileName?: string; typeName?: string };
  focus: ResearchFocus;
}

export async function runResearchPhase(harness: any, config: ResearchConfig): Promise<string> {
  const { projectRoot, typeName, resolvedOutputPath, sourceDirs, dataTypeInfo, focus } = config;

  const sourceDirList = sourceDirs.map((dir, i) => `[${i + 1}] ${dir}`).join('\n  ');

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

  process.env.FLUE_PROJECT_ROOT = projectRoot;

  const session = await harness.session('docs-researcher');
  const result = await session.prompt(prompt);
  return result.text || String(result);
}

export const researchAction = defineAction({
  name: 'research_docs',
  description:
    'Research a documentation topic comprehensively using the docs-research skill. Covers source discovery, code flow analysis, architecture analysis, and documentation landscape.',
  input: v.object({
    projectRoot: v.string(),
    typeName: v.string(),
    resolvedOutputPath: v.string(),
    sourceDirs: v.array(v.string()),
    focus: v.picklist(['data-type-ref', 'tutorial', 'guide', 'explanation', 'diagram'] as const),
    dataTypeInfo: v.optional(
      v.object({
        filePath: v.optional(v.string()),
        fileName: v.optional(v.string()),
        typeName: v.optional(v.string()),
      })
    ),
  }),
  run: (async ({ harness, input }: { harness: any; input: any }) => {
    return runResearchPhase(harness, input);
  }) as (ctx: any) => any,
});

function getDocumentationTypeLabel(focus: ResearchFocus): string {
  const labels: Record<ResearchFocus, string> = {
    'data-type-ref': 'Data Type Reference',
    tutorial: 'Tutorial',
    guide: 'How-To Guide',
    explanation: 'Explanation',
    diagram: 'Diagram Internals Research',
  };
  return labels[focus];
}

function getFocusInstruction(focus: ResearchFocus, typeName: string): string {
  const instructions: Record<ResearchFocus, string> = {
    'data-type-ref': `**Focus:** Extract all public methods, signatures, companion object methods, type variants, and design decisions. Emphasize: complete API surface, test coverage, platform-specific implementations.`,

    tutorial: `**Focus:** Identify beginner-friendly patterns and step-by-step workflows. Emphasize: common usage patterns, construction patterns, simple examples, learning prerequisites.`,

    guide: `**Focus:** Map configuration options, decision points, and integration patterns. Emphasize: setup requirements, tradeoffs, use case selection, integration examples.`,

    explanation: `**Focus:** Trace design motivation, architectural decisions, and rationale. Emphasize: design principles, problem domain, historical context, comparisons with alternatives.`,

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
