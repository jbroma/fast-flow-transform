import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';

const CARGO_MANIFEST_PATHS = [
  'crates/fft/Cargo.toml',
  'crates/fft_ast/Cargo.toml',
  'crates/fft_node/Cargo.toml',
  'crates/fft_pass/Cargo.toml',
  'crates/fft_support/Cargo.toml',
  'crates/hermes/Cargo.toml',
];
const BINDING_ENTRY_PATH = 'packages/core/binding/bindings.cjs';

interface PackageManifest {
  version: string;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function gitOutput(args: string[]): string {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed with ${String(result.status)}\n${
        result.stdout ?? ''
      }${result.stderr ?? ''}`
    );
  }

  return (result.stdout ?? '').trim();
}

function writeOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  appendFileSync(outputPath, `${name}=${value}\n`);
}

function readPackageManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
}

function writePackageManifest(path: string, manifest: PackageManifest): void {
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function compactCommitTimestamp(): string {
  const epochSeconds = gitOutput(['log', '-1', '--format=%ct', 'HEAD']);
  const timestamp = Number.parseInt(epochSeconds, 10);

  if (Number.isNaN(timestamp)) {
    throw new TypeError(`Invalid commit timestamp: ${epochSeconds}`);
  }

  return new Date(timestamp * 1000)
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace('T', 't')
    .replace('.', '')
    .replace('Z', 'z');
}

function canaryVersion(baseVersion: string): string {
  const shortSha = gitOutput(['rev-parse', '--short=12', 'HEAD']);
  return `${baseVersion}-canary.${compactCommitTimestamp()}.${shortSha}`;
}

function releaseVersion(): string {
  const { version } = readPackageManifest('packages/core/package.json');
  return hasFlag('--canary') ? canaryVersion(version) : version;
}

function updateCoreManifest(version: string): void {
  const manifest = readPackageManifest('packages/core/package.json');
  manifest.version = version;
  writePackageManifest('packages/core/package.json', manifest);
}

function rewriteBindingWrapperVersion(source: string, version: string): string {
  return source
    .replaceAll(/(bindingPackageVersion !== )'[^']+'/g, `$1'${version}'`)
    .replaceAll(
      /(expected )[^ ]+( but got \$\{bindingPackageVersion\})/g,
      `$1${version}$2`
    );
}

function updateBindingWrapper(version: string): void {
  if (!existsSync(BINDING_ENTRY_PATH)) {
    return;
  }

  const source = readFileSync(BINDING_ENTRY_PATH, 'utf8');
  const nextSource = rewriteBindingWrapperVersion(source, version);

  if (source === nextSource) {
    return;
  }

  writeFileSync(BINDING_ENTRY_PATH, nextSource);
}

function runNapiVersion(): void {
  const result = spawnSync(
    'pnpm',
    [
      '--dir',
      'packages/core',
      'exec',
      'napi',
      'version',
      '--package-json-path',
      'package.json',
      '--npm-dir',
      '../../bindings',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: 'inherit',
    }
  );

  if (result.status !== 0) {
    throw new Error(`pnpm napi version failed with ${String(result.status)}`);
  }
}

function updateCargoManifest(path: string, version: string): void {
  const source = readFileSync(path, 'utf8');
  const nextSource = source.replace(
    /^(\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m,
    `$1"${version}"`
  );

  if (source === nextSource) {
    throw new Error(`Unable to update package version in ${path}`);
  }

  writeFileSync(path, nextSource);
}

function main(): void {
  const version = releaseVersion();

  updateCoreManifest(version);
  runNapiVersion();
  updateBindingWrapper(version);

  for (const path of CARGO_MANIFEST_PATHS) {
    updateCargoManifest(path, version);
  }

  writeOutput('release_version', version);
}

main();
