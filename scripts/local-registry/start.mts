import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_REGISTRY_URL = 'http://127.0.0.1:4873';
const require = createRequire(import.meta.url);

function workspaceRootDir(): string {
  return resolve(fileURLToPath(new URL('../..', import.meta.url)));
}

function registryUrlFromEnv(): string {
  return process.env.FFT_LOCAL_REGISTRY_URL ?? DEFAULT_REGISTRY_URL;
}

function configPath(root: string): string {
  return join(root, 'config', 'verdaccio.yaml');
}

function localRegistryDirectory(root: string): string {
  return join(root, '.local', 'verdaccio');
}

function registryListenAddress(registryUrl: string): string {
  const url = new URL(registryUrl);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');

  return `${url.hostname}:${port}`;
}

function verdaccioBinPath(): string {
  const packageJsonPath = require.resolve('verdaccio/package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    bin?: Record<string, string> | string;
  };
  const bin =
    typeof packageJson.bin === 'string'
      ? packageJson.bin
      : packageJson.bin?.verdaccio;

  if (!bin) {
    throw new Error('Unable to resolve Verdaccio CLI binary.');
  }

  return resolve(dirname(packageJsonPath), bin);
}

function main(): void {
  const root = workspaceRootDir();
  const registryUrl = registryUrlFromEnv();
  const verdaccioConfigPath = configPath(root);

  if (!existsSync(verdaccioConfigPath)) {
    throw new Error(`Missing Verdaccio config: ${verdaccioConfigPath}`);
  }

  mkdirSync(localRegistryDirectory(root), { recursive: true });

  const verdaccio = spawn(
    process.execPath,
    [
      verdaccioBinPath(),
      '--config',
      verdaccioConfigPath,
      '--listen',
      registryListenAddress(registryUrl),
    ],
    {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    }
  );

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      verdaccio.kill(signal);
    });
  }

  verdaccio.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main();
