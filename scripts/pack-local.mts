import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface WorkspaceContext {
  corePackageRoot: string;
  platformPackageRoot: string;
  targetKey: string;
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

function copyBinary(binaryPath: string, targetDirectory: string): string {
  ensureDirectory(targetDirectory);

  const destinationPath = join(targetDirectory, basename(binaryPath));
  copyFileSync(binaryPath, destinationPath);

  if (process.platform !== 'win32') {
    chmodSync(destinationPath, 0o755);
  }

  return destinationPath;
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
    targetKey,
    workspaceRoot: root,
  };
}

function builtBinaryPath(rootDir: string, targetKey: string): string {
  const overrideBinaryPath = process.env.FFT_STRIP_BINARY;
  const binaryName =
    process.platform === 'win32' ? 'fft-strip.exe' : 'fft-strip';
  const defaultBinaryPath = join(rootDir, 'target', 'release', binaryName);

  if (overrideBinaryPath) {
    process.stdout.write(
      `Using existing native binary for ${targetKey}: ${overrideBinaryPath}\n`
    );
    return overrideBinaryPath;
  }

  process.stdout.write(`Building native binary for ${targetKey}...\n`);
  run('cargo', ['build', '--release', '-p', 'fft_strip'], rootDir);
  return defaultBinaryPath;
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
    run(
      'npm',
      ['pack', '--ignore-scripts', '--pack-destination', outputDirectory],
      packageRoot
    );
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

function verifiedBinaryPath(rootDir: string, targetKey: string): string {
  const binaryPath = builtBinaryPath(rootDir, targetKey);
  if (!existsSync(binaryPath)) {
    throw new Error(`Expected built binary not found at ${binaryPath}`);
  }

  return binaryPath;
}

function copyPackageBinaries(
  binaryPath: string,
  corePackageRoot: string,
  platformPackageRoot: string
): void {
  const platformBinaryPath = copyBinary(
    binaryPath,
    join(platformPackageRoot, 'bin')
  );
  const coreBinaryPath = copyBinary(binaryPath, join(corePackageRoot, 'bin'));
  process.stdout.write(`Copied binary to: ${platformBinaryPath}\n`);
  process.stdout.write(`Copied binary to: ${coreBinaryPath}\n`);
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
  const { corePackageRoot, platformPackageRoot, targetKey, workspaceRoot } =
    workspaceContext();
  const binaryPath = verifiedBinaryPath(workspaceRoot, targetKey);

  run('pnpm', ['sync-binding'], workspaceRoot);
  copyPackageBinaries(binaryPath, corePackageRoot, platformPackageRoot);
  packTarballs(corePackageRoot, platformPackageRoot);
}

main();
