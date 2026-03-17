import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import rspack from '@rspack/core';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(PACKAGE_ROOT, '../../fixtures/project');
const require = createRequire(import.meta.url);

export default {
  context: FIXTURE_ROOT,
  entry: './index.js',
  mode: 'none',
  module: {
    rules: [
      {
        test: /\.js$/,
        type: 'javascript/auto',
        use: [
          {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: {
                  syntax: 'ecmascript',
                  jsx: true,
                },
                transform: {
                  react: {
                    runtime: 'classic',
                  },
                },
              },
            },
          },
          {
            loader: require.resolve('fast-flow-transform/rspack'),
            options: {
              dialect: 'flow-detect',
              format: 'compact',
              sourcemap: true,
            },
          },
        ],
      },
      {
        test: /\.png$/,
        type: 'asset/resource',
      },
    ],
  },
  output: {
    clean: true,
    filename: 'bundle.cjs',
    library: { type: 'commonjs2' },
    path: resolve(PACKAGE_ROOT, 'dist'),
  },
  plugins: [new rspack.DefinePlugin({ __DEV__: 'false' })],
  resolve: { extensions: ['.ios.js', '.android.js', '.native.js', '.js'] },
  target: 'node',
};
