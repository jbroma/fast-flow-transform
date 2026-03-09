import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ensurePublishUserConfig,
  ensureRegistryReady,
  registryUrlFromEnv,
  workspaceRootDir,
} from './verdaccio.mts';

const PLATFORM_PACKAGE_NAMES: Record<string, string> = {
  'darwin-arm64': 'fast-flow-transform-darwin-arm64',
  'darwin-x64': 'fast-flow-transform-darwin-x64',
  'linux-arm64': 'fast-flow-transform-linux-arm64',
  'linux-x64': 'fast-flow-transform-linux-x64',
  'win32-arm64': 'fast-flow-transform-win32-arm64',
  'win32-x64': 'fast-flow-transform-win32-x64',
};

interface PackageManifest {
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

function readPackageManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
}

function currentPlatformPackage(root: string): {
  packageName: string;
  packageRoot: string;
} {
  const targetKey = `${process.platform}-${process.arch}`;
  const packageName = PLATFORM_PACKAGE_NAMES[targetKey] ?? null;

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
): void {
  const result = spawnSync(command, args, {
    cwd,
    env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed (${String(result.status)}): ${command} ${args.join(' ')}`
    );
  }
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

function buildLocalVersion(baseVersion: string, root: string): string {
  const stamp = new Date()
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace('T', 't')
    .replace('.', '')
    .replace('Z', 'z');

  return `${baseVersion}-local.${stamp}.${gitShortSha(root)}`;
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

function buildContext(
  root: string,
  registryUrl: string,
  userConfigPath: string
): PublishContext {
  const corePackageRoot = join(root, 'packages', 'core');
  const coreManifestPath = join(corePackageRoot, 'package.json');
  const coreManifest = readPackageManifest(coreManifestPath);
  const { packageName, packageRoot } = currentPlatformPackage(root);

  return {
    bindingManifestPath: join(packageRoot, 'package.json'),
    bindingPackageName: packageName,
    bindingPackageRoot: packageRoot,
    coreManifestPath,
    corePackageRoot,
    registryUrl,
    userConfigPath,
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

function stringifyManifest(manifest: PackageManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function publishCanary(context: PublishContext): void {
  const coreManifest = readPackageManifest(context.coreManifestPath);
  const bindingManifest = readPackageManifest(context.bindingManifestPath);
  const nextBindingManifest = {
    ...bindingManifest,
    version: context.version,
  };
  const nextCoreManifest = {
    ...coreManifest,
    optionalDependencies: {
      [context.bindingPackageName]: context.version,
    },
    version: context.version,
  };

  withTemporaryManifestWrites(
    [
      {
        path: context.bindingManifestPath,
        source: stringifyManifest(nextBindingManifest),
      },
      {
        path: context.coreManifestPath,
        source: stringifyManifest(nextCoreManifest),
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

  await ensureRegistryReady(root, registryUrl);
  const userConfigPath = ensurePublishUserConfig(root, registryUrl);
  const context = buildContext(root, registryUrl, userConfigPath);

  buildArtifacts(root, context.corePackageRoot);
  publishCanary(context);
  printInstallSnippet(context);
}

await main();
