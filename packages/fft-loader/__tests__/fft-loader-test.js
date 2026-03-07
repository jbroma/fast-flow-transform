'use strict';

const {SourceMapConsumer, SourceMapGenerator} = require('source-map');

function createSingleMappingMap({file, source, generatedLine, generatedColumn, originalLine, originalColumn}) {
  const generator = new SourceMapGenerator({file});
  generator.addMapping({
    generated: {line: generatedLine, column: generatedColumn},
    source,
    original: {line: originalLine, column: originalColumn},
  });
  return generator.toJSON();
}

function runLoader(loader, {source, inputMap, options, resourcePath, useQueryFallback}) {
  const meta = {tag: 'meta'};
  return new Promise((resolve, reject) => {
    const context = {
      resourcePath,
      cacheable: jest.fn(),
      async() {
        return (error, code, map, returnedMeta) => {
          if (error != null) {
            reject(error);
            return;
          }
          resolve({code, map, meta: returnedMeta});
        };
      },
    };

    if (useQueryFallback) {
      context.query = options;
    } else {
      context.getOptions = () => options;
    }

    loader.call(context, source, inputMap, meta);
  });
}

describe('fft-loader', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('transforms source with webpack getOptions and merges source maps', async () => {
    jest.doMock('../src/resolveBinary', () => ({
      resolveBinaryPath: jest.fn(() => process.execPath),
    }));

    const nativeMap = createSingleMappingMap({
      file: 'generated.js',
      source: '/tmp/input.js',
      generatedLine: 1,
      generatedColumn: 0,
      originalLine: 1,
      originalColumn: 0,
    });

    const poolTransform = jest.fn(() =>
      Promise.resolve({
        code: 'const answer = 42;\n',
        map: nativeMap,
      }),
    );

    jest.doMock('../src/pool', () => ({
      getPool: jest.fn(() => ({transform: poolTransform})),
    }));

    const inputMap = createSingleMappingMap({
      file: 'input.js',
      source: '/tmp/original.js',
      generatedLine: 1,
      generatedColumn: 0,
      originalLine: 5,
      originalColumn: 7,
    });

    const loader = require('../src/index');

    const result = await runLoader(loader, {
      source: 'const answer: number = 42;',
      inputMap,
      options: {
        dialect: 'flow-detect',
        format: 'compact',
        reactRuntimeTarget: '18',
        enumRuntimeModule: 'flow-enums-runtime',
        sourcemap: true,
      },
      resourcePath: '/tmp/input.js',
      useQueryFallback: false,
    });

    expect(result.code).toBe('const answer = 42;\n');

    const mergedConsumer = new SourceMapConsumer(result.map);
    const mergedPosition = mergedConsumer.originalPositionFor({line: 1, column: 0});
    expect(mergedPosition.source).toBe('/tmp/original.js');
    expect(mergedPosition.line).toBe(5);
    expect(mergedPosition.column).toBe(7);

    if (typeof mergedConsumer.destroy === 'function') {
      mergedConsumer.destroy();
    }
  });

  it('supports rspack-style query fallback when getOptions is unavailable', async () => {
    jest.doMock('../src/resolveBinary', () => ({
      resolveBinaryPath: jest.fn(() => process.execPath),
    }));

    const poolTransform = jest.fn(() =>
      Promise.resolve({
        code: 'const value = 1;\n',
        map: createSingleMappingMap({
          file: 'generated.js',
          source: '/tmp/rspack-input.js',
          generatedLine: 1,
          generatedColumn: 0,
          originalLine: 1,
          originalColumn: 0,
        }),
      }),
    );

    jest.doMock('../src/pool', () => ({
      getPool: jest.fn(() => ({transform: poolTransform})),
    }));

    const loader = require('../src/index');

    const result = await runLoader(loader, {
      source: 'const value: number = 1;',
      inputMap: null,
      options: {
        sourcemap: true,
      },
      resourcePath: '/tmp/rspack-input.js',
      useQueryFallback: true,
    });

    expect(result.code).toBe('const value = 1;\n');
    expect(poolTransform).toHaveBeenCalledTimes(1);
  });

  it('formats native diagnostics into loader errors', async () => {
    jest.doMock('../src/resolveBinary', () => ({
      resolveBinaryPath: jest.fn(() => process.execPath),
    }));

    const poolTransform = jest.fn(() =>
      Promise.reject({
        message: 'Unexpected token',
        line: 2,
        column: 10,
      }),
    );

    jest.doMock('../src/pool', () => ({
      getPool: jest.fn(() => ({transform: poolTransform})),
    }));

    const loader = require('../src/index');

    await expect(
      runLoader(loader, {
        source: 'const value = ;',
        inputMap: null,
        options: {sourcemap: true},
        resourcePath: '/tmp/bad.js',
        useQueryFallback: false,
      }),
    ).rejects.toThrow(
      'fft-strip transform failed (/tmp/bad.js:2:10): Unexpected token',
    );
  });
});
