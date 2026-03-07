import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
        use: [
          {
            loader: require.resolve('fast-flow-transform/rspack'),
            options: {
              dialect: 'flow-detect',
              format: 'compact',
              reactRuntimeTarget: '18',
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
  resolve: { extensions: ['.js'] },
  target: 'node',
};
