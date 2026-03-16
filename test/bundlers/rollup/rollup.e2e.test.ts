import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BUNDLE_PATH = fileURLToPath(new URL('dist/bundle.cjs', import.meta.url));

describe('rollup react-native fixture e2e', () => {
  it('compiles substantial flow-typed dependencies from barrel imports', () => {
    const bundleText = readFileSync(BUNDLE_PATH, 'utf8');

    expect(bundleText).not.toContain('import type');
    expect(bundleText).toContain('react-native');
    expect(bundleText).toContain('packageSummaries');
  });
});
