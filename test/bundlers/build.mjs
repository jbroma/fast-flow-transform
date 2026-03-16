import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const NODE_BIN = process.execPath;
const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const BUILD_STEPS = [
  [NODE_BIN, ['esbuild/build.mjs']],
  [NODE_BIN, ['parcel/build.mjs']],
  [PNPM_BIN, ['exec', 'rolldown', '-c', 'rolldown/rolldown.config.mjs']],
  [PNPM_BIN, ['exec', 'rollup', '-c', 'rollup/rollup.config.mjs']],
  [
    PNPM_BIN,
    ['exec', 'rsbuild', 'build', '--config', 'rsbuild/rsbuild.config.mjs'],
  ],
  [
    PNPM_BIN,
    ['exec', 'rspack', 'build', '--config', 'rspack/rspack.config.mjs'],
  ],
  [PNPM_BIN, ['exec', 'vite', 'build', '--config', 'vite/vite.config.mjs']],
  [PNPM_BIN, ['exec', 'webpack', '--config', 'webpack/webpack.config.mjs']],
];

for (const [command, args] of BUILD_STEPS) {
  await run(command, args);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: PACKAGE_ROOT,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`${command} ${args.join(' ')} exited with code ${code}`)
      );
    });
  });
}
