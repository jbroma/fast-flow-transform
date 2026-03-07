import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { describe, it } from '@vitest/runner';
import { createExpect } from 'vitest';

const require = createRequire(import.meta.url);
const expect = createExpect();
const BUNDLE_PATH = fileURLToPath(new URL('dist/bundle.cjs', import.meta.url));

function expectCompiledOutput(bundleText: string) {
  expect(bundleText).toContain('function doubleValue(input)');
  expect(bundleText).toContain('function buildLabel(value)');
  expect(bundleText).not.toContain('import type');
  expect(bundleText).not.toContain(': number');
  expect(bundleText).not.toContain('export type Label');
}

describe('rspack loader e2e', () => {
  it('compiles a flow-typed dependency', () => {
    const bundleText = readFileSync(BUNDLE_PATH, 'utf8');
    const runtimeValue = require(BUNDLE_PATH);

    expect(runtimeValue).toMatchObject({
      doubled: 42,
      label: 'value:baseline',
    });
    expectCompiledOutput(bundleText);
  });
});
