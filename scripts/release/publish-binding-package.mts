import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface BindingTarget {
  bindingFileName: string;
  libraryFileName: string;
  packageDir: string;
}

const TARGETS: Record<string, BindingTarget> = {
  'aarch64-apple-darwin': {
    bindingFileName: 'fast-flow-transform.darwin-arm64.node',
    libraryFileName: 'libfft_node.dylib',
    packageDir: 'bindings/fast-flow-transform-darwin-arm64',
  },
  'aarch64-pc-windows-msvc': {
    bindingFileName: 'fast-flow-transform.win32-arm64.node',
    libraryFileName: 'fft_node.dll',
    packageDir: 'bindings/fast-flow-transform-win32-arm64',
  },
  'aarch64-unknown-linux-gnu': {
    bindingFileName: 'fast-flow-transform.linux-arm64.node',
    libraryFileName: 'libfft_node.so',
    packageDir: 'bindings/fast-flow-transform-linux-arm64',
  },
  'x86_64-apple-darwin': {
    bindingFileName: 'fast-flow-transform.darwin-x64.node',
    libraryFileName: 'libfft_node.dylib',
    packageDir: 'bindings/fast-flow-transform-darwin-x64',
  },
  'x86_64-pc-windows-msvc': {
    bindingFileName: 'fast-flow-transform.win32-x64.node',
    libraryFileName: 'fft_node.dll',
    packageDir: 'bindings/fast-flow-transform-win32-x64',
  },
  'x86_64-unknown-linux-gnu': {
    bindingFileName: 'fast-flow-transform.linux-x64.node',
    libraryFileName: 'libfft_node.so',
    packageDir: 'bindings/fast-flow-transform-linux-x64',
  },
};

function commandName(name: 'cargo' | 'npm'): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function requiredFlag(name: string): string {
  const flagIndex = process.argv.indexOf(name);
  const value = flagIndex === -1 ? null : process.argv[flagIndex + 1];

  if (!value) {
    throw new Error(`Missing required flag: ${name}`);
  }

  return value;
}

function optionalFlag(name: string): string | null {
  const flagIndex = process.argv.indexOf(name);
  return flagIndex === -1 ? null : (process.argv[flagIndex + 1] ?? null);
}

interface CommandResult {
  status: number | null;
  stderr: string;
  stdout: string;
}

function runResult(
  command: string,
  args: string[],
  cwd: string,
  stdio: 'inherit' | 'pipe'
): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    shell: false,
    stdio,
  });

  return {
    status: result.status,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

function run(
  command: string,
  args: string[],
  cwd: string,
  stdio: 'inherit' | 'pipe'
): string {
  const result = runResult(command, args, cwd, stdio);

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with ${String(result.status)}\n${
        result.stdout
      }${result.stderr}`
    );
  }

  return result.stdout;
}

function manifestFor(packageDir: string): { name: string; version: string } {
  return JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
  };
}

function versionExists(name: string, version: string): boolean {
  try {
    const output = run(
      commandName('npm'),
      [
        'view',
        `${name}@${version}`,
        'version',
        '--registry',
        'https://registry.npmjs.org/',
      ],
      process.cwd(),
      'pipe'
    ).trim();
    return output === version;
  } catch {
    return false;
  }
}

function alreadyPublished(result: CommandResult): boolean {
  const combinedOutput = `${result.stdout}\n${result.stderr}`;

  return /cannot publish over|previously published versions|cannot modify pre-existing version|EPUBLISHCONFLICT/i.test(
    combinedOutput
  );
}

function publishArgs(publishTag: string): string[] {
  return [
    'publish',
    '--provenance',
    '--tag',
    publishTag,
    '--registry',
    'https://registry.npmjs.org/',
  ];
}

function publishPackage(
  packageDir: string,
  packageName: string,
  version: string,
  publishTag: string
): void {
  if (versionExists(packageName, version)) {
    process.stdout.write(
      `Skipping existing package: ${packageName}@${version}\n`
    );
    return;
  }

  const publishResult = runResult(
    commandName('npm'),
    publishArgs(publishTag),
    packageDir,
    'inherit'
  );

  if (publishResult.status === 0) {
    return;
  }

  if (alreadyPublished(publishResult) || versionExists(packageName, version)) {
    process.stdout.write(
      `Treating already-published package as success: ${packageName}@${version}\n`
    );
    return;
  }

  throw new Error(
    `npm publish failed with ${String(publishResult.status)}\n${
      publishResult.stdout
    }${publishResult.stderr}`
  );
}

function buildBinding(target: string, config: BindingTarget): void {
  run(
    commandName('cargo'),
    ['build', '--release', '-p', 'fft_node', '--target', target],
    process.cwd(),
    'inherit'
  );

  const sourcePath = join('target', target, 'release', config.libraryFileName);
  if (!existsSync(sourcePath)) {
    throw new Error(`Expected build artifact not found at ${sourcePath}`);
  }

  copyFileSync(sourcePath, join(config.packageDir, config.bindingFileName));
}

function resolveTarget(target: string): BindingTarget {
  const config = TARGETS[target];

  if (!config) {
    throw new Error(`Unsupported target: ${target}`);
  }

  return config;
}

function main(): void {
  const target = requiredFlag('--target');
  const publishTag = optionalFlag('--tag') ?? 'latest';
  const config = resolveTarget(target);

  buildBinding(target, config);
  const manifest = manifestFor(config.packageDir);
  publishPackage(
    config.packageDir,
    manifest.name,
    manifest.version,
    publishTag
  );
}

main();
