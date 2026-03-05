'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PLATFORM_PACKAGES = {
  'darwin-arm64': 'fft-loader-darwin-arm64',
  'darwin-x64': 'fft-loader-darwin-x64',
  'linux-arm64': 'fft-loader-linux-arm64',
  'linux-x64': 'fft-loader-linux-x64',
  'win32-arm64': 'fft-loader-win32-arm64',
  'win32-x64': 'fft-loader-win32-x64',
};

const STAGED_BINARY_CACHE = new Map();

function normalizeBinaryPath(candidate) {
  if (typeof candidate === 'string') {
    return candidate;
  }
  if (candidate != null && typeof candidate.binaryPath === 'string') {
    return candidate.binaryPath;
  }
  return null;
}

function stageBinaryForExecution(binaryPath) {
  if (process.env.FFT_STRIP_DISABLE_STAGING === '1') {
    return binaryPath;
  }

  const stat = fs.statSync(binaryPath);
  const cacheKey = `${binaryPath}:${String(stat.size)}:${String(stat.mtimeMs)}`;
  const cached = STAGED_BINARY_CACHE.get(cacheKey);
  if (cached != null && fs.existsSync(cached)) {
    return cached;
  }

  const stagedDirectory = path.join(os.tmpdir(), 'fft-loader');
  fs.mkdirSync(stagedDirectory, {recursive: true});

  const extension = process.platform === 'win32' ? '.exe' : '';
  const fingerprint = crypto
    .createHash('sha256')
    .update(cacheKey)
    .digest('hex')
    .slice(0, 24);
  const stagedPath = path.join(
    stagedDirectory,
    `fft-strip-${fingerprint}${extension}`,
  );

  if (!fs.existsSync(stagedPath)) {
    const bytes = fs.readFileSync(binaryPath);
    fs.writeFileSync(stagedPath, bytes);
  }

  if (process.platform !== 'win32') {
    fs.chmodSync(stagedPath, 0o755);
  }

  STAGED_BINARY_CACHE.set(cacheKey, stagedPath);
  return stagedPath;
}

function resolveFromOptionalPackage() {
  const packageName = PLATFORM_PACKAGES[`${process.platform}-${process.arch}`];
  if (packageName == null) {
    return null;
  }

  try {
    const exported = require(packageName);
    const binaryPath = normalizeBinaryPath(exported);
    if (binaryPath != null && fs.existsSync(binaryPath)) {
      return binaryPath;
    }
  } catch (_error) {
    // Optional package may not be installed for the current platform.
  }

  return null;
}

function resolveFromWorkspaceBuild() {
  const executableName =
    process.platform === 'win32' ? 'fft-strip.exe' : 'fft-strip';
  const localPath = path.resolve(
    __dirname,
    '../../../target/release',
    executableName,
  );
  if (fs.existsSync(localPath)) {
    return localPath;
  }
  return null;
}

function resolveFromBundledBinary() {
  const executableName =
    process.platform === 'win32' ? 'fft-strip.exe' : 'fft-strip';
  const bundledPath = path.resolve(__dirname, '..', 'bin', executableName);
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }
  return null;
}

function resolveBinaryPath() {
  const fromEnv = process.env.FFT_STRIP_BINARY;
  if (fromEnv != null && fromEnv.length > 0) {
    if (!fs.existsSync(fromEnv)) {
      throw new Error(
        `FFT_STRIP_BINARY points to a missing file: ${fromEnv}`,
      );
    }
    return stageBinaryForExecution(fromEnv);
  }

  const fromPackage = resolveFromOptionalPackage();
  if (fromPackage != null) {
    return stageBinaryForExecution(fromPackage);
  }

  const fromBundled = resolveFromBundledBinary();
  if (fromBundled != null) {
    return stageBinaryForExecution(fromBundled);
  }

  const fromWorkspace = resolveFromWorkspaceBuild();
  if (fromWorkspace != null) {
    return stageBinaryForExecution(fromWorkspace);
  }

  throw new Error(
    `Unable to resolve fft-strip binary for ${process.platform}-${process.arch}. ` +
      'Install matching optional package or set FFT_STRIP_BINARY.',
  );
}

module.exports = {
  resolveBinaryPath,
};
