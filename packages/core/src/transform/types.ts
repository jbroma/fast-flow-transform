import type { RawSourceMap } from 'source-map';

export type Dialect = 'flow' | 'flow-detect' | 'flow-unambiguous';
export type Format = 'compact' | 'preserve' | 'pretty';
export type ReactRuntimeTarget = '18' | '19';
export type SourceMapLike = RawSourceMap;

export interface TransformOptions {
  comments: boolean;
  dialect: Dialect;
  format: Format;
  reactRuntimeTarget: ReactRuntimeTarget;
  sourcemap: boolean;
}

export type TransformOptionsInput = Partial<TransformOptions> & {
  reactRuntimeTarget?: number | string;
};

export interface TransformInput extends TransformOptionsInput {
  filename?: string;
  inputSourceMap?: SourceMapLike | null;
  source: string | Buffer;
}

export interface TransformResult {
  code: string;
  map?: SourceMapLike;
}

export interface NativeTransformRequest {
  comments: boolean;
  code: string;
  dialect: Dialect;
  filename: string;
  format: Format;
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
