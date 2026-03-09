import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface WorkspaceContext {
  corePackageRoot: string;
  platformPackageRoot: string;
  workspaceRoot: string;
}

const PLATFORM_PACKAGE_NAMES = [
  'fast-flow-transform-darwin-arm64',
  'fast-flow-transform-darwin-x64',
  'fast-flow-transform-linux-arm64',
  'fast-flow-transform-linux-x64',
  'fast-flow-transform-win32-arm64',
  'fast-flow-transform-win32-x64',
] as const;

function workspaceRootDir(): string {
  return resolve(fileURLToPath(new URL('..', import.meta.url)));
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed (${String(result.status)}): ${command} ${args.join(' ')}`
    );
  }
}

function ensureDirectory(targetPath: string): void {
  mkdirSync(targetPath, { recursive: true });
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

function workspaceContext(): WorkspaceContext {
  const root = workspaceRootDir();
  const corePackageRoot = join(root, 'packages', 'core');
  const platformPackageName = platformPackageNameFor(
    process.platform,
    process.arch
  );
  const targetKey = `${process.platform}-${process.arch}`;

  if (!platformPackageName) {
    throw new Error(`Unsupported local packaging target: ${targetKey}`);
  }

  return {
    corePackageRoot,
    platformPackageRoot: join(root, 'bindings', platformPackageName),
    workspaceRoot: root,
  };
}

function cleanDirectory(targetPath: string): void {
  rmSync(targetPath, { force: true, recursive: true });
  ensureDirectory(targetPath);
}

function tarballPaths(outputDirectory: string): string[] {
  return readdirSync(outputDirectory)
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => join(outputDirectory, name));
}

function printTarballSummary(tarballs: string[]): void {
  process.stdout.write('\nCreated tarballs:\n');
  for (const tarball of tarballs) {
    process.stdout.write(`- ${tarball}\n`);
  }

  process.stdout.write('\nInstall in another project with:\n');
  process.stdout.write(
    `pnpm add ${tarballs.map((tarball) => `'${tarball}'`).join(' ')}\n`
  );
}

function buildPackages(corePackageRoot: string): void {
  run('pnpm', ['run', 'build'], corePackageRoot);
}

function packPackages(outputDirectory: string, packageRoots: string[]): void {
  for (const packageRoot of packageRoots) {
    run('pnpm', ['pack', '--pack-destination', outputDirectory], packageRoot);
  }
}

function createCorePackageManifest(corePackageRoot: string): string {
  const packageJsonPath = join(corePackageRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    optionalDependencies?: Record<string, string>;
    version: string;
  };

  packageJson.optionalDependencies = Object.fromEntries(
    PLATFORM_PACKAGE_NAMES.map((packageName) => [
      packageName,
      packageJson.version,
    ])
  );

  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

function withPackedCoreManifest(
  corePackageRoot: string,
  pack: () => void
): void {
  const packageJsonPath = join(corePackageRoot, 'package.json');
  const originalManifest = readFileSync(packageJsonPath, 'utf8');

  writeFileSync(packageJsonPath, createCorePackageManifest(corePackageRoot));

  try {
    pack();
  } finally {
    writeFileSync(packageJsonPath, originalManifest);
  }
}

function bindingFileNameFor(platform: string, arch: string): string {
  return `fast-flow-transform.${platform}-${arch}.node`;
}

function assertSyncedBinding(root: string, targetDirectory: string): void {
  const bindingPath = join(
    root,
    targetDirectory,
    bindingFileNameFor(process.platform, process.arch)
  );

  if (!existsSync(bindingPath)) {
    throw new Error(`Expected synced binding not found at ${bindingPath}`);
  }
}

function syncBinding(root: string): void {
  run('pnpm', ['sync-binding'], root);
  assertSyncedBinding(root, join('packages', 'core', 'native'));

  const platformPackageName = platformPackageNameFor(
    process.platform,
    process.arch
  );
  if (!platformPackageName) {
    return;
  }

  assertSyncedBinding(root, join('bindings', platformPackageName));
}

function packTarballs(
  corePackageRoot: string,
  platformPackageRoot: string
): void {
  buildPackages(corePackageRoot);
  const outputDirectory = join(corePackageRoot, 'artifacts');
  cleanDirectory(outputDirectory);
  packPackages(outputDirectory, [platformPackageRoot]);
  withPackedCoreManifest(corePackageRoot, () => {
    packPackages(outputDirectory, [corePackageRoot]);
  });
  printTarballSummary(tarballPaths(outputDirectory));
}

function main(): void {
  const { corePackageRoot, platformPackageRoot, workspaceRoot } =
    workspaceContext();
  syncBinding(workspaceRoot);
  packTarballs(corePackageRoot, platformPackageRoot);
}

main();
