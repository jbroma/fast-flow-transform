import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

function bindingFileNameFor(platform: string, arch: string): string {
  return `fast-flow-transform.${platform}-${arch}.node`;
}

function builtLibraryNameFor(platform: string): string {
  if (platform === 'win32') {
    return 'fft_node.dll';
  }

  return platform === 'darwin' ? 'libfft_node.dylib' : 'libfft_node.so';
}

function ensureDirectory(targetPath: string): void {
  mkdirSync(targetPath, { recursive: true });
}

function copyBinding(sourcePath: string, targetDirectory: string): string {
  ensureDirectory(targetDirectory);

  const destinationPath = join(
    targetDirectory,
    bindingFileNameFor(process.platform, process.arch)
  );
  copyFileSync(sourcePath, destinationPath);
  return destinationPath;
}

function platformPackageRoot(root: string): string | null {
  const packageName = PLATFORM_PACKAGES[`${process.platform}-${process.arch}`];
  return packageName ? join(root, 'bindings', packageName) : null;
}

function sourceBindingPath(root: string): string {
  const sourcePath =
    process.env.FFT_NATIVE_BINDING_SOURCE ??
    join(root, 'target', 'release', builtLibraryNameFor(process.platform));

  if (!existsSync(sourcePath)) {
    throw new Error(`Expected built binding not found at ${sourcePath}`);
  }

  return sourcePath;
}

function reportCopiedBinding(bindingPath: string): void {
  process.stdout.write(`Copied binding to: ${bindingPath}\n`);
}

function copyPackageBinding(root: string, sourcePath: string): void {
  const packageRoot = platformPackageRoot(root);
  if (!packageRoot) {
    return;
  }

  reportCopiedBinding(copyBinding(sourcePath, packageRoot));
}

function main(): void {
  const root = workspaceRoot();
  const sourcePath = sourceBindingPath(root);
  const copiedTargetBinding = copyBinding(
    sourcePath,
    join(root, 'target', 'release')
  );

  reportCopiedBinding(copiedTargetBinding);
  copyPackageBinding(root, sourcePath);
}

main();
