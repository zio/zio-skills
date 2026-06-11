// Detect whether a page title is generic and context-free.
// Used during reindex to identify pages where LLM-generated contextual titles are needed.

const GENERIC_BARE = new Set([
  'overview', 'introduction', 'index', 'guide', 'getting started',
  'tutorial', 'primer', 'summary', 'motivation', 'examples',
  'operations', 'operators', 'types',
]);

const GENERIC_PHRASES = new Set([
  'core data types', 'type aliases', 'non-functional requirements',
  'programming paradigms in zio',
]);

export function isGenericTitle(title: string): boolean {
  const lower = title.trim().toLowerCase();

  // "Introduction to ZIO Fibers" etc. — already descriptive, keep as-is
  if (lower.startsWith('introduction to')) return false;

  // PascalCase/acronym ZIO type name (Fiber, TRef, ZLayer, STM, MVar) — keep as-is
  if (/^[A-Z][A-Za-z0-9.]+$/.test(title.trim())) return false;

  return GENERIC_BARE.has(lower) || GENERIC_PHRASES.has(lower);
}
