import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastFlowTransformRolldown from 'fast-flow-transform/rolldown';
import { defineConfig } from 'rolldown';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  input: resolve(PACKAGE_ROOT, 'src/index.js'),
  moduleTypes: {
    '.js': 'jsx',
  },
  output: {
    file: resolve(PACKAGE_ROOT, 'dist/bundle.cjs'),
    format: 'cjs',
    sourcemap: true,
  },
  plugins: [
    fastFlowTransformRolldown({
      dialect: 'flow-detect',
      format: 'compact',
    }),
  ],
  transform: {
    jsx: 'react',
  },
});
