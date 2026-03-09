import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_REGISTRY_URL = 'http://127.0.0.1:4873';

const require = createRequire(import.meta.url);

export function workspaceRootDir(): string {
  return pathResolve(fileURLToPath(new URL('../..', import.meta.url)));
}

export function registryUrlFromEnv(): string {
  return process.env.FFT_LOCAL_REGISTRY_URL ?? DEFAULT_REGISTRY_URL;
}

export function localRegistryUserConfigPath(root: string): string {
  return join(root, '.local', 'verdaccio', 'npmrc');
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

  return pathResolve(dirname(packageJsonPath), bin);
}

export async function checkRegistryHealth(registryUrl: string): Promise<void> {
  const response = await fetch(new URL('/-/ping', registryUrl), {
    headers: {
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(1000),
  });

  if (!response.ok) {
    throw new Error(
      `Registry health check failed with status ${String(response.status)}.`
    );
  }
}

async function isRegistryHealthy(registryUrl: string): Promise<boolean> {
  try {
    await checkRegistryHealth(registryUrl);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function startVerdaccio(root: string, registryUrl: string): void {
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
      detached: true,
      env: process.env,
      stdio: 'ignore',
    }
  );

  verdaccio.unref();
}

export async function ensureRegistryReady(
  root: string,
  registryUrl: string
): Promise<void> {
  if (await isRegistryHealthy(registryUrl)) {
    return;
  }

  process.stdout.write(`Starting Verdaccio at ${registryUrl}\n`);
  startVerdaccio(root, registryUrl);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isRegistryHealthy(registryUrl)) {
      return;
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for Verdaccio at ${registryUrl}.`);
}

export function ensurePublishUserConfig(
  root: string,
  registryUrl: string
): string {
  const userConfigPath = localRegistryUserConfigPath(root);
  if (existsSync(userConfigPath)) {
    return userConfigPath;
  }

  mkdirSync(localRegistryDirectory(root), { recursive: true });
  process.stdout.write('Running first-time Verdaccio publish setup\n');
  const result = spawnSync(
    'npm',
    [
      'adduser',
      '--registry',
      registryUrl,
      '--auth-type=legacy',
      '--userconfig',
      userConfigPath,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        npm_config_registry: registryUrl,
        npm_config_userconfig: userConfigPath,
      },
      shell: process.platform === 'win32',
      stdio: 'inherit',
    }
  );

  if (result.status !== 0) {
    throw new Error(`npm adduser failed with status ${String(result.status)}`);
  }

  process.stdout.write(
    `\nVerdaccio publish login saved to:\n${userConfigPath}\n`
  );
  return userConfigPath;
}
