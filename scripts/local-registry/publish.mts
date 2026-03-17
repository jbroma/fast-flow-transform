import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ensureRegistryCredentials,
  registryPublishEnv,
  registryUrlFromEnv,
  requireRegistryReady,
  workspaceRootDir,
} from './verdaccio.mts';

interface PackageManifest {
  publishConfig?: {
    [key: string]: unknown;
    provenance?: boolean;
    registry?: string;
  };
  version: string;
}

interface PublishContext {
  registryUrl: string;
  version: string;
}

interface LocalRegistryContext {
  registryUrl: string;
  root: string;
  userConfigPath: string;
}

interface ManagedFile {
  path: string;
  source: string;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
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

function coreManifestPath(root: string): string {
  return join(root, 'packages', 'core', 'package.json');
}

function managedManifestPaths(root: string): string[] {
  const bindingManifestPaths = readdirSync(join(root, 'bindings'), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, 'bindings', entry.name, 'package.json'));

  return [coreManifestPath(root), ...bindingManifestPaths];
}

function generatedBindingPaths(root: string): string[] {
  return [
    join(root, 'packages', 'core', 'binding', 'bindings.cjs'),
    join(root, 'packages', 'core', 'binding', 'bindings.d.cts'),
  ];
}

function managedStatePaths(root: string): string[] {
  return [...managedManifestPaths(root), ...generatedBindingPaths(root)];
}

function withTemporaryFileState(paths: string[], action: () => void): void {
  const originals: ManagedFile[] = paths.map((path) => ({
    path,
    source: readFileSync(path, 'utf8'),
  }));

  try {
    action();
  } finally {
    for (const file of originals) {
      writeFileSync(file.path, file.source);
    }
  }
}

function setLocalVersion(root: string, version: string): void {
  const manifestPath = coreManifestPath(root);
  const manifest = readJson<PackageManifest>(manifestPath);
  writeJson(manifestPath, { ...manifest, version });
  runCommand(
    'pnpm',
    [
      '--dir',
      'packages/core',
      'exec',
      'napi',
      'version',
      '--package-json-path',
      'package.json',
      '--npm-dir',
      '../../bindings',
    ],
    root
  );
}

function applyLocalPublishConfig(root: string, registryUrl: string): void {
  for (const manifestPath of managedManifestPaths(root)) {
    const manifest = readJson<PackageManifest>(manifestPath);
    writeJson(manifestPath, {
      ...manifest,
      publishConfig: {
        ...manifest.publishConfig,
        provenance: false,
        registry: registryUrl,
      },
    });
  }
}

function buildPublishArtifacts(root: string): void {
  rmSync(join(root, 'artifacts'), { force: true, recursive: true });
  runCommand('pnpm', ['--filter', 'fast-flow-transform', 'build'], root);
  runCommand(
    'pnpm',
    [
      '--dir',
      'packages/core',
      'exec',
      'napi',
      'build',
      '--platform',
      '--release',
      '--manifest-path',
      '../../crates/fft_node/Cargo.toml',
      '--package-json-path',
      'package.json',
      '--output-dir',
      '../../artifacts',
    ],
    root
  );
  runCommand(
    'pnpm',
    [
      '--dir',
      'packages/core',
      'exec',
      'napi',
      'artifacts',
      '--package-json-path',
      'package.json',
      '--npm-dir',
      '../../bindings',
      '--output-dir',
      '../../artifacts',
    ],
    root
  );
}

function cleanupLocalArtifacts(root: string): void {
  rmSync(join(root, 'artifacts'), { force: true, recursive: true });

  for (const entry of readdirSync(join(root, 'packages', 'core'))) {
    if (entry.startsWith('fast-flow-transform.') && entry.endsWith('.node')) {
      rmSync(join(root, 'packages', 'core', entry), { force: true });
    }
  }
}

function publishCorePackage(
  root: string,
  registryUrl: string,
  userConfigPath: string
): void {
  runCommand(
    'pnpm',
    ['publish', '--no-git-checks', '--tag', 'local'],
    join(root, 'packages', 'core'),
    registryPublishEnv(registryUrl, userConfigPath)
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

async function prepareLocalRegistry(): Promise<LocalRegistryContext> {
  const root = workspaceRootDir();
  const registryUrl = registryUrlFromEnv();

  await requireRegistryReady(root, registryUrl);
  const userConfigPath = await ensureRegistryCredentials(root, registryUrl);
  runCommand(
    'pnpm',
    [
      '--dir',
      'packages/core',
      'exec',
      'napi',
      'create-npm-dirs',
      '--package-json-path',
      'package.json',
      '--npm-dir',
      '../../bindings',
    ],
    root
  );

  return { registryUrl, root, userConfigPath };
}

function createPublishContext(
  root: string,
  registryUrl: string
): PublishContext {
  return {
    registryUrl,
    version: buildLocalVersion(
      readJson<PackageManifest>(coreManifestPath(root)).version,
      root
    ),
  };
}

function runLocalPublish(
  root: string,
  registryUrl: string,
  userConfigPath: string,
  version: string
): void {
  withTemporaryFileState(managedStatePaths(root), () => {
    setLocalVersion(root, version);
    applyLocalPublishConfig(root, registryUrl);
    buildPublishArtifacts(root);
    publishCorePackage(root, registryUrl, userConfigPath);
  });
}

async function publishLocalCanary(): Promise<PublishContext> {
  const { registryUrl, root, userConfigPath } = await prepareLocalRegistry();
  const context = createPublishContext(root, registryUrl);

  try {
    runLocalPublish(root, registryUrl, userConfigPath, context.version);
  } finally {
    cleanupLocalArtifacts(root);
  }

  printInstallSnippet(context);
  return context;
}

async function main(): Promise<void> {
  await publishLocalCanary();
}

await main();
