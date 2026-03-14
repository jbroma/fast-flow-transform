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
  return await import('../index.js');
}

function mockNativeBinding(transform: (input: unknown) => unknown): {
  bindingTransform: ReturnType<typeof vi.fn>;
  loadNativeBinding: ReturnType<typeof vi.fn>;
} {
  const bindingTransform = vi.fn(transform);
  const loadNativeBinding = vi.fn(() => ({
    transform: bindingTransform,
  }));

  vi.doMock('../transform/nativeBinding.js', () => ({
    loadNativeBinding,
  }));

  return { bindingTransform, loadNativeBinding };
}

describe('programmatic transform', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('defaults format to pretty when omitted', async () => {
    const { bindingTransform } = mockNativeBinding(() => ({
      code: 'const bound = true;\n',
      map: createSingleMappingMap({
        file: 'generated.js',
        generatedColumn: 0,
        generatedLine: 1,
        originalColumn: 0,
        originalLine: 1,
        source: '/tmp/input.js',
      }),
    }));

    const { default: transform } = await importTransform();
    await transform({
      filename: '/tmp/input.js',
      source: 'const bound: boolean = true;',
      sourcemap: false,
    });

    expect(bindingTransform).toHaveBeenCalledWith({
      code: 'const bound: boolean = true;',
      dialect: 'flow-detect',
      enumRuntimeModule: 'flow-enums-runtime',
      filename: '/tmp/input.js',
      format: 'pretty',
      preserveComments: false,
      preserveWhitespace: false,
      reactRuntimeTarget: '18',
      sourcemap: false,
    });
  });

  it('uses the in-process native binding', async () => {
    const { bindingTransform, loadNativeBinding } = mockNativeBinding(() => ({
      code: 'const bound = true;\n',
      map: createSingleMappingMap({
        file: 'generated.js',
        generatedColumn: 0,
        generatedLine: 1,
        originalColumn: 0,
        originalLine: 1,
        source: '/tmp/input.js',
      }),
    }));

    const { default: transform } = await importTransform();
    const result = await transform({
      filename: '/tmp/input.js',
      source: 'const bound: boolean = true;',
      sourcemap: false,
    });

    expect(loadNativeBinding).toHaveBeenCalledTimes(1);
    expect(bindingTransform).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      code: 'const bound = true;\n',
    });
  });

  it('defaults sourcemap to true and merges source maps', async () => {
    const nativeMap = createSingleMappingMap({
      file: 'generated.js',
      generatedColumn: 0,
      generatedLine: 1,
      originalColumn: 0,
      originalLine: 1,
      source: '/tmp/input.js',
    });

    const { bindingTransform } = mockNativeBinding(() =>
      Promise.resolve({
        code: 'const answer = 42;\n',
        map: nativeMap,
      })
    );

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

    expect(bindingTransform).toHaveBeenCalledTimes(1);
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
    const { bindingTransform } = mockNativeBinding(() =>
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

    const { default: transform } = await importTransform();
    const result = await transform({
      filename: '/tmp/input.js',
      source: 'const value: number = 1;',
      sourcemap: false,
    });

    expect(bindingTransform).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      code: 'const value = 1;\n',
    });
  });

  it('forwards explicit compact format to the native binding', async () => {
    const { bindingTransform } = mockNativeBinding(() =>
      Promise.resolve({
        code: 'const value=1;\n',
      })
    );

    const { default: transform } = await importTransform();
    await transform({
      filename: '/tmp/input.js',
      format: 'compact',
      source: 'const value: number = 1;',
      sourcemap: false,
    });

    expect(bindingTransform).toHaveBeenCalledWith({
      code: 'const value: number = 1;',
      dialect: 'flow-detect',
      enumRuntimeModule: 'flow-enums-runtime',
      filename: '/tmp/input.js',
      format: 'compact',
      preserveComments: false,
      preserveWhitespace: false,
      reactRuntimeTarget: '18',
      sourcemap: false,
    });
  });

  it('forwards preserve flags to the native binding with sourcemaps enabled', async () => {
    const { bindingTransform } = mockNativeBinding(() =>
      Promise.resolve({
        code: '\nconst value = 1;\n',
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

    const { default: transform } = await importTransform();
    await transform({
      filename: '/tmp/input.js',
      preserveComments: true,
      preserveWhitespace: true,
      source: 'const value: number = 1;',
    } as never);

    expect(bindingTransform).toHaveBeenCalledWith({
      code: 'const value: number = 1;',
      dialect: 'flow-detect',
      enumRuntimeModule: 'flow-enums-runtime',
      filename: '/tmp/input.js',
      format: 'pretty',
      preserveComments: true,
      preserveWhitespace: true,
      reactRuntimeTarget: '18',
      sourcemap: true,
    });
  });

  it('forwards preserveComments without preserveWhitespace', async () => {
    const { bindingTransform } = mockNativeBinding(() =>
      Promise.resolve({
        code: '/* keep */\nconst value = 1;\n',
      })
    );

    const { default: transform } = await importTransform();
    await transform({
      filename: '/tmp/input.js',
      preserveComments: true,
      source: '/* keep */\nconst value: number = 1;',
      sourcemap: false,
    } as never);

    expect(bindingTransform).toHaveBeenCalledWith({
      code: '/* keep */\nconst value: number = 1;',
      dialect: 'flow-detect',
      enumRuntimeModule: 'flow-enums-runtime',
      filename: '/tmp/input.js',
      format: 'pretty',
      preserveComments: true,
      preserveWhitespace: false,
      reactRuntimeTarget: '18',
      sourcemap: false,
    });
  });

  it('formats native diagnostics into transform errors', async () => {
    mockNativeBinding(() =>
      Promise.reject({
        column: 10,
        line: 2,
        message: 'Unexpected token',
      })
    );

    const { default: transform } = await importTransform();

    await expect(
      transform({
        filename: '/tmp/bad.js',
        source: 'const value = ;',
      })
    ).rejects.toThrow(
      'fast-flow-transform native transform failed (/tmp/bad.js:2:10): Unexpected token'
    );
  });
});
