import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exampleMap, type RollupLikePlugin } from './helpers.js';

describe('rollup adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('passes the incoming id through to fft', async () => {
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

    const { createFastFlowTransformRollup } = await import('../rollup.js');
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
});
