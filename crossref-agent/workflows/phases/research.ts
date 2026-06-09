import type { FlueSession } from '@flue/runtime';

export type ResearchFocus = 'data-type-ref' | 'tutorial' | 'guide' | 'explanation';

export interface ResearchConfig {
  projectRoot: string;
  typeName: string;
  resolvedOutputPath: string;
  sourceDirs: string[];
  dataTypeInfo?: { filePath?: string; fileName?: string; typeName?: string };
  focus: ResearchFocus;
}

/**
 * Run the research phase for a documentation topic
 * Delegates to the docs-research skill for comprehensive research guidance
 * The skill covers: source discovery, code flow analysis, architecture analysis, and documentation landscape
 * The focus parameter customizes what insights to emphasize in the research output
 */
export async function runResearchPhase(session: FlueSession, config: ResearchConfig): Promise<string> {
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

  const result = await session.prompt(prompt);
  return result.text || String(result);
}

function getDocumentationTypeLabel(focus: ResearchFocus): string {
  const labels: Record<ResearchFocus, string> = {
    'data-type-ref': 'Data Type Reference',
    'tutorial': 'Tutorial',
    'guide': 'How-To Guide',
    'explanation': 'Explanation',
  };
  return labels[focus];
}

function getFocusInstruction(focus: ResearchFocus, typeName: string): string {
  const instructions: Record<ResearchFocus, string> = {
    'data-type-ref': `**Focus:** Extract all public methods, signatures, companion object methods, type variants, and design decisions. Emphasize: complete API surface, test coverage, platform-specific implementations.`,

    'tutorial': `**Focus:** Identify beginner-friendly patterns and step-by-step workflows. Emphasize: common usage patterns, construction patterns, simple examples, learning prerequisites.`,

    'guide': `**Focus:** Map configuration options, decision points, and integration patterns. Emphasize: setup requirements, tradeoffs, use case selection, integration examples.`,

    'explanation': `**Focus:** Trace design motivation, architectural decisions, and rationale. Emphasize: design principles, problem domain, historical context, comparisons with alternatives.`,
  };
  return instructions[focus];
}
