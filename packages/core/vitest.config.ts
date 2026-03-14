import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      '__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.ts',
      'test/**/*.test.ts',
    ],
    restoreMocks: true,
  },
});
