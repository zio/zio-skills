import { parseFrontmatter } from '../../lib/markdown-parser.js';

function quoteYamlString(value: string): string {
  if (!value) return '""';
  if (value.includes('\n') || value.includes('"') || value.includes(':') || value.includes('[') || value.includes(']') || value.includes('#') || /\s/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

function serializeYamlValue(value: any): string {
  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    if (/^[a-zA-Z0-9._/-]+$/.test(value)) {
      return value;
    }

    if (/[\n"':[\]{}@`#]/.test(value)) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }

    return `"${value}"`;
  }

  return `"${String(value)}"`;
}

export function updateFrontmatter(content: string, metadata: { description: string; keywords: string[] }): string {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);

  if (!fmMatch) {
    const keywordsList = metadata.keywords
      .map(k => `  - ${quoteYamlString(k)}`)
      .join('\n');
    const newFm = `description: ${quoteYamlString(metadata.description)}\nkeywords:\n${keywordsList}`;
    return `---\n${newFm}\n---\n${content}`;
  }

  const fm: Record<string, any> = parseFrontmatter(content);
  fm.description = metadata.description;
  fm.keywords = metadata.keywords;

  const newFm = Object.entries(fm)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        const items = v.map((x: any) => `  - ${quoteYamlString(String(x))}`).join('\n');
        return `${k}:\n${items}`;
      }
      return `${k}: ${serializeYamlValue(v)}`;
    })
    .join('\n');

  return `---\n${newFm}\n---\n${content.slice(fmMatch[0].length)}`;
}
