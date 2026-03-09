import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_REGISTRY_URL = 'http://127.0.0.1:4873';
const LOCAL_REGISTRY_USERNAME = 'fft-local-publisher';
const LOCAL_REGISTRY_PASSWORD = 'fft-local-password';
const LOCAL_REGISTRY_EMAIL = 'fft-local@example.test';

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

function localRegistryCommandEnv(
  overrides: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => {
      const lower = key.toLowerCase();
      return (
        !lower.startsWith('npm_config_') && !lower.startsWith('pnpm_config_')
      );
    })
  );

  return {
    ...env,
    ...overrides,
  };
}

function verdaccioSpawnArgs(root: string, registryUrl: string): string[] {
  const verdaccioConfigPath = configPath(root);
  if (!existsSync(verdaccioConfigPath)) {
    throw new Error(`Missing Verdaccio config: ${verdaccioConfigPath}`);
  }

  mkdirSync(localRegistryDirectory(root), { recursive: true });

  return [
    verdaccioBinPath(),
    '--config',
    verdaccioConfigPath,
    '--listen',
    registryListenAddress(registryUrl),
  ];
}

export async function requireRegistryReady(
  root: string,
  registryUrl: string
): Promise<void> {
  try {
    await checkRegistryHealth(registryUrl);
  } catch {
    throw new Error(
      `Verdaccio is not running at ${registryUrl}. Start it in another terminal with: pnpm run local-registry:start`
    );
  }
}

export function runVerdaccioForeground(
  root: string,
  registryUrl: string
): void {
  const verdaccio = spawn(
    process.execPath,
    verdaccioSpawnArgs(root, registryUrl),
    {
      cwd: root,
      env: localRegistryCommandEnv(),
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

function registryAuthPrefix(registryUrl: string): string {
  const url = new URL(registryUrl);
  const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;

  return `//${url.host}${path}`;
}

function localRegistryUserConfigSource(registryUrl: string): string {
  const authPrefix = registryAuthPrefix(registryUrl);
  const password = Buffer.from(LOCAL_REGISTRY_PASSWORD, 'utf8').toString(
    'base64'
  );

  return [
    `registry=${registryUrl}`,
    `${authPrefix}:username=${LOCAL_REGISTRY_USERNAME}`,
    `${authPrefix}:_password=${password}`,
    `${authPrefix}:email=${LOCAL_REGISTRY_EMAIL}`,
    '',
  ].join('\n');
}

async function ensureRegistryUser(registryUrl: string): Promise<void> {
  const response = await fetch(
    new URL(`/-/user/org.couchdb.user:${LOCAL_REGISTRY_USERNAME}`, registryUrl),
    {
      body: JSON.stringify({
        date: new Date().toISOString(),
        email: LOCAL_REGISTRY_EMAIL,
        name: LOCAL_REGISTRY_USERNAME,
        password: LOCAL_REGISTRY_PASSWORD,
        roles: [],
        type: 'user',
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'PUT',
    }
  );

  if (response.status === 201 || response.status === 409) {
    return;
  }

  throw new Error(
    `Verdaccio user bootstrap failed with status ${String(response.status)}.`
  );
}

export async function ensureRegistryCredentials(
  root: string,
  registryUrl: string
): Promise<string> {
  const userConfigPath = localRegistryUserConfigPath(root);
  if (existsSync(userConfigPath)) {
    writeFileSync(userConfigPath, localRegistryUserConfigSource(registryUrl));
    return userConfigPath;
  }

  mkdirSync(localRegistryDirectory(root), { recursive: true });
  process.stdout.write('Bootstrapping local Verdaccio credentials\n');
  await ensureRegistryUser(registryUrl);
  writeFileSync(userConfigPath, localRegistryUserConfigSource(registryUrl));

  return userConfigPath;
}

export function registryPublishEnv(
  registryUrl: string,
  userConfigPath: string
): NodeJS.ProcessEnv {
  return localRegistryCommandEnv({
    npm_config_registry: registryUrl,
    npm_config_userconfig: userConfigPath,
  });
}
