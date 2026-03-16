import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.e2e.test.ts'],
    restoreMocks: true,
  },
});
