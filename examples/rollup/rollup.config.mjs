import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import fastFlowTransformRollup from 'fast-flow-transform/rollup';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const OUTFILE = resolve(PACKAGE_ROOT, 'dist/bundle.cjs');

export default {
  input: resolve(PACKAGE_ROOT, 'src/index.js'),
  output: {
    file: OUTFILE,
    format: 'cjs',
    sourcemap: true,
  },
  plugins: [
    nodeResolve({
      extensions: ['.js', '.json'],
    }),
    fastFlowTransformRollup({
      dialect: 'flow-detect',
      format: 'compact',
      reactRuntimeTarget: '18',
    }),
    babel({
      babelHelpers: 'bundled',
      babelrc: false,
      configFile: false,
      extensions: ['.js', '.jsx', '.mjs', '.cjs'],
      include: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
      presets: [['@babel/preset-react', { runtime: 'classic' }]],
      skipPreflightCheck: true,
    }),
    commonjs({
      transformMixedEsModules: true,
    }),
  ],
};
