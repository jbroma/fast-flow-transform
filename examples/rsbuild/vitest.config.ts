import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Keep this relative because Vitest glob matching does not accept absolute Windows paths.
    include: ['rsbuild.e2e.test.ts'],
    restoreMocks: true,
  },
});
