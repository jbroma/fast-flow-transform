import { mergeSourceMaps } from './mergeSourceMaps.js';
import { runNativeTransform } from './nativeTransform.js';
import { parseOptions } from './options.js';
import { resolveBinaryPath } from './resolveBinary.js';
import type {
  NativeErrorLike,
  NativeTransformRequest,
  SourceMapLike,
  TransformInput,
  TransformOptions,
  TransformOptionsInput,
  TransformResult,
} from './types.js';

function sourceText(source: string | Buffer): string {
  return Buffer.isBuffer(source) ? source.toString('utf8') : String(source);
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
      : 'Unknown fft-strip native error';

  return `fft-strip transform failed${location}: ${message}`;
}

function toTransformError(error: unknown, filename: string): Error {
  if (error instanceof Error) {
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
    code: sourceText(input.source),
    dialect: options.dialect,
    enumRuntimeModule: options.enumRuntimeModule,
    filename: input.filename,
    format: options.format,
    reactRuntimeTarget: options.reactRuntimeTarget,
  };
}

function outputMap(
  options: TransformOptions,
  inputSourceMap: SourceMapLike | null | undefined,
  nativeMap: SourceMapLike,
  filename: string
): SourceMapLike | undefined {
  if (!options.sourcemap) {
    return undefined;
  }

  return inputSourceMap
    ? mergeSourceMaps(inputSourceMap, nativeMap, filename)
    : nativeMap;
}

export async function transform(
  input: TransformInput
): Promise<TransformResult> {
  const options = parseOptions(input as TransformOptionsInput);
  const binaryPath = resolveBinaryPath();

  try {
    const result = await runNativeTransform(
      binaryPath,
      transformRequest(input, options)
    );
    const map = outputMap(
      options,
      input.inputSourceMap,
      result.map,
      input.filename
    );

    return map ? { code: result.code, map } : { code: result.code };
  } catch (error) {
    throw toTransformError(error, input.filename);
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
