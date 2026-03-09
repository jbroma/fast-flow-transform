import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
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

interface BindingResolutionOptions {
  arch: string;
  env: NodeJS.ProcessEnv;
  exists: (path: string) => boolean;
  moduleDirectory: string;
  platform: string;
  resolveModule: (packageName: string) => string;
}

function moduleDirectory(): string {
  return dirname(fileURLToPath(import.meta.url));
}

export function bindingFileNameFor(platform: string, arch: string): string {
  return `fast-flow-transform.${platform}-${arch}.node`;
}

export function platformPackageNameFor(
  platform: string,
  arch: string
): string | null {
  return PLATFORM_PACKAGES[`${platform}-${arch}`] ?? null;
}

function resolveBindingFromEnvironment(
  options: BindingResolutionOptions
): string | null {
  const bindingPath = options.env.FFT_NATIVE_BINDING;
  if (!bindingPath) {
    return null;
  }

  if (!options.exists(bindingPath)) {
    throw new Error(
      `FFT_NATIVE_BINDING points to a missing file: ${bindingPath}`
    );
  }

  return bindingPath;
}

function resolveFromOptionalPackage(
  options: BindingResolutionOptions
): string | null {
  const packageName = platformPackageNameFor(options.platform, options.arch);
  if (!packageName) {
    return null;
  }

  try {
    const entryPath = options.resolveModule(packageName);
    return entryPath.endsWith('.node') ? entryPath : null;
  } catch {
    return null;
  }
}

function resolveFromBundledBinding(
  options: BindingResolutionOptions
): string | null {
  const bindingPath = resolve(
    options.moduleDirectory,
    '..',
    '..',
    'native',
    bindingFileNameFor(options.platform, options.arch)
  );

  return options.exists(bindingPath) ? bindingPath : null;
}

function resolveFromWorkspaceBuild(
  options: BindingResolutionOptions
): string | null {
  const bindingPath = resolve(
    options.moduleDirectory,
    '../../../../target/release',
    bindingFileNameFor(options.platform, options.arch)
  );

  return options.exists(bindingPath) ? bindingPath : null;
}

function resolveBindingPathWithOptions(
  options: BindingResolutionOptions
): string {
  const bindingPath =
    resolveBindingFromEnvironment(options) ??
    resolveFromBundledBinding(options) ??
    resolveFromOptionalPackage(options) ??
    resolveFromWorkspaceBuild(options);

  if (bindingPath) {
    return bindingPath;
  }

  throw new Error(
    `Unable to resolve fast-flow-transform native binding for ${options.platform}-${options.arch}. ` +
      'Install the matching optional package or set FFT_NATIVE_BINDING.'
  );
}

export function resolveBindingPath(): string {
  return resolveBindingPathWithOptions({
    arch: process.arch,
    env: process.env,
    exists: existsSync,
    moduleDirectory: moduleDirectory(),
    platform: process.platform,
    resolveModule: (packageName) => require.resolve(packageName),
  });
}

export const resolveBindingPathForTest = resolveBindingPathWithOptions;
