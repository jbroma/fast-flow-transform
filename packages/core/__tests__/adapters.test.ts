import { beforeEach, describe, expect, it, vi } from 'vitest';

type RawSourceMap = import('source-map').RawSourceMap;

type RollupLikePlugin = {
  name: string;
  transform(
    code: string,
    id: string
  ):
    | Promise<{ code: string; map?: RawSourceMap } | null>
    | { code: string; map?: RawSourceMap }
    | null;
};

type EsbuildPlugin = {
  name: string;
  setup(build: {
    onLoad(
      args: { filter: RegExp },
      callback: (args: { path: string }) => unknown
    ): void;
  }): void;
};

type VitePlugin = {
  config?(config: {
    optimizeDeps?: {
      esbuildOptions?: {
        plugins?: unknown[];
      };
    };
  }): unknown;
  enforce?: string;
  name: string;
  transform?: RollupLikePlugin['transform'];
};

function exampleMap(file: string): RawSourceMap {
  return {
    file,
    mappings: 'AAAA',
    names: [],
    sources: [file],
    version: '3',
  };
}

describe('rollup-family and vite adapters', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rollup adapter passes the incoming id through to fft', async () => {
    const transform = vi.fn(() =>
      Promise.resolve({
        code: 'const value = 1;\n',
        map: exampleMap('/tmp/input.js'),
      })
    );

    vi.doMock('../src/index.js', () => ({
      default: transform,
      transform,
    }));

    const { createFastFlowTransformRollup } = await import('../src/rollup.js');
    const plugin = createFastFlowTransformRollup({
      format: 'pretty',
    }) as RollupLikePlugin;

    const result = await plugin.transform(
      'const value: number = 1;',
      '/tmp/input.js?v=123'
    );

    expect(transform).toHaveBeenCalledWith({
      filename: '/tmp/input.js?v=123',
      format: 'pretty',
      source: 'const value: number = 1;',
      sourcemap: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        code: 'const value = 1;\n',
      })
    );
    expect(result?.map).toEqual(
      expect.objectContaining({
        file: '/tmp/input.js',
        sources: expect.arrayContaining(['/tmp/input.js']),
      })
    );
  });

  it('rolldown entrypoint aliases the rollup adapter', async () => {
    const rollupModule = await import('../src/rollup.js');
    const rolldownModule = await import('../src/rolldown.js');

    expect(rolldownModule.default).toBe(rollupModule.default);
    expect(rolldownModule.createFastFlowTransformRolldown).toBe(
      rollupModule.createFastFlowTransformRollup
    );
  });

  it('rollup-family adapters return FFT output unchanged when it still contains JSX', async () => {
    const transform = vi.fn(() =>
      Promise.resolve({
        code: 'const view = <View foo="bar" />;\n',
        map: exampleMap('/tmp/input.js'),
      })
    );

    vi.doMock('../src/index.js', () => ({
      default: transform,
      transform,
    }));

    const { createFastFlowTransformRollup } = await import('../src/rollup.js');
    const { createFastFlowTransformRolldown } =
      await import('../src/rolldown.js');
    const { createFastFlowTransformVite } = await import('../src/vite.js');

    const rollupPlugin = createFastFlowTransformRollup() as RollupLikePlugin;
    const rolldownPlugin =
      createFastFlowTransformRolldown() as RollupLikePlugin;
    const vitePlugin = createFastFlowTransformVite() as VitePlugin;

    await expect(
      rollupPlugin.transform(
        'const view: React.Node = <View foo="bar" />;',
        '/tmp/input.js'
      )
    ).resolves.toEqual({
      code: 'const view = <View foo="bar" />;\n',
      map: exampleMap('/tmp/input.js'),
    });
    await expect(
      rolldownPlugin.transform(
        'const view: React.Node = <View foo="bar" />;',
        '/tmp/input.js'
      )
    ).resolves.toEqual({
      code: 'const view = <View foo="bar" />;\n',
      map: exampleMap('/tmp/input.js'),
    });
    await expect(
      vitePlugin.transform?.(
        'const view: React.Node = <View foo="bar" />;',
        '/tmp/input.js'
      )
    ).resolves.toEqual({
      code: 'const view = <View foo="bar" />;\n',
      map: {
        ...exampleMap('/tmp/input.js'),
        version: 3,
      },
    });
  });

  it('vite adapter returns a single transform plugin', async () => {
    const transform = vi.fn(() =>
      Promise.resolve({
        code: 'const value = 1;\n',
        map: exampleMap('/tmp/input.js'),
      })
    );

    vi.doMock('../src/index.js', () => ({
      default: transform,
      transform,
    }));

    const { createFastFlowTransformVite } = await import('../src/vite.js');
    const plugin = createFastFlowTransformVite() as VitePlugin;

    expect(plugin.enforce).toBe('pre');
    expect(plugin.config).toBeUndefined();

    const result = await plugin.transform?.(
      'const value: number = 1;',
      '/tmp/input.js?import'
    );

    expect(transform).toHaveBeenCalledWith({
      filename: '/tmp/input.js?import',
      source: 'const value: number = 1;',
      sourcemap: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        code: 'const value = 1;\n',
      })
    );
    expect(result?.map).toEqual(
      expect.objectContaining({
        file: '/tmp/input.js',
        sources: expect.arrayContaining(['/tmp/input.js']),
      })
    );
  });
});

describe('esbuild adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('registers an onLoad hook that runs fft and keeps esbuild in jsx parsing mode', async () => {
    const transform = vi.fn(() =>
      Promise.resolve({
        code: 'export default function App() { return null; }\n',
      })
    );

    vi.doMock('../src/index.js', () => ({
      default: transform,
      transform,
    }));
    vi.doMock('node:fs/promises', () => ({
      readFile: vi.fn(
        async () => 'export default function App(): React.Node { return null; }'
      ),
    }));

    const { createFastFlowTransformEsbuild } =
      await import('../src/esbuild.js');
    const plugin = createFastFlowTransformEsbuild() as EsbuildPlugin;

    let onLoadCallback:
      | ((args: { path: string }) => Promise<unknown> | unknown)
      | undefined;

    plugin.setup({
      onLoad(_args, callback) {
        onLoadCallback = callback;
      },
    });

    expect(onLoadCallback).toBeTypeOf('function');

    const result = await onLoadCallback?.({
      path: '/tmp/App.mjs',
    });

    expect(transform).toHaveBeenCalledWith({
      filename: '/tmp/App.mjs',
      source: expect.any(String),
      sourcemap: false,
    });
    expect(result).toEqual({
      contents: 'export default function App() { return null; }\n',
      loader: 'jsx',
    });
  });
});
