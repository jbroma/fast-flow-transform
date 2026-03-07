import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLATFORM_PACKAGES: Record<string, string> = {
  'darwin-arm64': 'fast-flow-transform-darwin-arm64',
  'darwin-x64': 'fast-flow-transform-darwin-x64',
  'linux-arm64': 'fast-flow-transform-linux-arm64',
  'linux-x64': 'fast-flow-transform-linux-x64',
  'win32-arm64': 'fast-flow-transform-win32-arm64',
  'win32-x64': 'fast-flow-transform-win32-x64',
};

function workspaceRoot(): string {
  return resolve(fileURLToPath(new URL('..', import.meta.url)));
}

function executableNameFor(platform: string): string {
  return platform === 'win32' ? 'fft-strip.exe' : 'fft-strip';
}

function platformPackageNameFor(platform: string, arch: string): string | null {
  return PLATFORM_PACKAGES[`${platform}-${arch}`] ?? null;
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

function requiredBinaryPath(root: string): string {
  const binaryPath =
    process.env.FFT_STRIP_BINARY ??
    join(root, 'target', 'release', executableNameFor(process.platform));
  if (!existsSync(binaryPath)) {
    throw new Error(`Expected built binary not found at ${binaryPath}`);
  }
  return binaryPath;
}

function requiredPlatformPackageRoot(root: string): string {
  const platformPackageName = platformPackageNameFor(
    process.platform,
    process.arch
  );
  if (!platformPackageName) {
    throw new Error(
      `Unsupported binary sync target: ${process.platform}-${process.arch}`
    );
  }
  return join(root, 'bindings', platformPackageName);
}

function reportCopiedBinary(copiedBinaryPath: string): void {
  process.stdout.write(`Copied binary to: ${copiedBinaryPath}\n`);
}

function main(): void {
  const root = workspaceRoot();
  const binaryPath = requiredBinaryPath(root);
  const corePackageRoot = join(root, 'packages', 'core');
  const platformPackageRoot = requiredPlatformPackageRoot(root);
  const copiedCoreBinary = copyBinary(binaryPath, join(corePackageRoot, 'bin'));
  const copiedPlatformBinary = copyBinary(
    binaryPath,
    join(platformPackageRoot, 'bin')
  );

  reportCopiedBinary(copiedCoreBinary);
  reportCopiedBinary(copiedPlatformBinary);
}

main();
