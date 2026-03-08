import { SourceMapConsumer, SourceMapGenerator } from 'source-map';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type RawSourceMap = import('source-map').RawSourceMap;

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

async function importTransform() {
  return await import('../src/index.js');
}

describe('programmatic transform', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('../src/transform/nativeBinding.js', () => ({
      loadNativeBinding: vi.fn(() => null),
    }));
  });

  it('prefers the in-process native binding when available', async () => {
    vi.doMock('../src/transform/resolveBinary.js', () => ({
      resolveBinaryPath: vi.fn(() => process.execPath),
    }));

    const runNativeTransform = vi.fn(() =>
      Promise.resolve({
        code: 'const fallback = true;\n',
        map: createSingleMappingMap({
          file: 'generated.js',
          generatedColumn: 0,
          generatedLine: 1,
          originalColumn: 0,
          originalLine: 1,
          source: '/tmp/input.js',
        }),
      })
    );

    vi.doMock('../src/transform/nativeTransform.js', () => ({
      runNativeTransform,
    }));

    const loadNativeBinding = vi.fn(() => ({
      transform: vi.fn(() => ({
        code: 'const bound = true;\n',
        map: createSingleMappingMap({
          file: 'generated.js',
          generatedColumn: 0,
          generatedLine: 1,
          originalColumn: 0,
          originalLine: 1,
          source: '/tmp/input.js',
        }),
      })),
    }));

    vi.doMock('../src/transform/nativeBinding.js', () => ({
      loadNativeBinding,
    }));

    const { default: transform } = await importTransform();
    const result = await transform({
      filename: '/tmp/input.js',
      source: 'const bound: boolean = true;',
      sourcemap: false,
    });

    expect(loadNativeBinding).toHaveBeenCalledTimes(1);
    expect(runNativeTransform).not.toHaveBeenCalled();
    expect(result).toEqual({
      code: 'const bound = true;\n',
    });
  });

  it('defaults sourcemap to true and merges source maps', async () => {
    vi.doMock('../src/transform/resolveBinary.js', () => ({
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

    const runNativeTransform = vi.fn(() =>
      Promise.resolve({
        code: 'const answer = 42;\n',
        map: nativeMap,
      })
    );

    vi.doMock('../src/transform/nativeTransform.js', () => ({
      runNativeTransform,
    }));

    const inputMap = createSingleMappingMap({
      file: 'input.js',
      generatedColumn: 0,
      generatedLine: 1,
      originalColumn: 7,
      originalLine: 5,
      source: '/tmp/original.js',
    });

    const { default: transform } = await importTransform();
    const result = await transform({
      filename: '/tmp/input.js',
      inputSourceMap: inputMap,
      source: 'const answer: number = 42;',
    });

    expect(runNativeTransform).toHaveBeenCalledTimes(1);
    expect(result.code).toBe('const answer = 42;\n');
    expect(result.map).not.toBeUndefined();

    const consumer = new SourceMapConsumer(result.map as RawSourceMap);
    const originalPosition = consumer.originalPositionFor({
      column: 0,
      line: 1,
    });

    expect(originalPosition.source).toBe('/tmp/original.js');
    expect(originalPosition.line).toBe(5);
    expect(originalPosition.column).toBe(7);

    const destroy = (consumer as SourceMapConsumer & { destroy?: () => void })
      .destroy;
    destroy?.call(consumer);
  });

  it('skips source maps when sourcemap is false', async () => {
    vi.doMock('../src/transform/resolveBinary.js', () => ({
      resolveBinaryPath: vi.fn(() => process.execPath),
    }));

    const runNativeTransform = vi.fn(() =>
      Promise.resolve({
        code: 'const value = 1;\n',
        map: createSingleMappingMap({
          file: 'generated.js',
          generatedColumn: 0,
          generatedLine: 1,
          originalColumn: 0,
          originalLine: 1,
          source: '/tmp/input.js',
        }),
      })
    );

    vi.doMock('../src/transform/nativeTransform.js', () => ({
      runNativeTransform,
    }));

    const { default: transform } = await importTransform();
    const result = await transform({
      filename: '/tmp/input.js',
      source: 'const value: number = 1;',
      sourcemap: false,
    });

    expect(runNativeTransform).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      code: 'const value = 1;\n',
    });
  });

  it('formats native diagnostics into transform errors', async () => {
    vi.doMock('../src/transform/resolveBinary.js', () => ({
      resolveBinaryPath: vi.fn(() => process.execPath),
    }));

    vi.doMock('../src/transform/nativeTransform.js', () => ({
      runNativeTransform: vi.fn(() =>
        Promise.reject({
          column: 10,
          line: 2,
          message: 'Unexpected token',
        })
      ),
    }));

    const { default: transform } = await importTransform();

    await expect(
      transform({
        filename: '/tmp/bad.js',
        source: 'const value = ;',
      })
    ).rejects.toThrow(
      'fft-strip transform failed (/tmp/bad.js:2:10): Unexpected token'
    );
  });
});
