import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { describe, it } from '@vitest/runner';
import { createExpect } from 'vitest';

const require = createRequire(import.meta.url);
const expect = createExpect();
const BUNDLE_PATH = fileURLToPath(new URL('dist/bundle.cjs', import.meta.url));
const EXPECTED_PACKAGE = 'react-native';

function expectCompiledOutput(bundleText: string) {
  expect(bundleText).not.toContain('import type');
  expect(bundleText).toContain(EXPECTED_PACKAGE);
}

function expectPackageSummaries(
  runtimeValue: Record<string, unknown> & {
    packageSummaries?: Record<string, { keyCount: number }>;
  }
) {
  expect(runtimeValue.packageSummaries).toBeDefined();
  const packageSummary = runtimeValue.packageSummaries?.[EXPECTED_PACKAGE];
  expect(packageSummary).toBeDefined();
  expect(packageSummary?.keyCount).toBeGreaterThan(0);
}

describe('rspack loader e2e', () => {
  it('compiles substantial flow-typed dependencies from barrel imports', () => {
    const bundleText = readFileSync(BUNDLE_PATH, 'utf8');
    const runtimeValue = require(BUNDLE_PATH);

    expectPackageSummaries(runtimeValue);
    expectCompiledOutput(bundleText);
  });
});
