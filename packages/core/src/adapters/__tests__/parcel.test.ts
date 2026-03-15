import { beforeEach, describe, expect, it, vi } from 'vitest';

type RawSourceMap = import('source-map').RawSourceMap;

type ParcelAssetMap = {
  toVLQ(): RawSourceMap;
};

type SourceMapInstance = {
  projectRoot: string;
  rawMap: RawSourceMap | null;
  addVLQMap(map: RawSourceMap): void;
};

type ParcelPlugin = {
  transform(args: {
    asset: {
      env?: { sourceMap?: boolean };
      filePath: string;
      getCode(): Promise<string>;
      getMap(): Promise<ParcelAssetMap | null>;
      setCode(code: string): void;
      setMap(map: unknown): void;
    };
    options: {
      projectRoot: string;
    };
  }): Promise<unknown[]>;
};

function mockSourceMapModule() {
  vi.doMock('@parcel/source-map', () => ({
    default: class MockSourceMap implements SourceMapInstance {
      projectRoot: string;
      rawMap: RawSourceMap | null = null;

      constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
      }

      addVLQMap(map: RawSourceMap) {
        this.rawMap = map;
      }
    },
  }));
}

function mockTransformerModule() {
  vi.doMock('@parcel/plugin', () => ({
    Transformer: class MockTransformer<T extends object> {
      constructor(plugin: T) {
        return plugin;
      }
    },
  }));
}

describe('parcel integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('named factory transforms asset code and rehydrates source maps for Parcel', async () => {
    mockSourceMapModule();
    mockTransformerModule();

    const inputMap: RawSourceMap = {
      file: 'input.js',
      mappings: 'AAAA',
      names: [],
      sources: ['input.js'],
      version: 3,
    };
    const outputMap: RawSourceMap = {
      file: 'output.js',
      mappings: 'BBBB',
      names: [],
      sources: ['input.js'],
      version: 3,
    };
    const transform = vi.fn(() =>
      Promise.resolve({
        code: 'const value = 1;\n',
        map: outputMap,
      })
    );

    vi.doMock('../../index.js', () => ({
      default: transform,
      transform,
    }));

    const asset = {
      env: { sourceMap: true },
      filePath: '/tmp/input.js',
      getCode: vi.fn(async () => 'const value: number = 1;'),
      getMap: vi.fn(
        async (): Promise<ParcelAssetMap> => ({
          toVLQ: () => inputMap,
        })
      ),
      setCode: vi.fn(),
      setMap: vi.fn(),
    };
    const parcel = await import('../parcel.js');
    const plugin = parcel.createFastFlowTransformParcel({
      dialect: 'flow-detect',
      format: 'compact',
    }) as unknown as ParcelPlugin;

    const result = await plugin.transform({
      asset,
      options: { projectRoot: '/repo' },
    });

    expect(transform).toHaveBeenCalledWith({
      dialect: 'flow-detect',
      filename: '/tmp/input.js',
      format: 'compact',
      inputSourceMap: inputMap,
      source: 'const value: number = 1;',
      sourcemap: true,
    });
    expect(asset.setCode).toHaveBeenCalledWith('const value = 1;\n');
    expect(asset.setMap).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRoot: '/repo',
        rawMap: outputMap,
      })
    );
    expect(result).toEqual([asset]);
  });

  it('default export skips source map hydration when Parcel disables maps', async () => {
    mockSourceMapModule();
    mockTransformerModule();

    const transform = vi.fn(() =>
      Promise.resolve({
        code: 'const value = 1;\n',
      })
    );

    vi.doMock('../../index.js', () => ({
      default: transform,
      transform,
    }));

    const asset = {
      env: { sourceMap: false },
      filePath: '/tmp/input.js',
      getCode: vi.fn(async () => 'const value: number = 1;'),
      getMap: vi.fn(async () => null),
      setCode: vi.fn(),
      setMap: vi.fn(),
    };
    const { default: plugin } = await import('../parcel.js');

    await (plugin as unknown as ParcelPlugin).transform({
      asset,
      options: { projectRoot: '/repo' },
    });

    expect(transform).toHaveBeenCalledWith({
      filename: '/tmp/input.js',
      inputSourceMap: null,
      source: 'const value: number = 1;',
      sourcemap: false,
    });
    expect(asset.getMap).not.toHaveBeenCalled();
    expect(asset.setMap).toHaveBeenCalledWith(null);
  });
});
