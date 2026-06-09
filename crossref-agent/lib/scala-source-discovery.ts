import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Convert a type name to kebab-case
 * Examples: Chunk -> chunk, TypeId -> type-id, ZRef -> z-ref
 */
export function toKebabCase(name: string): string {
  return name
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

/**
 * Normalize data type or topic path input
 * Accepts: full path, relative path, filename, or type name
 * Examples:
 *   core/shared/src/main/scala/zio/Chunk.scala -> { filePath: "...", typeName: "Chunk" }
 *   Chunk.scala -> { fileName: "Chunk.scala", typeName: "Chunk" }
 *   Chunk -> { typeName: "Chunk" }
 */
export function normalizeDataTypePath(dataTypePath: string | undefined): {
  filePath?: string;
  fileName?: string;
  typeName?: string;
} {
  if (!dataTypePath) {
    return {};
  }

  // If it looks like a type name (no dots, no slashes, starts with capital)
  if (!dataTypePath.includes('.') && !dataTypePath.includes('/') && /^[A-Z]/.test(dataTypePath)) {
    return { typeName: dataTypePath };
  }

  // If it's a file path or filename
  if (dataTypePath.includes('.scala') || dataTypePath.endsWith('.scala')) {
    const fileName = path.basename(dataTypePath);
    const typeName = fileName.replace('.scala', '');
    return { filePath: dataTypePath, fileName, typeName };
  }

  // If it contains slashes, treat as file path
  if (dataTypePath.includes('/')) {
    const fileName = path.basename(dataTypePath);
    const typeName = fileName.replace('.scala', '').replace(/\.[^/.]+$/, '');
    return { filePath: dataTypePath, fileName, typeName };
  }

  // Default: treat as type name
  return { typeName: dataTypePath };
}

/**
 * Validate that paths are accessible and resolve relative output path
 */
export function validatePathsAndResolve(projectRoot: string, outputPath: string): string {
  if (!fs.existsSync(projectRoot)) {
    throw new Error(`Project root does not exist: ${projectRoot}`);
  }
  if (!fs.statSync(projectRoot).isDirectory()) {
    throw new Error(`projectRoot is not a directory: ${projectRoot}`);
  }

  // Resolve output path relative to project root
  const resolvedOutputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(projectRoot, outputPath);

  // Ensure output directory exists
  const outputDir = path.dirname(resolvedOutputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return resolvedOutputPath;
}

/**
 * Infer possible source directories from the project root
 * Supports common Scala project layouts:
 * - Standard SBT: src/main/scala
 * - Multi-platform: shared/src, jvm/src, js/src, native/src
 * - Multi-module: modules/src, packages/src, subprojects/src
 * - Custom nested: any top-level dir with src structure
 *
 * Patterns are tried in priority order until sources are found.
 */
export function inferSourceDirs(projectRoot: string): string[] {
  const sourceDirs: string[] = [];

  // Patterns to search, in priority order
  // Tries to match common Scala project structures across different build tools and layouts
  const patterns = [
    // Standard SBT layout: src/main/scala
    'src/main/scala',
    // Multi-platform Scala projects (shared + platform-specific variants)
    // Examples: shared/src, jvm/src, js/src, native/src
    '*/shared/src/main/scala',
    '*/shared/src',
    '*/jvm/src/main/scala',
    '*/jvm/src',
    '*/js/src/main/scala',
    '*/js/src',
    '*/native/src/main/scala',
    '*/native/src',
    // Single source directories at various nesting levels
    '*/src/main/scala',
    '*/src',
    // Monorepo patterns: multiple modules under a parent directory
    'modules/*/src/main/scala',
    'modules/*/src',
    'packages/*/src/main/scala',
    'packages/*/src',
    'subprojects/*/src/main/scala',
    'subprojects/*/src',
  ];

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      // Handle glob patterns
      const baseDir = path.dirname(pattern);
      const glob = path.basename(pattern);
      const fullBaseDir = path.join(projectRoot, baseDir);

      if (fs.existsSync(fullBaseDir)) {
        try {
          const entries = fs.readdirSync(fullBaseDir);
          for (const entry of entries) {
            const fullPath = path.join(fullBaseDir, entry);
            if (fs.statSync(fullPath).isDirectory()) {
              const globRegex = new RegExp('^' + glob.replace(/\*/g, '.*') + '$');
              if (globRegex.test(entry)) {
                const srcPath = path.join(fullPath, 'src');
                if (fs.existsSync(srcPath)) {
                  sourceDirs.push(fs.realpathSync(srcPath));
                }
              }
            }
          }
        } catch (e) {
          // Ignore read errors
        }
      }
    } else {
      // Direct path
      const fullPattern = path.join(projectRoot, pattern);
      if (fs.existsSync(fullPattern)) {
        try {
          sourceDirs.push(fs.realpathSync(fullPattern));
        } catch (e) {
          // Ignore
        }
      }
    }
  }

  // Remove duplicates while preserving order
  const unique = Array.from(new Set(sourceDirs));

  // Fallback: include project root if nothing found
  if (unique.length === 0) {
    unique.push(projectRoot);
  }

  return unique;
}
