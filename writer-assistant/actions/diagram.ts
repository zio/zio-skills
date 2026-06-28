import { defineAction } from '@flue/runtime';
import * as v from 'valibot';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DiagramConfig {
  projectRoot: string;
  typeName: string;
  resolvedJsxPath: string;
  sourceDirs: string[];
  dataTypeInfo?: { filePath?: string; fileName?: string; typeName?: string };
  researchResult: string;
  baseUrl?: string;
  userPrompt?: string;
  /** Absolute path to the MDX article to patch with ## Diagram section. */
  articlePath?: string;
}

export interface DiagramResult {
  success: boolean;
  componentName: string;
  jsxOutputPath: string;
  articlePatched: boolean;
}

export async function runDiagramPhase(harness: any, config: DiagramConfig): Promise<DiagramResult> {
  const {
    projectRoot,
    typeName,
    resolvedJsxPath,
    researchResult,
    baseUrl,
    userPrompt,
    articlePath,
  } = config;

  const jsxFileName = path.basename(resolvedJsxPath);
  const componentName = path.basename(jsxFileName, '.jsx');

  const designPrompt = `**Diagram Design Phase: ${typeName}**

## Research Notes

${researchResult}

---

## Your Task

Design and implement an interactive JSX diagram for **${typeName}** that makes its data flow or core algorithm immediately understandable through hands-on manipulation.

**Component name:** \`${componentName}\` (default export)

**Output file:** \`${resolvedJsxPath}\`
${baseUrl ? `\n**Documentation site:** ${baseUrl}\n` : ''}
${userPrompt ? `\n**Design notes from author:** ${userPrompt}\n` : ''}

## Design guidelines

1. **Study the research notes** — identify the core data flow or algorithm worth visualizing
2. **Choose the right visualization:**
   - Ring buffers, queues, bounded data structures → SVG slots with index arrows
   - State machines, lifecycle → node/edge graph with state transitions highlighted
   - Multi-actor message passing → layered zones with flow arrows between them
3. **Make every operation observable:** when a user triggers an action, show which element was affected, what values changed, and what decision was reached
4. **Trace panel:** show the actual variable values computed during the operation (like a debugger watch window)
5. **History log:** list past operations so users can navigate back/forward to replay steps

## Constraints

- Allowed imports: React hooks + \`{ useColorMode } from '@docusaurus/theme-common'\`
- All CSS as inline style objects
- Default export the component
- Self-contained — no external data files or API calls
- Must compile in a Docusaurus MDX environment (React 18)
- Theme-aware: call \`useColorMode()\` at the top of the component and derive all colors
  from a \`T\` palette object. Never hardcode light-mode hex values (#fff, #fafaf8, #ccc, etc.)
  Use \`T.bg\`, \`T.surface\`, \`T.border\`, \`T.text\`, \`T.muted\` for neutral colors;
  \`T.write\`, \`T.read\`, \`T.fail\` for accents (same in both modes)

Write the complete JSX file to the output path now.`;

  process.env.FLUE_PROJECT_ROOT = projectRoot;

  const designSession = await harness.session(`diagram-designer-${typeName}`);

  let designSuccess = false;
  try {
    await designSession.prompt(designPrompt);
    designSuccess = fs.existsSync(resolvedJsxPath);
  } catch (error) {
    console.error(
      `[diagram phase] Design agent error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let articlePatched = false;
  if (designSuccess && articlePath && fs.existsSync(articlePath)) {
    const patchPrompt = `**Patch Article: Add ## Diagram Section**

A new interactive diagram component has been created at:
\`${resolvedJsxPath}\`

Component name: \`${componentName}\`
JSX file name: \`${jsxFileName}\`

Please update the article at \`${articlePath}\` to reference this diagram:

1. **Add import at the top of the file** — immediately after the frontmatter (after the closing \`---\`), add:
   \`import ${componentName} from './${jsxFileName}';\`
   If other imports already exist there, add it alongside them.

2. **Insert a \`## Diagram\` section** — find the most appropriate position:
   - After any algorithm/internals explanation section (e.g. \`## Algorithm\`, \`## How It Works\`, \`## Internals\`)
   - Before any usage patterns section (e.g. \`## Common Patterns\`, \`## Advanced Usage\`, \`## Usage\`)
   - If neither landmark exists, insert it after the first major section

3. **Section content** (write all three elements):
   - 2-3 sentences explaining what the diagram visualizes (the data flow or algorithm it shows)
   - The component tag on its own line: \`<${componentName} />\`
   - 1 sentence describing how to interact (what buttons do, what the trace panel shows)

Do not modify any other part of the article.`;

    try {
      const patchSession = await harness.session('diagram-article-patcher');
      await patchSession.prompt(patchPrompt);
      articlePatched = true;
    } catch (error) {
      console.error(
        `[diagram phase] Article patch error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return {
    success: designSuccess,
    componentName,
    jsxOutputPath: resolvedJsxPath,
    articlePatched,
  };
}

export const diagramAction = defineAction({
  name: 'design_diagram',
  description:
    'Generate an interactive JSX diagram component for a data type or algorithm, then optionally patch an MDX article to embed it.',
  input: v.object({
    projectRoot: v.string(),
    typeName: v.string(),
    resolvedJsxPath: v.string(),
    sourceDirs: v.array(v.string()),
    researchResult: v.string(),
    dataTypeInfo: v.optional(
      v.object({
        filePath: v.optional(v.string()),
        fileName: v.optional(v.string()),
        typeName: v.optional(v.string()),
      })
    ),
    baseUrl: v.optional(v.string()),
    userPrompt: v.optional(v.string()),
    articlePath: v.optional(v.string()),
  }),
  run: (async ({ harness, input }: { harness: any; input: any }) => {
    return runDiagramPhase(harness, input);
  }) as (ctx: any) => any,
});
