import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const BUNDLE_PATH = fileURLToPath(new URL('dist/bundle.cjs', import.meta.url));
const EXPECTED_OUTPUT = 'Hello, FFT!';

describe('rsbuild example', () => {
  it('builds runnable output without Flow syntax', () => {
    const bundleText = readFileSync(BUNDLE_PATH, 'utf8');
    const runtimeValue = require(BUNDLE_PATH) as { output?: string };

    expect(bundleText).not.toContain('// @flow');
    expect(bundleText).not.toContain('import type');
    expect(runtimeValue.output).toBe(EXPECTED_OUTPUT);
  });
});
