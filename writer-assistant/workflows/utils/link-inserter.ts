import { computeSafeZones } from '../../lib/markdown-parser.js';

type SafeZone = { start: number; end: number };

interface MatchResult {
  found: boolean;
  position: number;
  actualText: string;
  strategy: 'exact' | 'no-articles' | 'keywords-only' | 'inline-code' | 'inline-code-keyword';
}

function isInSafeZone(offset: number, zones: SafeZone[]): boolean {
  return zones.some(z => offset >= z.start && offset < z.end);
}

// Check if a text span overlaps with any safe zone
function doesSpanOverlapSafeZone(start: number, end: number, zones: SafeZone[]): boolean {
  return zones.some(z => start < z.end && end > z.start);
}

function isWordBoundary(char: string | undefined): boolean {
  if (!char) return true;
  return /\s|[.,;:!?\-()[\]{}`]/.test(char);
}

function hasWordBoundaries(
  content: string,
  start: number,
  end: number
): boolean {
  const before = content[start - 1];
  const after = content[end];
  return isWordBoundary(before) && isWordBoundary(after);
}

// Issue #1 fix: Skip safe zones when finding anchor text
// Issue #2 fix: Check word boundaries before returning match
function findAnchorInStrategy(
  content: string,
  searchTerm: string,
  safeZones: SafeZone[],
  startIdx: number = 0
): number {
  const lower = content.toLowerCase();
  let idx = lower.indexOf(searchTerm.toLowerCase(), startIdx);

  // Keep searching until we find one outside safe zones AND with proper word boundaries
  while (idx !== -1) {
    const end = idx + searchTerm.length;
    // Check if the entire match span overlaps with any safe zone, not just the start
    if (!doesSpanOverlapSafeZone(idx, end, safeZones) && hasWordBoundaries(content, idx, end)) {
      return idx;
    }
    // Continue searching after this match
    idx = lower.indexOf(searchTerm.toLowerCase(), idx + 1);
  }

  return -1;
}

// Export for use in validation (Issue #7 fix: validate anchors before insertion)
export function findAnchorWithFallback(
  content: string,
  anchorText: string,
  startIdx: number = 0,
  safeZones: SafeZone[] = []
): MatchResult | null {
  const lower = content.toLowerCase();
  const searchTerm = anchorText.toLowerCase();

  // Strategy 1: Exact match
  // Note: findAnchorInStrategy now includes word boundary check
  let idx = findAnchorInStrategy(content, searchTerm, safeZones, startIdx);
  if (idx !== -1) {
    return { found: true, position: idx, actualText: anchorText, strategy: 'exact' };
  }

  // Strategy 2: Try without articles (a, the, an)
  const withoutArticles = anchorText.replace(/\b(a|the|an)\s+/gi, '').trim();
  if (withoutArticles !== anchorText && withoutArticles.length > 0) {
    idx = findAnchorInStrategy(content, withoutArticles, safeZones, startIdx);
    if (idx !== -1) {
      return { found: true, position: idx, actualText: withoutArticles, strategy: 'no-articles' };
    }
  }

  // Strategy 3: Try keywords only (extract main terms)
  const keywords = anchorText.split(/\s+/).filter(w => w.length > 2);
  // Try the last significant word first (usually the main concept), then first
  const termsToTry = keywords.length > 1
    ? [keywords[keywords.length - 1], keywords[0]]
    : keywords;

  for (const mainKeyword of termsToTry) {
    idx = findAnchorInStrategy(content, mainKeyword, safeZones, startIdx);
    if (idx !== -1) {
      return { found: true, position: idx, actualText: mainKeyword, strategy: 'keywords-only' };
    }
  }

  // Strategy 4: Try inline code variant (wrap in backticks)
  // If term is not found plain, try matching it in inline code: `term`
  // Skip this strategy if anchorText already contains backticks (would create invalid ``` syntax)
  if (!anchorText.includes('`')) {
    const inlineCodeVariant = `\`${anchorText}\``;
    idx = findAnchorInStrategy(content, inlineCodeVariant, safeZones, startIdx);
    // Note: backticks themselves count as word boundaries (Issue #7 fix)
    if (idx !== -1) {
      return { found: true, position: idx, actualText: inlineCodeVariant, strategy: 'inline-code' };
    }
  }

  // Strategy 5: Try inline code variant with keywords
  for (const mainKeyword of termsToTry) {
    const inlineKeyword = `\`${mainKeyword}\``;
    idx = findAnchorInStrategy(content, inlineKeyword, safeZones, startIdx);
    if (idx !== -1) {
      return { found: true, position: idx, actualText: inlineKeyword, strategy: 'inline-code-keyword' };
    }
  }

  return null;
}

export function insertInlineLink(
  content: string,
  anchorText: string,
  targetRelativePath: string,
  safeZones: SafeZone[]
): { result: string; inserted: boolean; reason?: string; strategy?: string } {
  // Don't insert if already linked to this target
  if (content.includes(`](${targetRelativePath})`)) {
    return { result: content, inserted: false, reason: 'already_linked' };
  }

  // Use fuzzy matching to find anchor text, respecting safe zones (Issue #1 fix)
  const match = findAnchorWithFallback(content, anchorText, 0, safeZones);

  if (!match) {
    return { result: content, inserted: false, reason: 'no_safe_match' };
  }

  const found = match.position;
  const end = found + match.actualText.length;

  // Safe zone check is now performed in findAnchorWithFallback (Issue #1 fix)
  // But keep this check as a safety redundancy
  if (isInSafeZone(found, safeZones)) {
    return { result: content, inserted: false, reason: 'in_safe_zone' };
  }

  // Determine if the matched text is inline code or needs inline code formatting
  // Issue #2 fix: Only check actualText for backticks if the strategy is NOT inline-code
  // The inline-code strategy explicitly includes backticks, so don't re-wrap them
  // Issue #9 fix: Check both actualText and strategy to ensure we account for transformations
  const alreadyInBackticks = (match.strategy === 'inline-code' || match.strategy === 'inline-code-keyword');
  // Issue #6 fix: Check surroundedByBackticks more carefully and account for escaped backticks
  // An escaped backtick is preceded by an odd number of backslashes
  function isCharacterEscaped(content: string, pos: number): boolean {
    // Count preceding backslashes - if odd number, the character at pos is escaped
    let backslashCount = 0;
    let i = pos - 1;
    while (i >= 0 && content[i] === '\\') {
      backslashCount++;
      i--;
    }
    // Odd number of backslashes = character is escaped
    return backslashCount % 2 === 1;
  }
  // This handles the edge case where the keyword strategy finds text surrounded by backticks
  // Don't treat it as surrounded by backticks if those backticks are escaped
  const surroundedByBackticks = !alreadyInBackticks &&
    found > 0 &&
    content[found - 1] === '`' &&
    !isCharacterEscaped(content, found - 1) &&  // Check if the opening backtick itself is escaped
    content[end] === '`' &&
    !isCharacterEscaped(content, end) &&  // Check if the closing backtick itself is escaped
    !match.actualText.includes('`');  // Ensure the text itself doesn't contain backticks

  let linkMd: string;
  let actualStart: number;
  let actualEnd: number;

  if (alreadyInBackticks) {
    // actualText already includes backticks from inline-code strategy
    linkMd = `[${match.actualText}](${targetRelativePath})`;
    actualStart = found;
    actualEnd = end;
  } else if (surroundedByBackticks) {
    // Text is surrounded by backticks but not captured in actualText
    linkMd = `[\`${match.actualText}\`](${targetRelativePath})`;
    actualStart = found - 1;
    actualEnd = end + 1;
  } else {
    // Plain text, no backticks
    linkMd = `[${match.actualText}](${targetRelativePath})`;
    actualStart = found;
    actualEnd = end;
  }

  const before = content.slice(0, actualStart);
  const after = content.slice(actualEnd);
  return { result: before + linkMd + after, inserted: true, strategy: match.strategy };
}

export function insertSeeAlsoEntry(
  content: string,
  anchorText: string,
  targetRelativePath: string,
  description: string,
  safeZones: SafeZone[] = []
): { result: string; inserted: boolean; reason?: string } {
  // Issue #1 fix: Handle newlines in description by replacing them with spaces
  // This prevents invalid markdown from being generated
  const cleanDescription = description.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  const bullet = `- [${anchorText}](${targetRelativePath}) — ${cleanDescription}`;

  // Issue #7 fix: Normalize newlines before checking for duplicates
  // This prevents duplicates if description contains escaped or literal newlines
  const normalizedContent = content.replace(/\r\n/g, '\n');
  const normalizedBullet = bullet.replace(/\r\n/g, '\n');

  // Don't add duplicate (Issue #8 fix: check for exact bullet match to prevent duplicates)
  if (normalizedContent.includes(normalizedBullet)) {
    return { result: content, inserted: false, reason: 'already_linked' };
  }

  // Check for same target link in See Also section (not just anywhere in the document)
  // This prevents duplicates with different descriptions
  // Issue #2 fix: Use flexible heading level (#+ instead of hardcoded ##)
  // Issue #3 fix: Use normalizedContent for all regex operations to avoid CRLF handling issues
  const seeAlsoCheckMatch = normalizedContent.match(/^(#+)\s+See Also\s*\n([\s\S]*?)(?=^\1 |^#{1,\1.length-1} |$)/m);
  if (seeAlsoCheckMatch) {
    const seeAlsoContent = seeAlsoCheckMatch[2];
    if (seeAlsoContent.includes(`](${targetRelativePath})`)) {
      return { result: content, inserted: false, reason: 'already_linked' };
    }
  }

  // Issue #7 fix: Handle trailing whitespace in See Also heading
  // Pattern: # / ## / ### (etc) See Also followed by optional whitespace, then newline
  // Issue #3 fix: Use normalizedContent for regex operations
  const seeAlsoMatch = normalizedContent.match(/^(#+)\s+See Also\s*\n/m);
  if (seeAlsoMatch && seeAlsoMatch.index !== undefined) {
    // Check if section heading is inside a code fence (not just any safe zone, since headers are safe zones)
    // Code fences need special handling, but headers themselves are okay
    const seeAlsoIndex = seeAlsoMatch.index;
    const seeAlsoEnd = seeAlsoIndex + seeAlsoMatch[0].length;
    const fenceRegex = /(```|~~~)[\s\S]*?\1/g;
    let fenceMatch: RegExpExecArray | null;
    const fences: { start: number; end: number }[] = [];
    // Issue #3 fix: Use normalizedContent for fence matching
    while ((fenceMatch = fenceRegex.exec(normalizedContent)) !== null) {
      fences.push({ start: fenceMatch.index, end: fenceMatch.index + fenceMatch[0].length });
    }
    // Check if the entire header span overlaps with any code fence, not just the start
    const isInsideCodeFence = fences.some(f => seeAlsoIndex < f.end && seeAlsoEnd > f.start);
    if (isInsideCodeFence) {
      return { result: content, inserted: false, reason: 'section_in_safe_zone' };
    }
    const sectionStart = seeAlsoIndex + seeAlsoMatch[0].length;
    // Find end of section (next heading at same or higher level, or end of content)
    const headingLevel = seeAlsoMatch[1].length;
    const nextHeadingRegex = new RegExp(`^#{1,${headingLevel}} `, 'm');
    // Issue #3 fix: Use normalizedContent for section matching
    const nextHeadingMatch = nextHeadingRegex.exec(normalizedContent.slice(sectionStart));
    const nextHeading = nextHeadingMatch ? sectionStart + nextHeadingMatch.index : -1;
    const sectionEnd = nextHeading === -1 ? normalizedContent.length : nextHeading;

    // Extract section content (everything from after heading to before next heading)
    // Issue #3 fix: Use normalizedContent for section slicing
    const sectionContent = normalizedContent.slice(sectionStart, sectionEnd);

    // Append new bullet to section, preserving existing content
    const sectionWithNewBullet = sectionContent.trimEnd() + '\n' + bullet + '\n';

    // Reconstruct content
    let result: string;
    if (nextHeading === -1) {
      // No next heading - section ends at content end
      result = normalizedContent.slice(0, sectionStart) + sectionWithNewBullet;
    } else {
      // Next heading exists - insert section with new bullet, ensuring blank line before next heading
      // Issue #2 fix: Add blank line between section and next heading for proper markdown
      result = normalizedContent.slice(0, sectionStart) + sectionWithNewBullet + '\n' + normalizedContent.slice(sectionEnd);
    }
    return { result, inserted: true };
  }

  // Create new section at end
  const trimmed = normalizedContent.trimEnd();
  const result = trimmed + '\n\n## See Also\n\n' + bullet + '\n';
  return { result, inserted: true };
}
