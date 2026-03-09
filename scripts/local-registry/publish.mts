import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_REGISTRY_URL = 'http://127.0.0.1:4873';

interface PackageManifest {
  name: string;
  optionalDependencies?: Record<string, string>;
  version: string;
}

interface PublishContext {
  bindingManifestPath: string;
  bindingPackageName: string;
  bindingPackageRoot: string;
  coreManifestPath: string;
  corePackageRoot: string;
  registryUrl: string;
  userConfigPath: string;
  version: string;
}

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

function requirePublishUserConfig(root: string): string {
  const userConfigPath = localRegistryUserConfigPath(root);
  if (!existsSync(userConfigPath)) {
    throw new Error(
      `Missing Verdaccio login at ${userConfigPath}. Run pnpm run local-registry:setup first.`
    );
  }

  return userConfigPath;
}

function packageManifestPath(packageRoot: string): string {
  return join(packageRoot, 'package.json');
}

function readPackageManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
}

function serializeManifest(manifest: PackageManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function platformPackageNameFor(platform: string, arch: string): string | null {
  switch (`${platform}-${arch}`) {
    case 'darwin-arm64': {
      return 'fast-flow-transform-darwin-arm64';
    }
    case 'darwin-x64': {
      return 'fast-flow-transform-darwin-x64';
    }
    case 'linux-arm64': {
      return 'fast-flow-transform-linux-arm64';
    }
    case 'linux-x64': {
      return 'fast-flow-transform-linux-x64';
    }
    case 'win32-arm64': {
      return 'fast-flow-transform-win32-arm64';
    }
    case 'win32-x64': {
      return 'fast-flow-transform-win32-x64';
    }
    default: {
      return null;
    }
  }
}

function currentPlatformPackage(root: string): {
  packageName: string;
  packageRoot: string;
} {
  const targetKey = `${process.platform}-${process.arch}`;
  const packageName = platformPackageNameFor(process.platform, process.arch);

  if (!packageName) {
    throw new Error(`Unsupported local packaging target: ${targetKey}`);
  }

  return {
    packageName,
    packageRoot: join(root, 'bindings', packageName),
  };
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed (${String(result.status)}): ${command} ${args.join(' ')}`
    );
  }

  return result.stdout ?? '';
}

function gitShortSha(root: string): string {
  const result = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  return result.status === 0
    ? (result.stdout ?? '').trim() || 'nogit'
    : 'nogit';
}

function buildVersionStamp(date: Date): string {
  const parts = [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    't',
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
    String(date.getUTCMilliseconds()).padStart(3, '0'),
    'z',
  ];

  return parts.join('');
}

function buildLocalVersion(baseVersion: string, root: string): string {
  return `${baseVersion}-local.${buildVersionStamp(new Date())}.${gitShortSha(root)}`;
}

function withTemporaryManifestWrites(
  writes: { path: string; source: string }[],
  action: () => void
): void {
  const originals = writes.map(({ path }) => ({
    path,
    source: readFileSync(path, 'utf8'),
  }));

  for (const { path, source } of writes) {
    writeFileSync(path, source);
  }

  try {
    action();
  } finally {
    for (const { path, source } of originals) {
      writeFileSync(path, source);
    }
  }
}

function buildContext(root: string, registryUrl: string): PublishContext {
  const corePackageRoot = join(root, 'packages', 'core');
  const coreManifest = readPackageManifest(
    packageManifestPath(corePackageRoot)
  );
  const { packageName, packageRoot } = currentPlatformPackage(root);

  return {
    bindingManifestPath: packageManifestPath(packageRoot),
    bindingPackageName: packageName,
    bindingPackageRoot: packageRoot,
    coreManifestPath: packageManifestPath(corePackageRoot),
    corePackageRoot,
    registryUrl,
    userConfigPath: requirePublishUserConfig(root),
    version: buildLocalVersion(coreManifest.version, root),
  };
}

function buildArtifacts(root: string, corePackageRoot: string): void {
  runCommand('pnpm', ['sync-binding'], root);
  runCommand('pnpm', ['run', 'build'], corePackageRoot);
}

function publishPackage(
  packageRoot: string,
  registryUrl: string,
  userConfigPath: string
): void {
  runCommand(
    'pnpm',
    ['publish', '--registry', registryUrl, '--tag', 'local', '--no-git-checks'],
    packageRoot,
    {
      ...process.env,
      npm_config_registry: registryUrl,
      npm_config_userconfig: userConfigPath,
    }
  );
}

function publishCanary(context: PublishContext): void {
  const coreManifest = readPackageManifest(context.coreManifestPath);
  const bindingManifest = readPackageManifest(context.bindingManifestPath);

  withTemporaryManifestWrites(
    [
      {
        path: context.bindingManifestPath,
        source: serializeManifest({
          ...bindingManifest,
          version: context.version,
        }),
      },
      {
        path: context.coreManifestPath,
        source: serializeManifest({
          ...coreManifest,
          optionalDependencies: {
            [context.bindingPackageName]: context.version,
          },
          version: context.version,
        }),
      },
    ],
    () => {
      publishPackage(
        context.bindingPackageRoot,
        context.registryUrl,
        context.userConfigPath
      );
      publishPackage(
        context.corePackageRoot,
        context.registryUrl,
        context.userConfigPath
      );
    }
  );
}

function printInstallSnippet(context: PublishContext): void {
  process.stdout.write(
    `Published fast-flow-transform@${context.version} to ${context.registryUrl}\n`
  );
  process.stdout.write('\nInstall in another repo with pnpm:\n');
  process.stdout.write(
    `npm_config_registry=${context.registryUrl} pnpm add fast-flow-transform@${context.version}\n`
  );
  process.stdout.write('\nInstall in another repo with npm:\n');
  process.stdout.write(
    `npm_config_registry=${context.registryUrl} npm install fast-flow-transform@${context.version}\n`
  );
}

async function main(): Promise<void> {
  const root = workspaceRootDir();
  const registryUrl = registryUrlFromEnv();

  await checkRegistryHealth(registryUrl);

  const context = buildContext(root, registryUrl);
  buildArtifacts(root, context.corePackageRoot);
  publishCanary(context);
  printInstallSnippet(context);
}

await main();
