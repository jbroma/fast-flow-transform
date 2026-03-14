import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  exampleMap,
  type RollupLikePlugin,
  type VitePlugin,
} from './helpers.js';

describe('vite adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns FFT output unchanged when it still contains JSX', async () => {
    const transform = vi.fn(() =>
      Promise.resolve({
        code: 'const view = <View foo="bar" />;\n',
        map: exampleMap('/tmp/input.js'),
      })
    );

    vi.doMock('../../index.js', () => ({
      default: transform,
      transform,
    }));

    const { createFastFlowTransformVite } = await import('../vite.js');
    const plugin = createFastFlowTransformVite() as VitePlugin;

    await expect(
      plugin.transform?.(
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

  it('returns a single transform plugin', async () => {
    const transform = vi.fn(() =>
      Promise.resolve({
        code: 'const value = 1;\n',
        map: exampleMap('/tmp/input.js'),
      })
    );

    vi.doMock('../../index.js', () => ({
      default: transform,
      transform,
    }));

    const { createFastFlowTransformVite } = await import('../vite.js');
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
