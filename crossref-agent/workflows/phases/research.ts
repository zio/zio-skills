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
 * Build and execute the research phase
 * The research phase discovers source files, studies tests, extracts the public API,
 * and understands integration points. The focus field customizes the emphasis:
 * - data-type-ref: all public methods with signatures, tests, platform variants
 * - tutorial: beginner patterns, step-by-step workflows, common starting points
 * - guide: decision points, configuration, integration patterns, prerequisites
 * - explanation: motivation, design decisions, architecture, comparisons
 */
export async function runResearchPhase(session: FlueSession, config: ResearchConfig): Promise<string> {
  const { projectRoot, typeName, resolvedOutputPath, sourceDirs, dataTypeInfo, focus } = config;

  // Build the source directories list for the prompt
  const sourceDirList = sourceDirs.map((dir, i) => `[${i + 1}] ${dir}`).join('\n  ');

  // Build the research prompt with shared base + focus-specific section
  let researchPromptPrefix = `You are tasked with researching the Scala ${getDocumentationTypeLabel(focus)} for: ${typeName}

`;

  if (dataTypeInfo?.filePath) {
    researchPromptPrefix += `**Direct source file location provided:**
${dataTypeInfo.filePath}

Start by examining this file. If it's not in the project root, resolve it relative to projectRoot: ${projectRoot}

If the type has platform-specific variants (shared + jvm/js/native), search for those as well.

`;
  } else {
    researchPromptPrefix += `**Possible source code locations** (search across all of these):
  ${sourceDirList}

`;
  }

  const researchPrompt = researchPromptPrefix + buildResearchPromptBody(focus, typeName, projectRoot, resolvedOutputPath);

  const researchResult = await session.prompt(researchPrompt);
  return researchResult.text || String(researchResult);
}

/**
 * Get a human-readable label for the documentation type
 */
function getDocumentationTypeLabel(focus: ResearchFocus): string {
  const labels: Record<ResearchFocus, string> = {
    'data-type-ref': 'data type',
    'tutorial': 'tutorial',
    'guide': 'guide',
    'explanation': 'explanation',
  };
  return labels[focus];
}

/**
 * Build the research prompt body tailored to the documentation focus
 */
function buildResearchPromptBody(focus: ResearchFocus, typeName: string, projectRoot: string, resolvedOutputPath: string): string {
  const sharedBase = `Documentation will be written to: ${resolvedOutputPath}
Project root: ${projectRoot}

Scala projects often have multiple source directories (multi-platform, multi-module, or nested layouts). The type may be defined in one or more of these directories. Search across all of them to find the complete definition.

**Phase 1: Research**

Your task is to deeply research this Scala ${getDocumentationTypeLabel(focus)}:

1. **Locate the source file(s)**
   - Search across all provided source directories
   - Find the file(s) containing ${typeName}
   - Read the complete definition and understand its structure
   - If defined in multiple directories (e.g., shared + platform-specific), document all variants
   - Note type parameters, variance, and base classes/traits

2. **Study the tests and examples**
   - Find test files for ${typeName}
   - Identify common usage patterns and test cases
   - Look for realistic examples in the test suite

3. **Locate all public APIs**
   - Extract all public methods on the type
   - Extract all companion object methods
   - If there are platform-specific methods, document all variants
   - List them with signatures
   - Note any deprecated methods

4. **Understand integration points**
   - How does ${typeName} integrate with other types?
   - What other types depend on it?
   - Are there related subtypes or variants?
   - Look for existing documentation in the repo

`;

  // Focus-specific research instructions
  const focusSpecific: Record<ResearchFocus, string> = {
    'data-type-ref': `5. **Extract complete reference documentation material**
   - Motivation: Why does this type exist? What problem does it solve?
   - All public methods with full signatures and return types
   - Companion object methods and factory functions
   - Type parameters, variance, and constraints
   - Key design decisions and error handling patterns
   - Integration with related types (dependencies and dependents)
   - Any platform-specific variants or implementations

After completing the research, provide a summary of:
- The complete type definition (including all platform variants if applicable)
- All public methods (with signatures)
- Key use cases and integration points
- Any important design decisions or caveats`,

    'tutorial': `5. **Identify tutorial-worthy patterns and workflows**
   - What would a beginner to ${typeName} want to learn first?
   - What are the most common usage patterns?
   - What are typical step-by-step workflows someone would follow?
   - What are common mistakes or misconceptions?
   - What examples from the test suite best illustrate the concepts?
   - What prerequisites or related concepts should be covered?

After completing the research, provide a summary of:
- The core concepts and motivation for ${typeName}
- 2–3 beginner-friendly usage patterns with examples
- A recommended learning path (what to cover in what order)
- Common pitfalls to warn about
- Related concepts that should be cross-referenced`,

    'guide': `5. **Map configuration options and decision points**
   - What are the key configuration options and parameters?
   - What decision points must users make (e.g., manual vs. automatic)?
   - What are the tradeoffs between different approaches?
   - What are the prerequisites or setup steps?
   - What are common integration patterns with other types?
   - What performance or resource implications should users know about?

After completing the research, provide a summary of:
- Prerequisites and setup requirements for ${typeName}
- Key decision points and configuration options
- Recommended approaches for different use cases
- Integration patterns with related types
- Performance characteristics and tradeoffs
- Troubleshooting or common issues`,

    'explanation': `5. **Trace design motivation and architecture**
   - Why was ${typeName} designed the way it is?
   - What problems was it solving?
   - What are the architectural principles behind it?
   - How does it compare to similar types or patterns in other libraries?
   - What tradeoffs were made in the design?
   - How does it fit into the broader type system or architecture?
   - What historical context led to its current form?

After completing the research, provide a summary of:
- The motivation and problem space for ${typeName}
- Core design principles and philosophy
- Architectural decisions and their rationale
- Comparison with similar concepts or libraries
- How it integrates into the broader system
- Key tradeoffs and their justification`,
  };

  const sharedFooter = `
Report your findings in a clear, structured format that can be used as a reference by the documentation writer in subsequent phases.`;

  return sharedBase + focusSpecific[focus] + sharedFooter;
}
