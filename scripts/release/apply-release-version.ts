import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const BINDING_PACKAGES = [
  'fast-flow-transform-darwin-arm64',
  'fast-flow-transform-darwin-x64',
  'fast-flow-transform-linux-arm64',
  'fast-flow-transform-linux-x64',
  'fast-flow-transform-win32-arm64',
  'fast-flow-transform-win32-x64',
];

const CARGO_MANIFEST_PATHS = [
  'crates/fft/Cargo.toml',
  'crates/fft_ast/Cargo.toml',
  'crates/fft_node/Cargo.toml',
  'crates/fft_pass/Cargo.toml',
  'crates/fft_support/Cargo.toml',
  'crates/hermes/Cargo.toml',
];

function writeOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  appendFileSync(outputPath, `${name}=${value}\n`);
}

function readCoreManifest(): {
  optionalDependencies?: Record<string, string>;
  version: string;
} {
  return JSON.parse(readFileSync('packages/core/package.json', 'utf8')) as {
    optionalDependencies?: Record<string, string>;
    version: string;
  };
}

function writeCoreManifest(version: string): void {
  const manifest = readCoreManifest();
  manifest.optionalDependencies = Object.fromEntries(
    BINDING_PACKAGES.map((packageName) => [packageName, version])
  );

  writeFileSync(
    'packages/core/package.json',
    `${JSON.stringify(manifest, null, 2)}\n`
  );
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
  const { version } = readCoreManifest();

  writeCoreManifest(version);

  for (const path of CARGO_MANIFEST_PATHS) {
    updateCargoManifest(path, version);
  }

  writeOutput('release_version', version);
}

main();
