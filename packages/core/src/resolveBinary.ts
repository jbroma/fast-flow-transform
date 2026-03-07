import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const STAGED_BINARY_CACHE = new Map<string, string>();

function executableNameFor(platform: string): string {
  return platform === 'win32' ? 'fft-strip.exe' : 'fft-strip';
}

function moduleDirectory(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function packageBinaryPathFromEntryPath(entryPath: string): string {
  return resolve(
    entryPath,
    '..',
    '..',
    'bin',
    executableNameFor(process.platform)
  );
}

function stagedBinaryPath(cacheKey: string): string {
  const extension = process.platform === 'win32' ? '.exe' : '';
  const fingerprint = createHash('sha256')
    .update(cacheKey)
    .digest('hex')
    .slice(0, 24);

  return join(
    tmpdir(),
    'fast-flow-transform',
    `fft-strip-${fingerprint}${extension}`
  );
}

function ensureExecutablePermissions(binaryPath: string): void {
  if (process.platform !== 'win32') {
    chmodSync(binaryPath, 0o755);
  }
}

function binaryCacheKey(binaryPath: string): string {
  const stat = statSync(binaryPath);
  return `${binaryPath}:${String(stat.size)}:${String(stat.mtimeMs)}`;
}

function cachedStagedBinaryPath(cacheKey: string): string | null {
  const cachedPath = STAGED_BINARY_CACHE.get(cacheKey);
  if (cachedPath && existsSync(cachedPath)) {
    return cachedPath;
  }

  return null;
}

function createStagedBinary(binaryPath: string, cacheKey: string): string {
  const stagedPath = stagedBinaryPath(cacheKey);
  mkdirSync(dirname(stagedPath), { recursive: true });

  if (!existsSync(stagedPath)) {
    writeFileSync(stagedPath, readFileSync(binaryPath));
  }

  ensureExecutablePermissions(stagedPath);
  STAGED_BINARY_CACHE.set(cacheKey, stagedPath);
  return stagedPath;
}

function stageBinaryForExecution(binaryPath: string): string {
  if (process.env.FFT_STRIP_DISABLE_STAGING === '1') {
    return binaryPath;
  }

  const cacheKey = binaryCacheKey(binaryPath);
  return (
    cachedStagedBinaryPath(cacheKey) ?? createStagedBinary(binaryPath, cacheKey)
  );
}

function existingBinary(binaryPath: string): string | null {
  return existsSync(binaryPath) ? binaryPath : null;
}

export function platformPackageNameFor(
  platform: string,
  arch: string
): string | null {
  switch (`${platform}-${arch}`) {
    case 'darwin-arm64': {
      return 'fast-flow-transform-darwin-arm64';
    }
    case 'darwin-x64': {
      return 'fast-flow-transform-darwin-x64';
    }
    case 'linux-arm64': {
      return 'fast-flow-transform-linux-arm64';
    }
    case 'linux-x64': {
      return 'fast-flow-transform-linux-x64';
    }
    case 'win32-arm64': {
      return 'fast-flow-transform-win32-arm64';
    }
    case 'win32-x64': {
      return 'fast-flow-transform-win32-x64';
    }
    default: {
      return null;
    }
  }
}

function resolveFromOptionalPackage(): string | null {
  const packageName = platformPackageNameFor(process.platform, process.arch);
  if (!packageName) {
    return null;
  }

  try {
    const entryPath = require.resolve(packageName);
    return existingBinary(packageBinaryPathFromEntryPath(entryPath));
  } catch {
    return null;
  }
}

function resolveFromWorkspaceBuild(): string | null {
  return existingBinary(
    resolve(
      moduleDirectory(),
      '../../../target/release',
      executableNameFor(process.platform)
    )
  );
}

function resolveFromBundledBinary(): string | null {
  return existingBinary(
    resolve(moduleDirectory(), '..', 'bin', executableNameFor(process.platform))
  );
}

function resolveBinaryFromEnvironment(): string | null {
  const binaryPath = process.env.FFT_STRIP_BINARY;
  if (!binaryPath) {
    return null;
  }

  if (!existsSync(binaryPath)) {
    throw new Error(`FFT_STRIP_BINARY points to a missing file: ${binaryPath}`);
  }

  return binaryPath;
}

function unresolvedBinaryError(): Error {
  return new Error(
    `Unable to resolve fft-strip binary for ${process.platform}-${process.arch}. ` +
      'Install the matching optional package or set FFT_STRIP_BINARY.'
  );
}

export function resolveBinaryPath(): string {
  const binaryPath =
    resolveBinaryFromEnvironment() ??
    resolveFromOptionalPackage() ??
    resolveFromBundledBinary() ??
    resolveFromWorkspaceBuild();

  if (!binaryPath) {
    throw unresolvedBinaryError();
  }

  return stageBinaryForExecution(binaryPath);
}
