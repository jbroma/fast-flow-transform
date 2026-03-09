import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_REGISTRY_URL = 'http://127.0.0.1:4873';

function workspaceRootDir(): string {
  return resolve(fileURLToPath(new URL('../..', import.meta.url)));
}

function registryUrlFromEnv(): string {
  return process.env.FFT_LOCAL_REGISTRY_URL ?? DEFAULT_REGISTRY_URL;
}

function localRegistryUserConfigPath(root: string): string {
  return join(root, '.local', 'verdaccio', 'npmrc');
}

async function checkRegistryHealth(registryUrl: string): Promise<void> {
  const response = await fetch(new URL('/-/ping', registryUrl), {
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Registry health check failed with status ${String(response.status)}.`
    );
  }
}

function runAdduser(
  registryUrl: string,
  root: string,
  userConfigPath: string
): void {
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
}

async function main(): Promise<void> {
  const root = workspaceRootDir();
  const registryUrl = registryUrlFromEnv();
  const userConfigPath = localRegistryUserConfigPath(root);

  mkdirSync(join(root, '.local', 'verdaccio'), { recursive: true });
  await checkRegistryHealth(registryUrl);
  runAdduser(registryUrl, root, userConfigPath);

  process.stdout.write('\nVerdaccio publish login saved to:\n');
  process.stdout.write(`${userConfigPath}\n`);
}

await main();
