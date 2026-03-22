import { mergeSourceMaps } from './mergeSourceMaps.js';
import { loadNativeBinding } from './nativeBinding.js';
import { parseOptions } from './options.js';
import type {
  NativeErrorLike,
  NativeTransformRequest,
  SourceMapLike,
  TransformInput,
  TransformOptions,
  TransformOptionsInput,
  TransformResult,
} from './types.js';

const UNKNOWN_FILENAME = '<unknown>';

function sourceText(source: string | Buffer): string {
  return Buffer.isBuffer(source) ? source.toString('utf8') : String(source);
}

function resolvedFilename(filename: string | undefined): string {
  return filename ?? UNKNOWN_FILENAME;
}

function transformErrorMessage(
  nativeError: NativeErrorLike,
  filename: string
): string {
  const hasLocation =
    typeof nativeError.line === 'number' &&
    typeof nativeError.column === 'number';
  const location = hasLocation
    ? ` (${filename}:${String(nativeError.line)}:${String(nativeError.column)})`
    : '';
  const message =
    typeof nativeError.message === 'string'
      ? nativeError.message
      : 'Unknown fast-flow-transform native error';

  return `fast-flow-transform native transform failed${location}: ${message}`;
}

function toTransformError(error: unknown, filename: string): Error {
  if (error instanceof Error) {
    const nativeError = error as Error & NativeErrorLike;
    if (
      typeof nativeError.line === 'number' ||
      typeof nativeError.column === 'number'
    ) {
      return new Error(transformErrorMessage(nativeError, filename), {
        cause: error,
      });
    }

    return error;
  }

  return new Error(
    transformErrorMessage((error ?? {}) as NativeErrorLike, filename)
  );
}

function transformRequest(
  input: TransformInput,
  options: TransformOptions
): NativeTransformRequest {
  return {
    comments: options.comments,
    code: sourceText(input.source),
    dialect: options.dialect,
    filename: resolvedFilename(input.filename),
    format: options.format,
    removeEmptyImports: options.removeEmptyImports,
    reactRuntimeTarget: options.reactRuntimeTarget,
    sourcemap: options.sourcemap,
  };
}

async function outputMap(
  options: TransformOptions,
  inputSourceMap: SourceMapLike | null | undefined,
  nativeMap: SourceMapLike | undefined,
  filename: string
): Promise<SourceMapLike | undefined> {
  if (!options.sourcemap) {
    return undefined;
  }

  if (!nativeMap) {
    throw new Error('Native transform completed without a source map.');
  }

  return inputSourceMap
    ? await mergeSourceMaps(inputSourceMap, nativeMap, filename)
    : nativeMap;
}

export async function transform(
  input: TransformInput
): Promise<TransformResult> {
  const options = parseOptions(input as TransformOptionsInput);
  const filename = resolvedFilename(input.filename);
  const request = transformRequest(input, options);
  const nativeBinding = loadNativeBinding();

  try {
    const result = await nativeBinding.transform(request);
    const map = await outputMap(
      options,
      input.inputSourceMap,
      result.map,
      filename
    );

    return map ? { code: result.code, map } : { code: result.code };
  } catch (error) {
    throw toTransformError(error, filename);
  }
}

export default transform;

export type {
  Dialect,
  Format,
  ReactRuntimeTarget,
  SourceMapLike,
  TransformInput,
  TransformOptions,
  TransformOptionsInput,
  TransformResult,
} from './types.js';
