import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import fastFlowTransformEsbuild from 'fast-flow-transform/esbuild';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const OUTFILE = resolve(PACKAGE_ROOT, 'dist/bundle.cjs');

await mkdir(dirname(OUTFILE), { recursive: true });

await build({
  bundle: true,
  entryPoints: [resolve(PACKAGE_ROOT, 'src/index.js')],
  format: 'cjs',
  loader: {
    '.js': 'jsx',
  },
  outfile: OUTFILE,
  platform: 'node',
  plugins: [
    fastFlowTransformEsbuild({
      dialect: 'flow-detect',
      format: 'compact',
    }),
  ],
  sourcemap: true,
  target: 'node18',
});
