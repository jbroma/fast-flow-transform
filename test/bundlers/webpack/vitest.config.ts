import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [resolve(import.meta.dirname, 'webpack.e2e.test.ts')],
    restoreMocks: true,
  },
});
