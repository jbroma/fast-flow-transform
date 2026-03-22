import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  NativeTransformRequest,
  NativeTransformResult,
  SourceMapLike,
} from './types.js';

const require = createRequire(import.meta.url);
const moduleDirectory = fileURLToPath(new URL('.', import.meta.url));

export interface NativeBinding {
  transform(
    input: NativeTransformRequest
  ): NativeTransformResult | Promise<NativeTransformResult>;
}

let cachedBinding: NativeBinding | null | undefined;

interface RawNativeBindingRequest {
  comments: boolean;
  code: string;
  dialect: string;
  filename: string;
  format: string;
  removeEmptyImports: boolean;
  reactRuntimeTarget: string;
  sourcemap: boolean;
}

interface RawNativeBindingResponse {
  code?: string;
  errorColumn?: number | null;
  errorLine?: number | null;
  errorMessage?: string | null;
  mapJson?: string | null;
  ok?: boolean;
}

interface RawNativeBinding {
  transform(
    input: RawNativeBindingRequest
  ): RawNativeBindingResponse | Promise<RawNativeBindingResponse>;
}

function toRawBinding(value: unknown): RawNativeBinding {
  const binding = (value as { default?: unknown } | null)?.default ?? value;
  const transform = (binding as { transform?: unknown } | null)?.transform;

  if (typeof transform !== 'function') {
    throw new TypeError('FFT native binding did not expose a transform method');
  }

  return binding as RawNativeBinding;
}

function normalizeRequest(
  input: NativeTransformRequest
): RawNativeBindingRequest {
  return {
    comments: input.comments,
    code: input.code,
    dialect: input.dialect,
    filename: input.filename,
    format: input.format,
    removeEmptyImports: input.removeEmptyImports,
    reactRuntimeTarget: input.reactRuntimeTarget,
    sourcemap: input.sourcemap,
  };
}

function createBindingError(response: RawNativeBindingResponse): Error {
  const error = new Error(
    response.errorMessage ?? 'Unknown fft native binding error'
  ) as Error & { column?: number; line?: number };

  if (typeof response.errorColumn === 'number') {
    error.column = response.errorColumn;
  }
  if (typeof response.errorLine === 'number') {
    error.line = response.errorLine;
  }

  return error;
}

function parseBindingMap(
  response: RawNativeBindingResponse
): SourceMapLike | undefined {
  return typeof response.mapJson === 'string'
    ? (JSON.parse(response.mapJson) as SourceMapLike)
    : undefined;
}

function normalizeResponse(
  response: RawNativeBindingResponse
): NativeTransformResult {
  if (!response.ok) {
    throw createBindingError(response);
  }

  if (typeof response.code !== 'string') {
    throw new TypeError('FFT native binding produced no code output');
  }

  const map = parseBindingMap(response);
  return map ? { code: response.code, map } : { code: response.code };
}

function toNativeBinding(value: unknown): NativeBinding {
  const binding = toRawBinding(value);

  return {
    async transform(input) {
      const response = await binding.transform(normalizeRequest(input));
      return normalizeResponse(response);
    },
  };
}

function bindingRuntimePath(): string {
  const packageRoot = resolve(moduleDirectory, '..', '..');
  const runtimePath = join(packageRoot, 'binding', 'bindings.cjs');

  if (!existsSync(runtimePath)) {
    throw new Error(
      `Unable to resolve generated FFT binding loader at ${runtimePath}`
    );
  }

  return runtimePath;
}

export function loadNativeBinding(): NativeBinding {
  if (cachedBinding) {
    return cachedBinding;
  }

  cachedBinding = toNativeBinding(require(bindingRuntimePath()));
  return cachedBinding;
}
