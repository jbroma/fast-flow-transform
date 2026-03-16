import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, rspack } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import pluginFastFlowTransformRsbuild from 'fast-flow-transform/rsbuild';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(PACKAGE_ROOT, '../../fixtures/project');
const UNSTABLE_ACTIVITY_WARNING = /unstable_Activity/;

function isKnownReactNativeWarning(warning) {
  const { details: rawDetails, message: rawMessage, module } = warning;
  let details = '';

  if (typeof rawDetails === 'string') {
    details = rawDetails;
  } else if (rawDetails) {
    details = String(rawDetails);
  }

  const message = typeof rawMessage === 'string' ? rawMessage : '';
  const moduleResource =
    typeof module?.resource === 'string' ? module.resource : '';

  return (
    moduleResource.includes('node_modules/react-native/') &&
    (UNSTABLE_ACTIVITY_WARNING.test(message) ||
      UNSTABLE_ACTIVITY_WARNING.test(details))
  );
}

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
      sourcemap: true,
    }),
  ],
  source: {
    entry: {
      index: {
        import: resolve(FIXTURE_ROOT, 'index.js'),
        html: false,
      },
    },
    include: [FIXTURE_ROOT, { not: /[\\/]core-js[\\/]/ }],
  },
  output: {
    module: false,
    target: 'node',
  },
  resolve: {
    extensions: ['.ios.js', '.android.js', '.native.js', '.js'],
  },
  tools: {
    rspack: {
      ignoreWarnings: [isKnownReactNativeWarning],
      module: {
        parser: {
          javascript: {
            exportsPresence: 'auto',
          },
        },
      },
      output: {
        clean: true,
        filename: 'bundle.cjs',
        library: { type: 'commonjs2' },
      },
      plugins: [new rspack.DefinePlugin({ __DEV__: 'false' })],
    },
  },
});
