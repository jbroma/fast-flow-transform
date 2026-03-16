import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const BUNDLE_PATH = fileURLToPath(new URL('dist/bundle.cjs', import.meta.url));

describe('esbuild react-native fixture e2e', () => {
  it('compiles substantial flow-typed dependencies from barrel imports', () => {
    const bundleText = readFileSync(BUNDLE_PATH, 'utf8');
    const runtimeValue = require(BUNDLE_PATH) as {
      packageSummaries?: Record<string, { keyCount: number }>;
    };

    expect(bundleText).not.toContain('import type');
    expect(bundleText).toContain('react-native');
    expect(
      runtimeValue.packageSummaries?.['react-native']?.keyCount
    ).toBeGreaterThan(0);
  });

  it('loads a bundled flow enum runtime dependency from the main fixture bundle', () => {
    const bundleText = readFileSync(BUNDLE_PATH, 'utf8');
    const runtimeValue = require(BUNDLE_PATH) as {
      enumSummary?: Record<string, unknown>;
    };

    expect(bundleText).not.toContain('enum ');
    expect(bundleText).toContain('enumSummary');
    expect(runtimeValue.enumSummary).toStrictEqual({
      castDraft: 'Draft',
      draft: 'Draft',
      labelMembers: ['short', 'long'],
      labelShort: 'short',
      publishedName: 'Published',
      statusMembers: ['Draft', 'Published'],
    });
  });
});
