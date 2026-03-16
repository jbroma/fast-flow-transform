/* eslint-disable import/no-relative-parent-imports */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastFlowTransformRolldown from 'fast-flow-transform/rolldown';
import { defineConfig } from 'rolldown';

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
const MODULE_TYPES = Object.fromEntries(
  REACT_NATIVE_EXTENSIONS.filter((extension) => extension.endsWith('.js')).map(
    (extension) => [extension, 'jsx']
  )
);

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

export default defineConfig({
  input: resolve(FIXTURE_ROOT, 'index.js'),
  moduleTypes: MODULE_TYPES,
  output: {
    file: OUTFILE,
    format: 'cjs',
    sourcemap: true,
  },
  plugins: [
    fastFlowTransformRolldown({
      dialect: 'flow-detect',
      format: 'compact',
    }),
    pngStubPlugin(),
  ],
  resolve: {
    extensions: REACT_NATIVE_EXTENSIONS,
  },
  transform: {
    define: {
      __DEV__: 'false',
    },
    jsx: 'react',
  },
});
