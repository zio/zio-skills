const COMMON_WORDS = new Set([
  'The', 'This', 'That', 'These', 'Those', 'A', 'An', 'And', 'Or', 'But',
  'For', 'With', 'From', 'To', 'In', 'On', 'At', 'By', 'Is', 'Are', 'Was',
  'Be', 'Has', 'Have', 'Do', 'Does', 'Did', 'Will', 'Would', 'Could', 'Should',
  'Not', 'It', 'Its', 'You', 'Your', 'We', 'Our', 'If', 'As', 'Of',
]);

export function parseFrontmatter(content: string): Record<string, any> {
  // Issue #2 fix: Handle empty array fields (key: with no items on same line)
  // Pattern matches: --- ... ---\n or --- ... ---$ (at EOF)
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return {};

  const result: Record<string, any> = {};
  const lines = match[1].split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] = [];

  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) {
      continue;
    }

    // Scalar line: "key: value"
    // Issue #1 fix: Accept hyphens in YAML keys (e.g., sidebar-position)
    const scalarMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (scalarMatch) {
      // Save previous array (even if empty, to handle "key:" with no items)
      if (currentKey !== null) {
        result[currentKey] = currentArray;
      }

      // Start new scalar
      currentKey = scalarMatch[1];
      const value = scalarMatch[2].trim();

      if (value) {
        // Issue #4 fix: Preserve type information for booleans and nulls (don't quote them)
        let parsedValue: any;
        if (value === 'true' || value === 'false') {
          parsedValue = value === 'true';
        } else if (value === 'null') {
          parsedValue = null;
        } else {
          // Scalar with value on same line - remove quotes if present
          parsedValue = value.replace(/^["']|["']$/g, '');
        }
        result[currentKey] = parsedValue;
        currentKey = null;
        currentArray = [];
      } else {
        // Scalar with no value (likely start of array or empty field)
        currentArray = [];
      }
    }
    // Array item line: "  - value"
    else if (currentKey !== null && line.match(/^\s*-\s+/)) {
      const itemMatch = line.match(/^\s*-\s+(.*)$/);
      if (itemMatch) {
        let item = itemMatch[1].trim();
        // Issue #8 fix: Handle YAML values with special characters like colons by preserving them
        // Only remove quotes if they surround the entire value
        if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) {
          item = item.slice(1, -1);
        }
        currentArray.push(item);
      }
    }
  }

  // Save final array (even if empty)
  if (currentKey !== null) {
    result[currentKey] = currentArray;
  }

  return result;
}

export function extractTitle(content: string, fallback: string): string {
  const fm = parseFrontmatter(content);
  if (fm.title) return fm.title;
  const heading = content.match(/^#{1,6}\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return fallback;
}

export function extractSummary(content: string): string {
  // Strip frontmatter
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  // Strip headings and blank lines, find first sentence
  const lines = body.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const text = lines.join(' ');
  const sentence = text.match(/[^.!?]+[.!?]/);
  return sentence ? sentence[0].trim() : text.slice(0, 200).trim();
}

export function extractKeywords(content: string): string[] {
  const seen = new Set<string>();
  const regex = /\b[A-Z][a-zA-Z]+\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const word = match[0];
    if (!COMMON_WORDS.has(word)) seen.add(word);
  }
  return Array.from(seen).slice(0, 15);
}

export function extractExistingLinks(content: string): { text: string; href: string }[] {
  const links: { text: string; href: string }[] = [];
  const regex = /\[([^\]]+)\]\(([^\s)]{1,500})\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const href = match[2];
    if (!href.startsWith('http://') && !href.startsWith('https://')) {
      links.push({ text: match[1], href });
    }
  }
  return links;
}

export function extractHeadings(content: string): { text: string; slug: string }[] {
  const headings: { text: string; slug: string }[] = [];
  const regex = /^#+\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const text = match[1];
    // Convert to anchor slug (lowercase, replace spaces with dashes, remove special chars)
    const slug = text.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    headings.push({ text, slug });
  }
  return headings;
}

export function computeSafeZones(content: string, options?: { includeInlineCode?: boolean }): { start: number; end: number }[] {
  const zones: { start: number; end: number }[] = [];

  // Frontmatter block
  // Issue #1 fix: Account for code fences inside frontmatter by parsing code fences first
  // and excluding them when looking for frontmatter boundaries
  // Extract code fence zones first to avoid matching closing --- inside code fences
  const codeFenceRegex = /(```|~~~)[\s\S]*?\1/g;
  const codeFenceZones: { start: number; end: number }[] = [];
  let codeFenceMatch: RegExpExecArray | null;
  while ((codeFenceMatch = codeFenceRegex.exec(content)) !== null) {
    codeFenceZones.push({ start: codeFenceMatch.index, end: codeFenceMatch.index + codeFenceMatch[0].length });
  }

  // Match frontmatter: --- at start, content, ---, then newline or EOF
  // But verify the closing --- is not inside a code fence
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (fmMatch && fmMatch.index !== undefined) {
    // Check if the closing --- is inside a code fence
    const closingDashesStart = fmMatch.index + fmMatch[0].lastIndexOf('\n---');
    const isInCodeFence = codeFenceZones.some(zone =>
      closingDashesStart >= zone.start && closingDashesStart < zone.end
    );
    if (!isInCodeFence) {
      // fmMatch[0] includes the entire match including the closing ---
      zones.push({ start: 0, end: fmMatch[0].length });
    }
  }

  // Headers (# ## ### etc) - protect entire line to avoid linking in headers
  const headerRegex = /^#{1,6}\s+[^\n]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = headerRegex.exec(content)) !== null) {
    zones.push({ start: match.index, end: match.index + match[0].length });
  }

  // Code fences (both ``` and ~~~)
  const fenceRegex = /(```|~~~)[\s\S]*?\1/g;
  const fenceZones: { start: number; end: number }[] = [];
  while ((match = fenceRegex.exec(content)) !== null) {
    fenceZones.push({ start: match.index, end: match.index + match[0].length });
  }
  zones.push(...fenceZones);

  // Inline code (Issue #8 fix: protect when inserting inline links to prevent matching inside backticks)
  // Issue #1 fix: Don't allow inline code zones to overlap with code fence zones
  // Issue #9 fix: Clarify default behavior - by default, inline code is NOT protected (allows crossreferencing)
  // Only protect inline code when includeInlineCode option is explicitly enabled
  if (options?.includeInlineCode === true) {
    // Regex to match inline code with proper backslash escaping handling
    // Count preceding backslashes manually to determine if backtick is escaped
    // A backtick preceded by odd number of backslashes is escaped
    const inlineCodeRegex = /`[^`]*`/g;
    let inlineMatch: RegExpExecArray | null;
    while ((inlineMatch = inlineCodeRegex.exec(content)) !== null) {
      const backtickStart = inlineMatch.index;
      const backtickEnd = inlineMatch.index + inlineMatch[0].length;

      // Check if opening backtick is escaped
      let openingBackslashCount = 0;
      let i = backtickStart - 1;
      while (i >= 0 && content[i] === '\\') {
        openingBackslashCount++;
        i--;
      }
      // If odd number of backslashes, the opening backtick is escaped - skip this match
      if (openingBackslashCount % 2 === 1) {
        continue;
      }

      // Check if closing backtick is escaped
      let closingBackslashCount = 0;
      i = backtickEnd - 2;  // Position just before closing backtick
      while (i >= 0 && content[i] === '\\') {
        closingBackslashCount++;
        i--;
      }
      // If odd number of backslashes, the closing backtick is escaped - skip this match
      if (closingBackslashCount % 2 === 1) {
        continue;
      }

      const start = backtickStart;
      const end = backtickEnd;
      // Skip if this inline code is inside a code fence
      const isInsideFence = fenceZones.some(f => start >= f.start && end <= f.end);
      if (!isInsideFence) {
        zones.push({ start, end });
      }
    }
  }

  return zones;
}

const COMMON_CODE_WORDS = new Set([
  'for', 'val', 'def', 'let', 'var', 'if', 'else', 'match', 'case',
  'new', 'this', 'return', 'yield', 'await', 'async', 'try', 'catch',
  'import', 'export', 'from', 'as', 'extends', 'implements', 'class',
  'object', 'trait', 'type', 'sealed', 'abstract', 'final', 'private',
  'protected', 'public', 'static', 'require', 'module', 'package',
  'true', 'false', 'null', 'undefined', 'void', 'any', 'never',
]);

export function extractCodeBlockIdentifiers(content: string): string[] {
  const identifiers = new Set<string>();

  // Match code blocks (both ``` and ~~~)
  const fenceRegex = /(```|~~~)[\s\S]*?\1/g;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    const codeBlock = match[0];

    // Extract identifiers: CapitalizedWords, snake_case, camelCase, dotted access
    // Pattern: word characters, dots, underscores - but exclude pure numbers
    const idRegex = /\b(?:[A-Z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*|[a-z_][a-zA-Z0-9_]*)\b/g;
    let idMatch: RegExpExecArray | null;

    while ((idMatch = idRegex.exec(codeBlock)) !== null) {
      const identifier = idMatch[0];
      // Filter: keep only meaningful identifiers
      // - Length > 2 (exclude single/two-letter vars)
      // - Not common code keywords
      // - Not all-lowercase single words (except compound names like acquire_release)
      if (
        identifier.length > 2 &&
        !COMMON_CODE_WORDS.has(identifier) &&
        !/^[a-z]$/.test(identifier)
      ) {
        identifiers.add(identifier);
      }
    }
  }

  return Array.from(identifiers).sort();
}
