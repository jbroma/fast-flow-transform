import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  buildHermesConfigureArgs,
  buildRustgenCompileArgs,
  defaultWorkspaceRoot,
  hasConfiguredBuildDir,
  normalizeRustgenSource,
  resolveBindingPaths,
  resolveHermesBuildDir,
  resolveHermesSourceDir,
  rustgenBinaryPath,
} from './core.mts';

type RustgenMode = 'ffi' | 'cvt';

interface CommandOptions {
  cwd?: string;
  input?: string;
}

interface RuntimeOptions {
  env?: NodeJS.ProcessEnv;
  existsSync?: (path: string) => boolean;
  mkdirp?: (path: string) => void;
  preferredGenerator?: () => string | undefined;
  runCommand?: (
    file: string,
    args: string[],
    options?: CommandOptions
  ) => string;
  workspaceRoot?: string;
}

interface BuildGeneratedFilesOptions {
  bindingPaths: ReturnType<typeof resolveBindingPaths>;
  formatRust: (path: string, source: string) => string;
  runRustgen: (mode: RustgenMode) => string;
}

interface GeneratedFile {
  path: string;
  source: string;
}

interface RuntimeContext {
  env: NodeJS.ProcessEnv;
  fileExists: (path: string) => boolean;
  mkdirp: (path: string) => void;
  runCommand: (
    file: string,
    args: string[],
    options?: CommandOptions
  ) => string;
  workspaceRoot: string;
}

const HERMES_BUILD_TARGETS = [
  '--target',
  'LLVHSupport',
  'LLVHDemangle',
  '--config',
  'Release',
];

function defaultRunCommand(
  file: string,
  args: string[],
  options: CommandOptions = {}
): string {
  return execFileSync(file, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    input: options.input,
    stdio: 'pipe',
  });
}

function defaultMkdirp(path: string): void {
  mkdirSync(path, { recursive: true });
}

function defaultReadFile(path: string): string {
  return readFileSync(path, 'utf8');
}

function defaultWriteFile(path: string, source: string): void {
  writeFileSync(path, source);
}

function resolveRuntimeContext(options: RuntimeOptions): RuntimeContext {
  return {
    env: options.env ?? process.env,
    fileExists: options.existsSync ?? existsSync,
    mkdirp: options.mkdirp ?? defaultMkdirp,
    runCommand: options.runCommand ?? defaultRunCommand,
    workspaceRoot: options.workspaceRoot ?? defaultWorkspaceRoot(),
  };
}

function preferredGenerator(
  context: RuntimeContext,
  options: RuntimeOptions
): string | undefined {
  if (context.env.HERMES_CMAKE_GENERATOR) {
    return context.env.HERMES_CMAKE_GENERATOR;
  }
  if (options.preferredGenerator) {
    return options.preferredGenerator();
  }
  try {
    context.runCommand('ninja', ['--version']);
    return 'Ninja';
  } catch {
    return undefined;
  }
}

function resolveExplicitRustgen(context: RuntimeContext): string | undefined {
  if (!context.env.HERMES_RUSTGEN) {
    return undefined;
  }
  return resolve(context.workspaceRoot, context.env.HERMES_RUSTGEN);
}

function assertExistingPath(
  path: string,
  fileExists: (path: string) => boolean,
  label: string
): void {
  if (!fileExists(path)) {
    throw new Error(`${label} does not exist: ${path}`);
  }
}

function configureHermesBuild(
  context: RuntimeContext,
  options: RuntimeOptions,
  hermesSourceDir: string,
  buildDir: string
): void {
  if (hasConfiguredBuildDir(buildDir, context.fileExists)) {
    return;
  }
  context.runCommand(
    'cmake',
    buildHermesConfigureArgs(
      hermesSourceDir,
      buildDir,
      preferredGenerator(context, options)
    ),
    { cwd: context.workspaceRoot }
  );
}

function buildHermesLibraries(context: RuntimeContext, buildDir: string): void {
  context.runCommand('cmake', ['--build', buildDir, ...HERMES_BUILD_TARGETS], {
    cwd: context.workspaceRoot,
  });
}

function compileRustgen(
  context: RuntimeContext,
  hermesSourceDir: string,
  buildDir: string,
  outputPath: string
): void {
  context.mkdirp(dirname(outputPath));
  context.runCommand(
    'c++',
    buildRustgenCompileArgs(hermesSourceDir, buildDir, outputPath),
    {
      cwd: context.workspaceRoot,
    }
  );
}

function formatRustSource(source: string, context: RuntimeContext): string {
  return context.runCommand(
    'rustfmt',
    ['--edition', '2018', '--emit', 'stdout'],
    {
      cwd: context.workspaceRoot,
      input: source,
    }
  );
}

export {
  buildHermesConfigureArgs,
  buildRustgenCompileArgs,
  normalizeRustgenSource,
};

function buildManagedRustgen(
  context: RuntimeContext,
  options: RuntimeOptions
): string {
  const hermesSourceDir = resolveHermesSourceDir(
    context.workspaceRoot,
    context.env
  );
  const buildDir = resolveHermesBuildDir(context.workspaceRoot, context.env);
  const rustgen = rustgenBinaryPath(buildDir);
  configureHermesBuild(context, options, hermesSourceDir, buildDir);
  buildHermesLibraries(context, buildDir);
  compileRustgen(context, hermesSourceDir, buildDir, rustgen);
  assertExistingPath(rustgen, context.fileExists, 'rustgen binary');
  return rustgen;
}

export function ensureRustgenBinary(options: RuntimeOptions = {}): string {
  const context = resolveRuntimeContext(options);
  const explicitRustgen = resolveExplicitRustgen(context);
  if (explicitRustgen) {
    assertExistingPath(explicitRustgen, context.fileExists, 'HERMES_RUSTGEN');
    return explicitRustgen;
  }
  return buildManagedRustgen(context, options);
}

export function buildGeneratedFiles(
  options: BuildGeneratedFilesOptions
): GeneratedFile[] {
  return [
    {
      path: options.bindingPaths.ffi,
      source: options.formatRust(
        options.bindingPaths.ffi,
        options.runRustgen('ffi')
      ),
    },
    {
      path: options.bindingPaths.cvt,
      source: options.formatRust(
        options.bindingPaths.cvt,
        options.runRustgen('cvt')
      ),
    },
  ];
}

export function generateRustBindings(
  options: RuntimeOptions = {}
): GeneratedFile[] {
  const context = resolveRuntimeContext(options);
  const rustgen = ensureRustgenBinary({ ...options, ...context });
  return buildGeneratedFiles({
    bindingPaths: resolveBindingPaths(context.workspaceRoot),
    formatRust(_path, source) {
      return formatRustSource(normalizeRustgenSource(source), context);
    },
    runRustgen(mode) {
      return context.runCommand(rustgen, [mode], {
        cwd: context.workspaceRoot,
      });
    },
  });
}

export function writeGeneratedFiles(
  files: GeneratedFile[],
  writeFile: (path: string, source: string) => void = defaultWriteFile
): string[] {
  for (const file of files) {
    writeFile(file.path, file.source);
  }
  return files.map((file) => file.path);
}

export function checkGeneratedFiles(
  files: GeneratedFile[],
  readFile: (path: string) => string = defaultReadFile
): string[] {
  return files
    .filter((file) => readFile(file.path) !== file.source)
    .map((file) => file.path);
}

export function writeRustBindings(options: RuntimeOptions = {}): string[] {
  return writeGeneratedFiles(generateRustBindings(options));
}

export function checkRustBindings(options: RuntimeOptions = {}): string[] {
  return checkGeneratedFiles(generateRustBindings(options));
}
