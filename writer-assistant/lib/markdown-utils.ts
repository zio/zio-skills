import * as fs from 'node:fs';
import * as path from 'node:path';

export function findRecentlyModifiedMarkdownFiles(
  projectRoot: string,
  docsDir: string,
  sinceTime: number
): string[] {
  if (!fs.existsSync(docsDir)) {
    return [];
  }

  const result: string[] = [];
  const walk = (dir: string) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // Skip hidden files/dirs
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.mtimeMs >= sinceTime) {
              result.push(path.relative(projectRoot, fullPath));
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  };

  walk(docsDir);
  return result;
}
