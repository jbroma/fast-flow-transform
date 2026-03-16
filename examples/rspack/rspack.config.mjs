import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export default {
  context: PACKAGE_ROOT,
  entry: './src/index.js',
  mode: 'none',
  module: {
    rules: [
      {
        include: resolve(PACKAGE_ROOT, 'src'),
        test: /\.js$/,
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
    ],
  },
  output: {
    clean: true,
    filename: 'bundle.cjs',
    library: { type: 'commonjs2' },
    path: resolve(PACKAGE_ROOT, 'dist'),
  },
  target: 'node',
};
