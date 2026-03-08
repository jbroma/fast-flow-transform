import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function benchmarkDirectory(): string {
  return fileURLToPath(new URL('.', import.meta.url));
}

export function workspaceBinaryPath(
  platform: string = process.platform
): string {
  const executable = platform === 'win32' ? 'fft-strip.exe' : 'fft-strip';
  return resolve(benchmarkDirectory(), '..', 'target', 'release', executable);
}

export function configureBenchmarkBinary(
  env: NodeJS.ProcessEnv = process.env,
  pathExists: (path: string) => boolean = existsSync
): string | null {
  if (env.FFT_STRIP_BINARY) {
    return null;
  }

  const binaryPath = workspaceBinaryPath();
  if (!pathExists(binaryPath)) {
    return null;
  }

  env.FFT_STRIP_BINARY = binaryPath;
  return binaryPath;
}
