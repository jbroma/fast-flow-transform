import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';

import { mergeSourceMaps } from './mergeSourceMaps.js';
import { parseOptions, stableOptionsKey } from './options.js';
import { packageVersion } from './packageVersion.js';
import { getPool } from './pool.js';
import { resolveBinaryPath } from './resolveBinary.js';
import type {
  LoaderOptions,
  LoaderOptionsInput,
  NativeErrorLike,
  SourceMapLike,
  TransformRequest,
  TransformResult,
} from './types.js';

type LoaderCallback = (
  error: Error | null,
  code?: string,
  map?: SourceMapLike | null,
  meta?: unknown
) => void;

interface LoaderContext {
  async(): LoaderCallback;
  cacheable?: (cacheable?: boolean) => void;
  getOptions?: () => LoaderOptionsInput;
  query?: LoaderOptionsInput;
  resourcePath?: string;
}

interface LoaderState {
  binaryPath: string;
  cacheKey: string;
  options: LoaderOptions;
}

const BINARY_VERSION_CACHE = new Map<string, string>();
const TRANSFORM_CACHE = new Map<string, TransformResult>();

function stableMapKey(inputMap: SourceMapLike | null | undefined): string {
  return inputMap ? JSON.stringify(inputMap) : 'null';
}

function binaryVersion(binaryPath: string): string {
  const cachedVersion = BINARY_VERSION_CACHE.get(binaryPath);
  if (cachedVersion) {
    return cachedVersion;
  }

  const stat = statSync(binaryPath);
  const version = `${packageVersion()}:${binaryPath}:${String(stat.size)}:${String(stat.mtimeMs)}`;

  BINARY_VERSION_CACHE.set(binaryPath, version);
  return version;
}

export function buildCacheKey({
  binarySignature,
  code,
  filename,
  inputSourceMap,
  options,
}: {
  binarySignature: string;
  code: string;
  filename: string;
  inputSourceMap: SourceMapLike | null | undefined;
  options: LoaderOptions;
}): string {
  return createHash('sha256')
    .update(code)
    .update('\0')
    .update(filename)
    .update('\0')
    .update(stableOptionsKey(options))
    .update('\0')
    .update(binarySignature)
    .update('\0')
    .update(stableMapKey(inputSourceMap))
    .digest('hex');
}

function loaderErrorMessage(
  nativeError: NativeErrorLike,
  resourcePath: string
): string {
  const hasLocation =
    typeof nativeError.line === 'number' &&
    typeof nativeError.column === 'number';
  const location = hasLocation
    ? ` (${resourcePath}:${String(nativeError.line)}:${String(nativeError.column)})`
    : '';
  const message =
    typeof nativeError.message === 'string'
      ? nativeError.message
      : 'Unknown fft-strip native error';

  return `fft-strip transform failed${location}: ${message}`;
}

function toLoaderError(nativeError: unknown, resourcePath: string): Error {
  if (nativeError instanceof Error) {
    return nativeError;
  }

  return new Error(
    loaderErrorMessage((nativeError ?? {}) as NativeErrorLike, resourcePath)
  );
}

function rawLoaderOptions(loaderContext: LoaderContext): LoaderOptionsInput {
  if (typeof loaderContext.getOptions === 'function') {
    return loaderContext.getOptions() ?? {};
  }

  if (loaderContext.query && typeof loaderContext.query === 'object') {
    return loaderContext.query;
  }

  return {};
}

function transformRequest(
  resourcePath: string,
  code: string,
  options: LoaderOptions
): TransformRequest {
  return {
    code,
    dialect: options.dialect,
    enumRuntimeModule: options.enumRuntimeModule,
    filename: resourcePath,
    format: options.format,
    reactRuntimeTarget: options.reactRuntimeTarget,
  };
}

function withCallbackResult<T>(
  callback: LoaderCallback,
  operation: () => T
): T | null {
  try {
    return operation();
  } catch (error) {
    callback(error as Error);
    return null;
  }
}

function loaderState(
  loaderContext: LoaderContext,
  callback: LoaderCallback,
  code: string,
  resourcePath: string,
  inputSourceMap: SourceMapLike | null | undefined
): LoaderState | null {
  const options = withCallbackResult(callback, () =>
    parseOptions(rawLoaderOptions(loaderContext))
  );
  const binaryPath = withCallbackResult(callback, resolveBinaryPath);

  if (!options || !binaryPath) {
    return null;
  }

  const cacheKey = withCallbackResult(callback, () =>
    buildCacheKey({
      binarySignature: binaryVersion(binaryPath),
      code,
      filename: resourcePath,
      inputSourceMap,
      options,
    })
  );

  if (!cacheKey) {
    return null;
  }

  return { binaryPath, cacheKey, options };
}

function cachedTransform(cacheKey: string): TransformResult | undefined {
  return TRANSFORM_CACHE.get(cacheKey);
}

async function transformAndCache(
  request: TransformRequest,
  inputSourceMap: SourceMapLike | null | undefined,
  resourcePath: string,
  cacheKey: string,
  threads: number | undefined,
  binaryPath: string
): Promise<TransformResult> {
  const nativeResult = await getPool(binaryPath, threads).transform(request);
  const result = {
    code: nativeResult.code,
    map: mergeSourceMaps(inputSourceMap, nativeResult.map, resourcePath),
  };

  TRANSFORM_CACHE.set(cacheKey, result);
  return result;
}

function sourceText(source: string | Buffer): string {
  return Buffer.isBuffer(source) ? source.toString('utf8') : String(source);
}

function callbackWithCachedResult(
  callback: LoaderCallback,
  cachedResult: TransformResult,
  meta: unknown
): void {
  callback(null, cachedResult.code, cachedResult.map, meta);
}

function handleCachedResult(
  callback: LoaderCallback,
  cacheKey: string,
  meta: unknown
): boolean {
  const cachedResult = cachedTransform(cacheKey);
  if (!cachedResult) {
    return false;
  }

  callbackWithCachedResult(callback, cachedResult, meta);
  return true;
}

function loaderRuntime(context: LoaderContext): {
  callback: LoaderCallback;
  resourcePath: string;
} {
  return {
    callback: context.async(),
    resourcePath: context.resourcePath ?? '<unknown>',
  };
}

function requestTransform(
  callback: LoaderCallback,
  state: LoaderState,
  code: string,
  inputSourceMap: SourceMapLike | null | undefined,
  meta: unknown,
  resourcePath: string
): void {
  transformAndCache(
    transformRequest(resourcePath, code, state.options),
    inputSourceMap,
    resourcePath,
    state.cacheKey,
    state.options.threads,
    state.binaryPath
  )
    .then((result) => {
      callback(null, result.code, result.map, meta);
    })
    .catch((error) => {
      callback(toLoaderError(error, resourcePath));
    });
}

function flowStripLoader(
  this: LoaderContext,
  source: string | Buffer,
  inputSourceMap: SourceMapLike | null | undefined,
  meta: unknown
): void {
  const { callback, resourcePath } = loaderRuntime(this);

  this.cacheable?.(true);

  const code = sourceText(source);
  const state = loaderState(this, callback, code, resourcePath, inputSourceMap);
  if (!state) {
    return;
  }

  if (handleCachedResult(callback, state.cacheKey, meta)) {
    return;
  }

  requestTransform(callback, state, code, inputSourceMap, meta, resourcePath);
}

export default flowStripLoader;

export const _internal = {
  buildCacheKey,
  mergeSourceMaps,
  parseOptions,
};
