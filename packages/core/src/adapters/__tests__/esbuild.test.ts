import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type EsbuildPlugin } from './helpers.js';

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

    vi.doMock('../../index.js', () => ({
      default: transform,
      transform,
    }));
    vi.doMock('node:fs/promises', () => ({
      readFile: vi.fn(
        async () => 'export default function App(): React.Node { return null; }'
      ),
    }));

    const { createFastFlowTransformEsbuild } = await import('../esbuild.js');
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
