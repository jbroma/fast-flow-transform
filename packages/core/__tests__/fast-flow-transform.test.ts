import { SourceMapConsumer, SourceMapGenerator } from 'source-map';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LoaderOptionsInput } from '../src/types.js';

type LoaderModule = typeof import('../src/index.js');
type LoaderFunction = LoaderModule['default'];
type RawSourceMap = import('source-map').RawSourceMap;

type LoaderOptions = {
  sourcemap: true;
} & LoaderOptionsInput;

type LoaderContext = {
  cacheable: ReturnType<typeof vi.fn>;
  getOptions?: () => LoaderOptions;
  query?: LoaderOptions;
  resourcePath: string;
  async(): (
    error: Error | null | undefined,
    code?: string,
    map?: RawSourceMap | null,
    meta?: unknown
  ) => void;
};

type RunLoaderInput = {
  inputMap: RawSourceMap | null;
  options: LoaderOptions;
  resourcePath: string;
  source: string;
  useQueryFallback: boolean;
};

function createSingleMappingMap({
  file,
  generatedColumn,
  generatedLine,
  originalColumn,
  originalLine,
  source,
}: {
  file: string;
  generatedColumn: number;
  generatedLine: number;
  originalColumn: number;
  originalLine: number;
  source: string;
}): RawSourceMap {
  const generator = new SourceMapGenerator({ file });
  generator.addMapping({
    generated: { line: generatedLine, column: generatedColumn },
    original: { line: originalLine, column: originalColumn },
    source,
  });
  return (
    generator as SourceMapGenerator & { toJSON(): RawSourceMap }
  ).toJSON();
}

async function runLoader(
  loader: LoaderFunction,
  { inputMap, options, resourcePath, source, useQueryFallback }: RunLoaderInput
) {
  const meta = { tag: 'meta' };

  return new Promise<{ code: string; map: RawSourceMap | null; meta: unknown }>(
    (resolve, reject) => {
      const context: LoaderContext = {
        cacheable: vi.fn(),
        resourcePath,
        async() {
          return (error, code, map, returnedMeta) => {
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
      };

      if (useQueryFallback) {
        context.query = options;
      } else {
        context.getOptions = () => options;
      }

      loader.call(context, source, inputMap, meta);
    }
  );
}

async function importLoader() {
  return (await import('../src/index.js')).default;
}

describe('fast-flow-transform loader', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock('../src/pool.js');
    vi.doUnmock('../src/resolveBinary.js');
  });

  it('transforms source with webpack getOptions and merges source maps', async () => {
    vi.doMock('../src/resolveBinary.js', () => ({
      resolveBinaryPath: vi.fn(() => process.execPath),
    }));

    const nativeMap = createSingleMappingMap({
      file: 'generated.js',
      generatedColumn: 0,
      generatedLine: 1,
      originalColumn: 0,
      originalLine: 1,
      source: '/tmp/input.js',
    });

    const poolTransform = vi.fn(() =>
      Promise.resolve({
        code: 'const answer = 42;\n',
        map: nativeMap,
      })
    );

    vi.doMock('../src/pool.js', () => ({
      getPool: vi.fn(() => ({ transform: poolTransform })),
    }));

    const inputMap = createSingleMappingMap({
      file: 'input.js',
      generatedColumn: 0,
      generatedLine: 1,
      originalColumn: 7,
      originalLine: 5,
      source: '/tmp/original.js',
    });

    const loader = await importLoader();
    const result = await runLoader(loader, {
      inputMap,
      options: {
        dialect: 'flow-detect',
        enumRuntimeModule: 'flow-enums-runtime',
        format: 'compact',
        reactRuntimeTarget: '18',
        sourcemap: true,
      },
      resourcePath: '/tmp/input.js',
      source: 'const answer: number = 42;',
      useQueryFallback: false,
    });

    expect(result.code).toBe('const answer = 42;\n');

    expect(result.map).not.toBeNull();

    const mergedConsumer = new SourceMapConsumer(result.map as RawSourceMap);
    const mergedPosition = mergedConsumer.originalPositionFor({
      column: 0,
      line: 1,
    });

    expect(mergedPosition.source).toBe('/tmp/original.js');
    expect(mergedPosition.line).toBe(5);
    expect(mergedPosition.column).toBe(7);

    const destroy = (
      mergedConsumer as SourceMapConsumer & { destroy?: () => void }
    ).destroy;
    if (typeof destroy === 'function') {
      destroy.call(mergedConsumer);
    }
  });

  it('supports rspack-style query fallback when getOptions is unavailable', async () => {
    vi.doMock('../src/resolveBinary.js', () => ({
      resolveBinaryPath: vi.fn(() => process.execPath),
    }));

    const poolTransform = vi.fn(() =>
      Promise.resolve({
        code: 'const value = 1;\n',
        map: createSingleMappingMap({
          file: 'generated.js',
          generatedColumn: 0,
          generatedLine: 1,
          originalColumn: 0,
          originalLine: 1,
          source: '/tmp/rspack-input.js',
        }),
      })
    );

    vi.doMock('../src/pool.js', () => ({
      getPool: vi.fn(() => ({ transform: poolTransform })),
    }));

    const loader = await importLoader();
    const result = await runLoader(loader, {
      inputMap: null,
      options: { sourcemap: true },
      resourcePath: '/tmp/rspack-input.js',
      source: 'const value: number = 1;',
      useQueryFallback: true,
    });

    expect(result.code).toBe('const value = 1;\n');
    expect(poolTransform).toHaveBeenCalledTimes(1);
  });

  it('formats native diagnostics into loader errors', async () => {
    vi.doMock('../src/resolveBinary.js', () => ({
      resolveBinaryPath: vi.fn(() => process.execPath),
    }));

    const poolTransform = vi.fn(() =>
      Promise.reject({
        column: 10,
        line: 2,
        message: 'Unexpected token',
      })
    );

    vi.doMock('../src/pool.js', () => ({
      getPool: vi.fn(() => ({ transform: poolTransform })),
    }));

    const loader = await importLoader();

    await expect(
      runLoader(loader, {
        inputMap: null,
        options: { sourcemap: true },
        resourcePath: '/tmp/bad.js',
        source: 'const value = ;',
        useQueryFallback: false,
      })
    ).rejects.toThrow(
      'fft-strip transform failed (/tmp/bad.js:2:10): Unexpected token'
    );
  });
});
