import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import pluginFastFlowTransformRsbuild from 'fast-flow-transform/rsbuild';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    pluginReact({
      swcReactOptions: {
        runtime: 'classic',
      },
    }),
    pluginFastFlowTransformRsbuild({
      dialect: 'flow-detect',
      format: 'compact',
      reactRuntimeTarget: '18',
      sourcemap: true,
    }),
  ],
  source: {
    entry: {
      index: {
        import: resolve(PACKAGE_ROOT, 'src/index.js'),
        html: false,
      },
    },
  },
  output: {
    module: false,
    target: 'node',
  },
  tools: {
    rspack: {
      output: {
        clean: true,
        filename: 'bundle.cjs',
        library: { type: 'commonjs2' },
      },
    },
  },
});
