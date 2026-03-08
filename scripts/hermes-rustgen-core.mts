import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BindingPaths {
  cvt: string;
  ffi: string;
}

const RESERVED_RUST_IDENTIFIERS = new Map([['const', 'const_']]);

function normalizeRustIdentifier(identifier: string): string {
  return RESERVED_RUST_IDENTIFIERS.get(identifier) ?? identifier;
}

function supportLibraryPath(buildDir: string): string {
  return resolve(
    buildDir,
    'external',
    'llvh',
    'lib',
    'Support',
    'libLLVHSupport.a'
  );
}

function demangleLibraryPath(buildDir: string): string {
  return resolve(
    buildDir,
    'external',
    'llvh',
    'lib',
    'Demangle',
    'libLLVHDemangle.a'
  );
}

export function defaultWorkspaceRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

export function resolveHermesSourceDir(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv
): string {
  return resolve(workspaceRoot, env.HERMES_SOURCE_DIR ?? 'third_party/hermes');
}

export function resolveHermesBuildDir(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv
): string {
  return resolve(
    workspaceRoot,
    env.HERMES_BUILD_DIR ?? env.HERMES_BUILD ?? 'target/hermes-rustgen'
  );
}

export function rustgenBinaryPath(buildDir: string): string {
  return resolve(buildDir, 'bin', 'rustgen');
}

export function resolveBindingPaths(
  workspaceRoot = defaultWorkspaceRoot()
): BindingPaths {
  return {
    cvt: resolve(
      workspaceRoot,
      'crates',
      'fft',
      'src',
      'hparser',
      'generated_cvt.rs'
    ),
    ffi: resolve(
      workspaceRoot,
      'crates',
      'hermes',
      'src',
      'parser',
      'generated_ffi.rs'
    ),
  };
}

export function buildHermesConfigureArgs(
  hermesSourceDir: string,
  buildDir: string,
  generator?: string
): string[] {
  const args = ['-S', hermesSourceDir, '-B', buildDir];
  if (generator) {
    args.push('-G', generator);
  }
  args.push('-DCMAKE_BUILD_TYPE=Release');
  return args;
}

export function buildRustgenCompileArgs(
  hermesSourceDir: string,
  buildDir: string,
  outputPath: string
): string[] {
  return [
    '-std=c++17',
    '-fno-exceptions',
    '-fno-rtti',
    `-I${resolve(hermesSourceDir, 'external')}`,
    `-I${resolve(hermesSourceDir, 'include')}`,
    `-I${resolve(buildDir, 'include')}`,
    `-I${resolve(buildDir, 'lib', 'config')}`,
    `-I${resolve(hermesSourceDir, 'external', 'llvh', 'include')}`,
    `-I${resolve(hermesSourceDir, 'external', 'llvh', 'gen', 'include')}`,
    `-I${resolve(buildDir, 'external', 'llvh', 'include')}`,
    '-o',
    outputPath,
    resolve(hermesSourceDir, 'unsupported', 'tools', 'rustgen', 'rustgen.cpp'),
    supportLibraryPath(buildDir),
    demangleLibraryPath(buildDir),
  ];
}

export function hasConfiguredBuildDir(
  buildDir: string,
  fileExists: (path: string) => boolean
): boolean {
  if (!fileExists(resolve(buildDir, 'CMakeCache.txt'))) {
    return false;
  }

  return [
    resolve(buildDir, 'build.ninja'),
    resolve(buildDir, 'Makefile'),
    resolve(buildDir, 'CMakeFiles', 'TargetDirectories.txt'),
  ].some(fileExists);
}

export function normalizeRustgenSource(source: string): string {
  return source
    .split('\n')
    .map((line) =>
      line
        .replace(
          /^(\s*let )([A-Za-z_][A-Za-z0-9_]*)( = )/,
          (_match, prefix, identifier, suffix) =>
            `${prefix}${normalizeRustIdentifier(identifier)}${suffix}`
        )
        .replace(
          /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(,)$/,
          (_match, prefix, identifier, suffix) =>
            `${prefix}${normalizeRustIdentifier(identifier)}${suffix}`
        )
    )
    .join('\n');
}
