'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const PLATFORM_PACKAGE_BY_TARGET = {
  'darwin-arm64': 'fft-loader-darwin-arm64',
  'darwin-x64': 'fft-loader-darwin-x64',
  'linux-arm64': 'fft-loader-linux-arm64',
  'linux-x64': 'fft-loader-linux-x64',
  'win32-arm64': 'fft-loader-win32-arm64',
  'win32-x64': 'fft-loader-win32-x64',
};

function run(command, args, cwd) {
  const result = childProcess.spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed (${String(result.status)}): ${command} ${args.join(' ')}`
    );
  }
}

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function copyBinary(binaryPath, targetDir) {
  ensureDirectory(targetDir);
  const filename = path.basename(binaryPath);
  const destinationPath = path.join(targetDir, filename);
  fs.copyFileSync(binaryPath, destinationPath);
  if (process.platform !== 'win32') {
    fs.chmodSync(destinationPath, 0o755);
  }
  return destinationPath;
}

function getWorkspaceContext() {
  const loaderPackageRoot = path.resolve(__dirname, '..');
  const workspacePackagesRoot = path.resolve(loaderPackageRoot, '..');
  const workspaceRoot = path.resolve(workspacePackagesRoot, '..');
  const platformPackagesRoot = path.join(workspaceRoot, 'bindings');
  const targetKey = `${process.platform}-${process.arch}`;

  const platformPackageName = PLATFORM_PACKAGE_BY_TARGET[targetKey];
  if (platformPackageName == null) {
    throw new Error(`Unsupported local packaging target: ${targetKey}`);
  }

  return {
    loaderPackageRoot,
    platformPackageRoot: path.join(platformPackagesRoot, platformPackageName),
    targetKey,
    workspaceRoot,
  };
}

function resolveBuiltBinaryPath(workspaceRoot, targetKey) {
  const binaryName =
    process.platform === 'win32' ? 'fft-strip.exe' : 'fft-strip';
  const defaultBuiltBinaryPath = path.join(
    workspaceRoot,
    'target',
    'release',
    binaryName
  );
  const overrideBinaryPath = process.env.FFT_STRIP_BINARY;
  const builtBinaryPath =
    overrideBinaryPath != null && overrideBinaryPath.length > 0
      ? overrideBinaryPath
      : defaultBuiltBinaryPath;

  if (overrideBinaryPath == null || overrideBinaryPath.length === 0) {
    process.stdout.write(`Building native binary for ${targetKey}...\n`);
    run('cargo', ['build', '--release', '-p', 'fft_strip'], workspaceRoot);
  } else {
    process.stdout.write(`Using existing native binary: ${builtBinaryPath}\n`);
  }

  return builtBinaryPath;
}

function printTarballSummary(tarballs) {
  process.stdout.write('\nCreated tarballs:\n');
  for (const tarball of tarballs) {
    process.stdout.write(`- ${tarball}\n`);
  }

  process.stdout.write('\nInstall in another project with:\n');
  process.stdout.write(
    `npm install ${tarballs.map((p) => `'${p}'`).join(' ')}\n`
  );
}

function main() {
  const { loaderPackageRoot, platformPackageRoot, targetKey, workspaceRoot } =
    getWorkspaceContext();
  const builtBinaryPath = resolveBuiltBinaryPath(workspaceRoot, targetKey);
  if (!fs.existsSync(builtBinaryPath)) {
    throw new Error(`Expected built binary not found at ${builtBinaryPath}`);
  }

  const platformBinaryPath = copyBinary(
    builtBinaryPath,
    path.join(platformPackageRoot, 'bin')
  );
  const loaderBinaryPath = copyBinary(
    builtBinaryPath,
    path.join(loaderPackageRoot, 'bin')
  );

  process.stdout.write(`Copied binary to: ${platformBinaryPath}\n`);
  process.stdout.write(`Copied binary to: ${loaderBinaryPath}\n`);

  run('node', [path.join('scripts', 'build-dist.js')], loaderPackageRoot);

  const outputDir = path.join(loaderPackageRoot, 'artifacts');
  ensureDirectory(outputDir);

  process.stdout.write('Packing platform package tarball...\n');
  run('npm', ['pack', '--pack-destination', outputDir], platformPackageRoot);

  process.stdout.write('Packing loader package tarball...\n');
  run('npm', ['pack', '--pack-destination', outputDir], loaderPackageRoot);

  const tarballs = fs
    .readdirSync(outputDir)
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => path.join(outputDir, name));

  printTarballSummary(tarballs);
}

main();
