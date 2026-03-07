import type { RawSourceMap } from 'source-map';

export type Dialect = 'flow' | 'flow-detect' | 'flow-unambiguous';
export type Format = 'compact' | 'pretty';
export type ReactRuntimeTarget = '18' | '19';

export interface LoaderOptions {
  dialect: Dialect;
  enumRuntimeModule: string;
  format: Format;
  reactRuntimeTarget: ReactRuntimeTarget;
  sourcemap: true;
  threads: number | undefined;
}

export type LoaderOptionsInput = Partial<LoaderOptions> & {
  reactRuntimeTarget?: number | string;
};

export type SourceMapLike = RawSourceMap;

export interface TransformRequest {
  code: string;
  dialect: Dialect;
  enumRuntimeModule: string;
  filename: string;
  format: Format;
  reactRuntimeTarget: ReactRuntimeTarget;
}

export interface TransformResult {
  code: string;
  map: SourceMapLike;
}

export interface NativeErrorLike {
  column?: number;
  line?: number;
  message?: string;
}
