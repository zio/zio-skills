import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

export function createRunMdoc(projectRoot: string) {
  return defineTool({
    name: 'run_mdoc',
    description: 'Compile markdown/mdx files with mdoc and get structured error feedback. Returns: success status, error count, and parsed error messages. Use this instead of running sbt directly to get reliable error parsing for iterative fixes.',
    parameters: v.object({
      paths: v.optional(v.array(v.string())),
    }),
    execute: async (args: Record<string, any>) => {
      const paths = args.paths as string[] | undefined;

      let command: string;
      if (!paths || paths.length === 0) {
        command = 'sbt docs/mdoc';
      } else {
        // Build command with --in and --out pairs for each path
        // docs/reference/core/runtime.md → website/docs/reference/core/runtime.md
        // docs/reference/core/ → website/docs/reference/core/
        const pairs = paths.map(inPath => {
          const outPath = inPath.replace(/^/, 'website/');
          return `--in ${inPath} --out ${outPath}`;
        }).join(' ');
        command = `sbt "docs/mdoc ${pairs}"`;
      }

      console.log(`[run_mdoc] Executing: ${command}`);

      let stdout = '';
      let stderr = '';
      let exitCode = 0;

      try {
        stdout = execSync(command, {
          cwd: projectRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error: any) {
        exitCode = error.status || 1;
        stdout = error.stdout ? error.stdout.toString() : '';
        stderr = error.stderr ? error.stderr.toString() : '';
      }

      const fullOutput = stdout + stderr;
      console.log(`[run_mdoc] Exit code: ${exitCode}`);

      // Parse [error] lines
      const errorLines = fullOutput
        .split('\n')
        .filter(line => line.includes('[error]'))
        .map(line => line.trim())
        .slice(0, 20); // limit to 20 errors to avoid bloat

      const errorCount = errorLines.length;
      const success = exitCode === 0 && errorCount === 0;

      // Log full output for debugging (goes to process stdout, not agent context)
      if (!success) {
        console.log(`[run_mdoc] Errors detected:\n${fullOutput}`);
      }

      return JSON.stringify({
        success,
        command,
        errorCount,
        errors: errorLines,
      });
    }
  });
}
