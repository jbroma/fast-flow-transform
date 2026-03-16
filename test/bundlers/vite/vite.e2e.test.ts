import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = resolve(PACKAGE_ROOT, 'dist/bundle.cjs');

describe('vite react-native fixture e2e', () => {
  it('compiles substantial flow-typed dependencies from barrel imports for build output', () => {
    const bundleText = readFileSync(BUNDLE_PATH, 'utf8');

    expect(bundleText).not.toContain('import type');
    expect(bundleText).toContain('react-native');
    expect(bundleText).toContain('packageSummaries');
  });

  it('lowers flow enums inside the main fixture bundle', () => {
    const bundleText = readFileSync(BUNDLE_PATH, 'utf8');

    expect(bundleText).not.toContain('enum ');
    expect(bundleText).toContain('enumSummary');
    expect(bundleText).toContain('Mirrored');
  });
});
