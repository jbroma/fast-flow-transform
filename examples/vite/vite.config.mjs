import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastFlowTransformVite from 'fast-flow-transform/vite';
import { defineConfig, transformWithEsbuild } from 'vite';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(PACKAGE_ROOT, 'src');
const OUTDIR = resolve(PACKAGE_ROOT, 'dist');
const JSX_FILTER = /\.[cm]?jsx?$/;

function jsxAfterFftPlugin() {
  return {
    enforce: 'pre',
    name: 'example-jsx-after-fft',
    async transform(code, id) {
      if (!id.startsWith(SRC_ROOT) || !JSX_FILTER.test(id)) {
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
      entry: resolve(SRC_ROOT, 'index.js'),
      fileName: () => 'bundle.cjs',
      formats: ['cjs'],
    },
    minify: false,
    outDir: OUTDIR,
    sourcemap: true,
  },
  plugins: [
    fastFlowTransformVite({
      dialect: 'flow-detect',
      format: 'compact',
    }),
    jsxAfterFftPlugin(),
  ],
  root: PACKAGE_ROOT,
});
