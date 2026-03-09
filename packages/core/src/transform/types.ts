import type { RawSourceMap } from 'source-map';

export type Dialect = 'flow' | 'flow-detect' | 'flow-unambiguous';
export type Format = 'compact' | 'pretty';
export type ReactRuntimeTarget = '18' | '19';
export type SourceMapLike = RawSourceMap;

export interface TransformOptions {
  dialect: Dialect;
  enumRuntimeModule: string;
  format: Format;
  preserveComments: boolean;
  preserveWhitespace: boolean;
  reactRuntimeTarget: ReactRuntimeTarget;
  sourcemap: boolean;
}

export type TransformOptionsInput = Partial<TransformOptions> & {
  reactRuntimeTarget?: number | string;
};

export interface TransformInput extends TransformOptionsInput {
  filename: string;
  inputSourceMap?: SourceMapLike | null;
  source: string | Buffer;
}

export interface TransformResult {
  code: string;
  map?: SourceMapLike;
}

export interface NativeTransformRequest {
  code: string;
  dialect: Dialect;
  enumRuntimeModule: string;
  filename: string;
  format: Format;
  preserveComments: boolean;
  preserveWhitespace: boolean;
  reactRuntimeTarget: ReactRuntimeTarget;
  sourcemap: boolean;
}

export interface NativeTransformResult {
  code: string;
  map?: SourceMapLike;
}

export interface NativeErrorLike {
  column?: number;
  line?: number;
  message?: string;
}
