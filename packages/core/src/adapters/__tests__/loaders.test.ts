import { beforeEach, describe, expect, it, vi } from 'vitest';

type RawSourceMap = import('source-map').RawSourceMap;

type LoaderContext = {
  async(): (
    error: Error | null,
    code?: string,
    map?: RawSourceMap | null,
    meta?: unknown
  ) => void;
  getOptions?: () => Record<string, unknown>;
  query?: Record<string, unknown>;
  resourcePath: string;
  sourceMap?: boolean;
};

async function runLoader(
  loaderPath: '../webpack.js' | '../rspack.js',
  context: Omit<LoaderContext, 'async'>,
  inputMap: RawSourceMap | null = null
) {
  const meta = { tag: 'meta' };
  const loader = (await import(loaderPath)).default;

  return await new Promise<{
    code: string;
    map: RawSourceMap | null;
    meta: unknown;
  }>((resolve, reject) => {
    loader.call(
      {
        ...context,
        async() {
          return (
            error: Error | null,
            code?: string,
            map?: RawSourceMap | null,
            returnedMeta?: unknown
          ) => {
            if (error) {
              reject(error);
              return;
            }

            resolve({
              code: code ?? '',
              map: map ?? null,
              meta: returnedMeta,
            });
          };
        },
      },
      'const value: number = 1;',
      inputMap,
      meta
    );
  });
}

describe('webpack and rspack wrappers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('webpack wrapper uses getOptions and infers sourcemap from loader context', async () => {
    const transform = vi.fn(() =>
      Promise.resolve({
        code: 'const value = 1;\n',
        map: null,
      })
    );

    vi.doMock('../../index.js', () => ({
      default: transform,
      transform,
    }));

    const result = await runLoader('../webpack.js', {
      getOptions: () => ({ format: 'pretty' }),
      resourcePath: '/tmp/input.js',
      sourceMap: false,
    });

    expect(transform).toHaveBeenCalledWith({
      filename: '/tmp/input.js',
      format: 'pretty',
      inputSourceMap: null,
      source: 'const value: number = 1;',
      sourcemap: false,
    });
    expect(result.code).toBe('const value = 1;\n');
    expect(result.meta).toEqual({ tag: 'meta' });
  });

  it('rspack wrapper falls back to query options and defaults sourcemap to true', async () => {
    const transform = vi.fn(() =>
      Promise.resolve({
        code: 'const value = 1;\n',
        map: null,
      })
    );

    vi.doMock('../../index.js', () => ({
      default: transform,
      transform,
    }));

    await runLoader('../rspack.js', {
      query: { dialect: 'flow' },
      resourcePath: '/tmp/rspack-input.js',
    });

    expect(transform).toHaveBeenCalledWith({
      dialect: 'flow',
      filename: '/tmp/rspack-input.js',
      inputSourceMap: null,
      source: 'const value: number = 1;',
      sourcemap: true,
    });
  });
});
