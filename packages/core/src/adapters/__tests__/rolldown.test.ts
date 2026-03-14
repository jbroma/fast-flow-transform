import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exampleMap, type RollupLikePlugin } from './helpers.js';

describe('rolldown adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('aliases the rollup adapter', async () => {
    const rollupModule = await import('../rollup.js');
    const rolldownModule = await import('../rolldown.js');

    expect(rolldownModule.default).toBe(rollupModule.default);
    expect(rolldownModule.createFastFlowTransformRolldown).toBe(
      rollupModule.createFastFlowTransformRollup
    );
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

    const { createFastFlowTransformRolldown } = await import('../rolldown.js');
    const plugin = createFastFlowTransformRolldown() as RollupLikePlugin;

    await expect(
      plugin.transform(
        'const view: React.Node = <View foo="bar" />;',
        '/tmp/input.js'
      )
    ).resolves.toEqual({
      code: 'const view = <View foo="bar" />;\n',
      map: exampleMap('/tmp/input.js'),
    });
  });
});
