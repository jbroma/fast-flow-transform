import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

// resolve() returns backslash paths on Windows; tinyglobby (used by vitest's
// include matcher) only matches forward-slash patterns, so without normalizing
// the test file is silently never discovered on Windows ("No test files found").
const include = resolve(import.meta.dirname, 'esbuild.e2e.test.ts').replaceAll(
  '\\',
  '/'
);

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [include],
    restoreMocks: true,
  },
});
