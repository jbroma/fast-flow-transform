import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastFlowTransformVite from 'fast-flow-transform/vite';
import { defineConfig, transformWithEsbuild } from 'vite';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(PACKAGE_ROOT, '../../fixtures/project');
const OUTDIR = resolve(PACKAGE_ROOT, 'dist');
const JSX_FILTER = /\.[cm]?jsx?$/;
const REACT_NATIVE_EXTENSIONS = [
  '.ios.js',
  '.android.js',
  '.native.js',
  '.js',
  '.json',
];

function reactNativeJsxPlugin() {
  return {
    enforce: 'pre',
    name: 'react-native-jsx',
    async transform(code, id) {
      if (!JSX_FILTER.test(id)) {
        return null;
      }

      return await transformWithEsbuild(code, id, {
        jsx: 'transform',
        loader: 'jsx',
        sourcemap: true,
      });
    },
  };
}

export default defineConfig({
  appType: 'custom',
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      entry: resolve(FIXTURE_ROOT, 'index.js'),
      fileName: () => 'bundle.cjs',
      formats: ['cjs'],
    },
    minify: false,
    outDir: OUTDIR,
    sourcemap: true,
  },
  define: {
    __DEV__: 'false',
  },
  plugins: [
    fastFlowTransformVite({
      dialect: 'flow-detect',
      format: 'compact',
    }),
    reactNativeJsxPlugin(),
  ],
  resolve: {
    extensions: REACT_NATIVE_EXTENSIONS,
  },
  root: FIXTURE_ROOT,
});
