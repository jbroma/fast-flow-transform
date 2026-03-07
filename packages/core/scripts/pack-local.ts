import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface WorkspaceContext {
  corePackageRoot: string;
  platformPackageRoot: string;
  targetKey: string;
  workspaceRoot: string;
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
  const corePackageRoot = resolve(
    fileURLToPath(new URL('..', import.meta.url))
  );
  const workspaceRoot = resolve(corePackageRoot, '..', '..');
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
    platformPackageRoot: join(workspaceRoot, 'bindings', platformPackageName),
    targetKey,
    workspaceRoot,
  };
}

function builtBinaryPath(workspaceRoot: string, targetKey: string): string {
  const overrideBinaryPath = process.env.FFT_STRIP_BINARY;
  const binaryName =
    process.platform === 'win32' ? 'fft-strip.exe' : 'fft-strip';
  const defaultBinaryPath = join(
    workspaceRoot,
    'target',
    'release',
    binaryName
  );

  if (overrideBinaryPath) {
    process.stdout.write(
      `Using existing native binary for ${targetKey}: ${overrideBinaryPath}\n`
    );
    return overrideBinaryPath;
  }

  process.stdout.write(`Building native binary for ${targetKey}...\n`);
  run('cargo', ['build', '--release', '-p', 'fft_strip'], workspaceRoot);
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

function buildPackages(
  corePackageRoot: string,
  platformPackageRoot: string
): void {
  run('pnpm', ['run', 'build'], corePackageRoot);
  run('pnpm', ['run', 'build'], platformPackageRoot);
}

function packPackages(outputDirectory: string, packageRoots: string[]): void {
  for (const packageRoot of packageRoots) {
    run('npm', ['pack', '--pack-destination', outputDirectory], packageRoot);
  }
}

function verifiedBinaryPath(workspaceRoot: string, targetKey: string): string {
  const binaryPath = builtBinaryPath(workspaceRoot, targetKey);
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
  buildPackages(corePackageRoot, platformPackageRoot);
  const outputDirectory = join(corePackageRoot, 'artifacts');
  cleanDirectory(outputDirectory);
  packPackages(outputDirectory, [platformPackageRoot, corePackageRoot]);
  printTarballSummary(tarballPaths(outputDirectory));
}

function main(): void {
  const { corePackageRoot, platformPackageRoot, targetKey, workspaceRoot } =
    workspaceContext();
  const binaryPath = verifiedBinaryPath(workspaceRoot, targetKey);

  copyPackageBinaries(binaryPath, corePackageRoot, platformPackageRoot);
  packTarballs(corePackageRoot, platformPackageRoot);
}

main();
