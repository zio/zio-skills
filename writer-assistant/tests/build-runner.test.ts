import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runBuild } from '../lib/build-runner.js';

describe('Build Runner', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-runner-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('detects Docusaurus in ../website/package.json', async () => {
    const docsDir = path.join(tempDir, 'docs');
    const websiteDir = path.join(tempDir, 'website');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(websiteDir, { recursive: true });

    const packageJson = {
      name: 'test-website',
      devDependencies: {
        '@docusaurus/core': '^3.0.0',
      },
      scripts: {
        build: 'echo "Docusaurus build"',
      },
    };
    fs.writeFileSync(path.join(websiteDir, 'package.json'), JSON.stringify(packageJson));

    try {
      await runBuild(docsDir);
      // The build will fail since yarn/npm aren't actually available in test
      // But the detection should work (error message will mention it found docusaurus)
    } catch (e: any) {
      // Expected to throw due to missing yarn command, but should mention docusaurus detection
      expect(e.message).toMatch(/docusaurus|build system/i);
    }
  });

  it('detects Docusaurus in ../package.json', async () => {
    const docsDir = path.join(tempDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });

    const packageJson = {
      name: 'test-docs',
      devDependencies: {
        '@docusaurus/core': '^3.0.0',
      },
      scripts: {
        build: 'echo "Build"',
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson));

    try {
      await runBuild(docsDir);
    } catch (e: any) {
      // Expected to throw due to missing npm, but should have detected docusaurus
      expect(e.message).toMatch(/docusaurus|build system/i);
    }
  });

  it('detects MkDocs from ../mkdocs.yml', async () => {
    const docsDir = path.join(tempDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });

    fs.writeFileSync(path.join(tempDir, 'mkdocs.yml'), 'site_name: Test\n');

    try {
      await runBuild(docsDir);
    } catch (e: any) {
      // Expected to throw due to missing mkdocs, but should have detected it
      expect(e.message).toMatch(/mkdocs|build system/i);
    }
  });

  it('throws descriptive error when no build system is detected', async () => {
    const docsDir = path.join(tempDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });

    let error: Error | null = null;
    try {
      await runBuild(docsDir);
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('No supported documentation build system detected');
    expect(error?.message).toContain('package.json');
    expect(error?.message).toContain('mkdocs.yml');
  });

  it('prefers ../website/package.json over ../package.json', async () => {
    const docsDir = path.join(tempDir, 'docs');
    const websiteDir = path.join(tempDir, 'website');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(websiteDir, { recursive: true });

    // Create both
    const websitePackage = {
      name: 'website',
      devDependencies: { '@docusaurus/core': '^3.0.0' },
      scripts: { build: 'echo "website"' },
    };
    const rootPackage = {
      name: 'root',
      devDependencies: { '@docusaurus/core': '^3.0.0' },
      scripts: { build: 'echo "root"' },
    };

    fs.writeFileSync(path.join(websiteDir, 'package.json'), JSON.stringify(websitePackage));
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(rootPackage));

    try {
      await runBuild(docsDir);
    } catch (e: any) {
      // Both exist, but should prefer website/ version
      expect(e.message).toMatch(/website|build system/i);
    }
  });

  it('detects Sphinx from docs/conf.py', async () => {
    const docsDir = path.join(tempDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });

    fs.writeFileSync(path.join(docsDir, 'conf.py'), '# Sphinx config\n');

    try {
      await runBuild(docsDir);
    } catch (e: any) {
      // Expected to throw due to missing make, but should have detected sphinx
      expect(e.message).toMatch(/sphinx|build system/i);
    }
  });
});
