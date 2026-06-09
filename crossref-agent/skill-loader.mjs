import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';

export async function load(url, context, nextLoad) {
  // Handle .md files with skill assertion
  if (url.endsWith('.md')) {
    const filepath = new URL(url).pathname;
    const content = readFileSync(filepath, 'utf-8');

    // Return the skill content as a default export
    return {
      format: 'module',
      source: `export default ${JSON.stringify(content)};`,
      shortCircuit: true,
    };
  }

  // Delegate to the next loader for non-.md files
  return nextLoad(url, context);
}
