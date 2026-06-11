export interface BuildError {
  file: string;
  line?: number;
  message: string;
  type: 'broken-link' | 'missing-file' | 'syntax-error' | 'other';
}

/**
 * Extract structured errors from build output
 * Handles Docusaurus, MkDocs, Sphinx, Hugo error formats
 */
export function extractBuildErrors(output: string, buildSystem: string): BuildError[] {
  if (buildSystem === 'docusaurus') {
    return parseDocusaurusErrors(output);
  } else if (buildSystem === 'mkdocs') {
    return parseMkdocsErrors(output);
  } else if (buildSystem === 'sphinx') {
    return parseSphinxErrors(output);
  } else if (buildSystem === 'hugo') {
    return parseHugoErrors(output);
  }

  return parseGenericErrors(output);
}

function parseDocusaurusErrors(output: string): BuildError[] {
  const errors: BuildError[] = [];
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Broken link: [WARNING] ... Unknown link 'path/to/file'
    if (line.includes('Unknown link')) {
      const match = line.match(/Unknown link '([^']+)'/);
      if (match) {
        errors.push({
          file: match[1],
          message: `Broken link: ${match[1]}`,
          type: 'broken-link',
        });
      }
    }

    // Missing file or directory
    if (line.includes('ENOENT') || line.includes('no such file or directory')) {
      const match = line.match(/(?:ENOENT|path): (.+)/);
      if (match) {
        errors.push({
          file: match[1],
          message: `File not found: ${match[1]}`,
          type: 'missing-file',
        });
      }
    }

    // Syntax errors
    if (line.includes('[ERROR]') && (line.includes('Syntax') || line.includes('Error:'))) {
      const fileMatch = line.match(/([^/:]+\.md)/);
      errors.push({
        file: fileMatch?.[1] || 'unknown',
        message: line.trim(),
        type: 'syntax-error',
      });
    }
  }

  return errors;
}

function parseMkdocsErrors(output: string): BuildError[] {
  const errors: BuildError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    if (line.includes('ERROR:')) {
      const match = line.match(/ERROR:\s+(.+)/);
      if (match) {
        errors.push({
          file: 'unknown',
          message: match[1],
          type: 'other',
        });
      }
    }
  }

  return errors;
}

function parseSphinxErrors(output: string): BuildError[] {
  const errors: BuildError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    if (line.includes('WARNING') || line.includes('ERROR')) {
      const match = line.match(/([^/:]+\.rst):(\d+):\s+(.+)/);
      if (match) {
        errors.push({
          file: match[1],
          line: parseInt(match[2], 10),
          message: match[3],
          type: line.includes('ERROR') ? 'syntax-error' : 'other',
        });
      }
    }
  }

  return errors;
}

function parseHugoErrors(output: string): BuildError[] {
  const errors: BuildError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    if (line.includes('ERROR')) {
      const match = line.match(/ERROR\s+(.+?):\s+(.+)/);
      if (match) {
        errors.push({
          file: match[1],
          message: match[2],
          type: 'other',
        });
      }
    }
  }

  return errors;
}

function parseGenericErrors(output: string): BuildError[] {
  const errors: BuildError[] = [];
  const errorPattern = /(?:ERROR|FAILED|error)[\s:](.+)/g;
  let match;

  while ((match = errorPattern.exec(output)) !== null) {
    errors.push({
      file: 'unknown',
      message: match[1],
      type: 'other',
    });
  }

  return errors;
}
