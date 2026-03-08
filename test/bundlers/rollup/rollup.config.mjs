/* eslint-disable import/no-relative-parent-imports */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import fastFlowTransformRollup from 'fast-flow-transform/rollup';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(PACKAGE_ROOT, '../../fixtures/project');
const OUTFILE = resolve(PACKAGE_ROOT, 'dist/bundle.cjs');
const REACT_NATIVE_EXTENSIONS = [
  '.ios.js',
  '.android.js',
  '.native.js',
  '.js',
  '.json',
];

function pngStubPlugin() {
  return {
    load(id) {
      if (!id.endsWith('.png')) {
        return null;
      }

      return 'export default "";';
    },
    name: 'png-stub',
  };
}

export default {
  input: resolve(FIXTURE_ROOT, 'index.js'),
  output: {
    file: OUTFILE,
    format: 'cjs',
    intro: 'const __DEV__ = false;',
    sourcemap: true,
  },
  plugins: [
    nodeResolve({
      extensions: REACT_NATIVE_EXTENSIONS,
      rootDir: FIXTURE_ROOT,
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
    pngStubPlugin(),
    commonjs({
      transformMixedEsModules: true,
    }),
  ],
};
