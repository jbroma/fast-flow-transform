import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import fastFlowTransformEsbuild from 'fast-flow-transform/esbuild';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(PACKAGE_ROOT, '../../fixtures/project');
const OUTFILE = resolve(PACKAGE_ROOT, 'dist/bundle.cjs');

await mkdir(dirname(OUTFILE), { recursive: true });

await build({
  bundle: true,
  define: {
    __DEV__: 'false',
  },
  entryPoints: [resolve(FIXTURE_ROOT, 'index.js')],
  format: 'cjs',
  loader: {
    '.js': 'jsx',
    '.png': 'file',
  },
  outfile: OUTFILE,
  platform: 'node',
  plugins: [
    fastFlowTransformEsbuild({
      dialect: 'flow-detect',
      format: 'compact',
      reactRuntimeTarget: '18',
    }),
  ],
  resolveExtensions: ['.ios.js', '.android.js', '.native.js', '.js', '.json'],
  sourcemap: true,
  target: 'node18',
});
