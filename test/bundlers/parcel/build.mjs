import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Parcel } from '@parcel/core';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ENTRY = resolve(PACKAGE_ROOT, '../../fixtures/project/index.js');
const bundler = new Parcel({
  config: resolve(PACKAGE_ROOT, '.parcelrc'),
  defaultTargetOptions: {
    distDir: resolve(PACKAGE_ROOT, 'dist'),
    isLibrary: true,
    outputFormat: 'commonjs',
    shouldOptimize: false,
    sourceMaps: true,
  },
  entries: FIXTURE_ENTRY,
  mode: 'production',
  shouldDisableCache: true,
  shouldPatchConsole: false,
  targets: {
    main: {
      context: 'node',
      distEntry: 'bundle.cjs',
      distDir: resolve(PACKAGE_ROOT, 'dist'),
      includeNodeModules: true,
      isLibrary: true,
      optimize: false,
      outputFormat: 'commonjs',
      sourceMap: true,
    },
  },
});

const result = await bundler.run();

if (result.type === 'buildFailure') {
  throw new Error('Parcel build failed.');
}
