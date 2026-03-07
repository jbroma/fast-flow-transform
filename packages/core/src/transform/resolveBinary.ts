import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const PLATFORM_PACKAGES: Record<string, string> = {
  'darwin-arm64': 'fast-flow-transform-darwin-arm64',
  'darwin-x64': 'fast-flow-transform-darwin-x64',
  'linux-arm64': 'fast-flow-transform-linux-arm64',
  'linux-x64': 'fast-flow-transform-linux-x64',
  'win32-arm64': 'fast-flow-transform-win32-arm64',
  'win32-x64': 'fast-flow-transform-win32-x64',
};

function executableNameFor(platform: string): string {
  return platform === 'win32' ? 'fft-strip.exe' : 'fft-strip';
}

function moduleDirectory(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function existingBinary(binaryPath: string): string | null {
  return existsSync(binaryPath) ? binaryPath : null;
}

export function packageBinaryPathFromEntryPath(
  entryPath: string,
  platform: string = process.platform
): string {
  const entryDirectory = dirname(entryPath);
  if (basename(entryDirectory) === 'dist') {
    return resolve(entryDirectory, '..', 'bin', executableNameFor(platform));
  }

  return resolve(entryDirectory, 'bin', executableNameFor(platform));
}

export function platformPackageNameFor(
  platform: string,
  arch: string
): string | null {
  return PLATFORM_PACKAGES[`${platform}-${arch}`] ?? null;
}

function resolveBinaryFromEnvironment(): string | null {
  const binaryPath = process.env.FFT_STRIP_BINARY;
  if (!binaryPath) {
    return null;
  }

  if (!existsSync(binaryPath)) {
    throw new Error(`FFT_STRIP_BINARY points to a missing file: ${binaryPath}`);
  }

  return binaryPath;
}

function resolveFromOptionalPackage(): string | null {
  const packageName = platformPackageNameFor(process.platform, process.arch);
  if (!packageName) {
    return null;
  }

  try {
    const entryPath = require.resolve(packageName);
    return existingBinary(packageBinaryPathFromEntryPath(entryPath));
  } catch {
    return null;
  }
}

function resolveFromBundledBinary(): string | null {
  return existingBinary(
    resolve(
      moduleDirectory(),
      '..',
      '..',
      'bin',
      executableNameFor(process.platform)
    )
  );
}

function resolveFromWorkspaceBuild(): string | null {
  return existingBinary(
    resolve(
      moduleDirectory(),
      '../../../../target/release',
      executableNameFor(process.platform)
    )
  );
}

export function resolveBinaryPath(): string {
  const binaryPath =
    resolveBinaryFromEnvironment() ??
    resolveFromBundledBinary() ??
    resolveFromOptionalPackage() ??
    resolveFromWorkspaceBuild();

  if (binaryPath) {
    return binaryPath;
  }

  throw new Error(
    `Unable to resolve fft-strip binary for ${process.platform}-${process.arch}. ` +
      'Install the matching optional package or set FFT_STRIP_BINARY.'
  );
}
