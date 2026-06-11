import 'dotenv/config.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Anthropic } from '@anthropic-ai/sdk';
import type { BuildError } from './build-error-extractor.js';

export interface DocFixerPayload {
  projectRoot: string;
  buildErrors: BuildError[];
  buildOutput: string;
  buildSystem: 'docusaurus' | 'mkdocs' | 'sphinx' | 'hugo';
  attempt: number;
}

export interface FixResult {
  fixed: boolean;
  fixedCount: number;
  summary: string;
  changes: Array<{
    file: string;
    change: string;
  }>;
}

export async function runDocFixer(payload: DocFixerPayload): Promise<FixResult> {
  const { projectRoot, buildErrors, buildOutput, buildSystem, attempt } = payload;

  const client = new Anthropic();
  const changes: Array<{ file: string; change: string }> = [];

  console.log(`[auto-fixer] Analyzing ${buildErrors.length} build errors (attempt ${attempt})`);

  // Holistic analysis: ask Claude to identify fixable issues
  const analysisPrompt = buildAnalysisPrompt(buildErrors, buildOutput, buildSystem, projectRoot);

  const analysis = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{ role: 'user', content: analysisPrompt }],
  });

  const analysisText = analysis.content[0].type === 'text' ? analysis.content[0].text : '';

  console.log(`[auto-fixer] Analysis:\n${analysisText.substring(0, 500)}`);

  // Extract fixable issues from the analysis
  const fixablePaths = extractFixablePaths(analysisText, projectRoot);

  console.log(`[auto-fixer] Identified ${fixablePaths.length} fixable issue(s)`);

  // Apply fixes
  for (const filePath of fixablePaths) {
    const fixResult = await applyFix(client, projectRoot, filePath, buildOutput, buildSystem);
    if (fixResult) {
      changes.push(fixResult);
    }
  }

  const summary =
    changes.length > 0
      ? `Fixed ${changes.length} issue${changes.length === 1 ? '' : 's'}: ${changes.map((c) => c.change).join(', ')}`
      : 'No fixes could be applied';

  console.log(`[auto-fixer] ${summary}`);

  return {
    fixed: changes.length > 0,
    fixedCount: changes.length,
    summary,
    changes,
  };
}

function extractFixablePaths(analysisText: string, projectRoot: string): string[] {
  const paths: string[] = [];

  // Look for FIX: patterns in the response
  const fixLines = analysisText.split('\n').filter((line) => line.includes('FIX:') || line.includes('Fixable:'));

  for (const line of fixLines) {
    const match = line.match(/FIX:\s*(.+?)(?:\s|-|$)/);
    if (match) {
      const filePath = match[1].trim();
      const possiblePaths = [
        path.join(projectRoot, filePath),
        path.resolve(filePath),
      ];

      for (const tryPath of possiblePaths) {
        if (fs.existsSync(tryPath)) {
          paths.push(tryPath);
          break;
        }
      }
    }
  }

  // Also include common fixable files
  const commonFixableFiles = [
    path.join(projectRoot, 'package.json'),
    path.join(projectRoot, 'website', 'package.json'),
    path.join(projectRoot, 'website', 'docusaurus.config.js'),
  ];

  for (const file of commonFixableFiles) {
    if (fs.existsSync(file) && !paths.includes(file)) {
      paths.push(file);
    }
  }

  return paths;
}

async function applyFix(
  client: Anthropic,
  projectRoot: string,
  filePath: string,
  buildOutput: string,
  buildSystem: string
): Promise<{ file: string; change: string } | null> {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const prompt = buildFixPrompt(filePath, content, buildOutput, buildSystem, projectRoot);

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    if (responseText.includes('FIXED_CONTENT:')) {
      const [, fixedContent] = responseText.split('FIXED_CONTENT:');
      const trimmedContent = fixedContent.trim();

      fs.writeFileSync(filePath, trimmedContent, 'utf-8');
      const changeDesc = extractChangeDescription(responseText);

      const relativePath = path.relative(projectRoot, filePath);
      console.log(`[auto-fixer] Fixed ${relativePath}: ${changeDesc}`);

      return {
        file: relativePath,
        change: changeDesc,
      };
    }

    return null;
  } catch (err) {
    console.error(
      `[auto-fixer] Error fixing ${filePath}:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

function buildAnalysisPrompt(
  buildErrors: BuildError[],
  buildOutput: string,
  buildSystem: string,
  projectRoot: string
): string {
  const errorSummary = buildErrors
    .slice(0, 30)
    .map((e) => `- [${e.type}] ${e.file}${e.line ? `:${e.line}` : ''}: ${e.message}`)
    .join('\n');

  return `You are a senior software engineer analyzing build failures. Your job is to identify and fix the root causes.

PROJECT ROOT: ${projectRoot}
BUILD SYSTEM: ${buildSystem}

BUILD ERRORS (${buildErrors.length} total):
${errorSummary}
${buildErrors.length > 30 ? `\n... and ${buildErrors.length - 30} more` : ''}

BUILD OUTPUT SUMMARY (last 1500 chars):
${buildOutput.slice(-1500)}

TASK:
Analyze these errors and identify which ones can be fixed by modifying files. Consider:

1. Missing dependencies (add to package.json)
2. Missing configuration (update config files)
3. Broken documentation links (fix in markdown files)
4. Syntax errors (fix in any file)
5. Missing plugins or modules (update package.json or config)

For each FIXABLE issue, respond with:
FIX: path/to/file
Brief description of what to change

For example:
FIX: package.json
Add missing docusaurus-plugin-copy-page-button to devDependencies

FIX: website/docusaurus.config.js
Register the copy-page-button plugin

Focus on the ROOT CAUSES, not just the symptoms. If errors repeat, fix once at the source.`;
}

function buildFixPrompt(
  filePath: string,
  content: string,
  buildOutput: string,
  buildSystem: string,
  projectRoot: string
): string {
  const fileName = path.basename(filePath);
  const isJson = fileName.endsWith('.json');
  const isJs = fileName.endsWith('.js');
  const isTs = fileName.endsWith('.ts');
  const isMd = fileName.endsWith('.md');

  return `You are a software engineer fixing a build failure. The file you need to fix is:

FILE: ${filePath}
BUILD SYSTEM: ${buildSystem}

CURRENT CONTENT:
\`\`\`${isJson ? 'json' : isJs ? 'javascript' : isTs ? 'typescript' : isMd ? 'markdown' : 'text'}
${content}
\`\`\`

BUILD OUTPUT CONTEXT:
${buildOutput.slice(-1000)}

TASK:
1. Analyze the build errors and the file content
2. Identify what needs to be changed in this file to fix the errors
3. Make the minimal necessary changes
4. Preserve all existing content except where fixes are needed

If you can fix it, respond with:
FIX_DESCRIPTION: [one sentence describing the fix]
FIXED_CONTENT:
[complete fixed file content - must be valid ${fileName} format]

If you cannot safely fix it, respond with:
CANNOT_FIX: [reason why]`;
}

function extractChangeDescription(response: string): string {
  const match = response.match(/FIX_DESCRIPTION:\s*(.+)/);
  if (match) {
    return match[1].trim();
  }
  return 'Applied fix';
}
