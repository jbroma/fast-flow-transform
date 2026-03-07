import { spawn } from 'node:child_process';

import type {
  NativeTransformRequest,
  NativeTransformResult,
  SourceMapLike,
} from './types.js';

type NativeResponse =
  | { code: string; map: SourceMapLike; ok: true }
  | { error?: unknown; ok?: false };

function parseNativeResponse(
  stdout: string,
  stderr: string
): NativeTransformResult {
  let response: NativeResponse;

  try {
    response = JSON.parse(stdout) as NativeResponse;
  } catch (error) {
    throw new Error(
      `fft-strip worker emitted invalid JSON: ${String(error)}${stderr}`,
      { cause: error }
    );
  }

  if (!response.ok) {
    throw (
      response.error ?? new Error(`Unknown fft-strip worker error${stderr}`)
    );
  }

  return {
    code: response.code,
    map: response.map,
  };
}

function stderrSummary(stderr: string): string {
  return stderr ? `\nStderr:\n${stderr}` : '';
}

export function runNativeTransform(
  binaryPath: string,
  request: NativeTransformRequest
): Promise<NativeTransformResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let settled = false;
    let stdout = '';
    let stderr = '';

    const finish = (result: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      result();
    };

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      finish(() => reject(error));
    });
    child.on('close', (code) => {
      finish(() => {
        if (code !== 0) {
          reject(
            new Error(
              `fft-strip worker exited with code ${String(code)}${stderrSummary(stderr)}`
            )
          );
          return;
        }

        try {
          resolve(parseNativeResponse(stdout.trim(), stderrSummary(stderr)));
        } catch (error) {
          reject(error);
        }
      });
    });

    child.stdin.end(`${JSON.stringify({ ...request, id: 1 })}\n`);
  });
}
