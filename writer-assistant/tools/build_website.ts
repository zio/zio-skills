import { defineTool } from '@flue/runtime';
import { execSync } from 'node:child_process';

export function createBuildWebsite(projectRoot: string) {
  return defineTool({
    name: 'build_website',
    description:
      'Build the Docusaurus website and get structured error feedback. Returns: success status, error count, and parsed error messages. Use this after run_mdoc passes to catch broken doc IDs, missing sidebar entries, and broken links before committing.',
    run: async () => {
      const command = 'yarn build';

      console.log(`[build_website] Executing: ${command} in ${projectRoot}/website`);

      let stdout = '';
      let stderr = '';
      let exitCode = 0;

      try {
        stdout = execSync(command, {
          cwd: `${projectRoot}/website`,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error: any) {
        exitCode = error.status || 1;
        stdout = error.stdout ? error.stdout.toString() : '';
        stderr = error.stderr ? error.stderr.toString() : '';
      }

      const fullOutput = stdout + stderr;
      console.log(`[build_website] Exit code: ${exitCode}`);

      // Parse error lines — Docusaurus uses "Error:" prefix; yarn failures use "error" (lowercase)
      const errorLines = fullOutput
        .split('\n')
        .filter((line) => /Error:|^error\s|^✖/.test(line.trim()))
        .map((line) => line.trim())
        .slice(0, 20); // limit to 20 errors to avoid bloat

      const errorCount = errorLines.length;
      const success = exitCode === 0 && errorCount === 0;

      if (!success) {
        console.log(`[build_website] Errors detected:\n${fullOutput}`);
      }

      return {
        success,
        command,
        errorCount,
        errors: errorLines,
      };
    },
  });
}
