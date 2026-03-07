import programmaticTransform from './index.js';
import type {
  SourceMapLike,
  TransformOptionsInput,
} from './transform/types.js';

type LoaderCallback = (
  error: Error | null,
  code?: string,
  map?: SourceMapLike | null,
  meta?: unknown
) => void;

interface LoaderContext {
  async(): LoaderCallback;
  cacheable?: (cacheable?: boolean) => void;
  getOptions?: () => TransformOptionsInput;
  query?: TransformOptionsInput;
  resourcePath?: string;
  sourceMap?: boolean;
}

function rawLoaderOptions(context: LoaderContext): TransformOptionsInput {
  if (typeof context.getOptions === 'function') {
    return context.getOptions() ?? {};
  }

  if (context.query && typeof context.query === 'object') {
    return context.query;
  }

  return {};
}

function resolvedSourceMapOption(
  context: LoaderContext,
  options: TransformOptionsInput
): boolean {
  if (typeof options.sourcemap === 'boolean') {
    return options.sourcemap;
  }

  return typeof context.sourceMap === 'boolean' ? context.sourceMap : true;
}

function fastFlowTransformLoader(
  this: LoaderContext,
  source: string | Buffer,
  inputSourceMap: SourceMapLike | null | undefined,
  meta: unknown
): void {
  const callback = this.async();
  const options = rawLoaderOptions(this);

  this.cacheable?.(true);

  const request = {
    ...options,
    filename: this.resourcePath ?? '<unknown>',
    source,
    sourcemap: resolvedSourceMapOption(this, options),
    ...(inputSourceMap === undefined ? {} : { inputSourceMap }),
  };

  programmaticTransform(request)
    .then((result) => {
      callback(null, result.code, result.map ?? null, meta);
    })
    .catch((error) => {
      callback(error as Error);
    });
}

export default fastFlowTransformLoader;
