import { beforeEach, describe, expect, it, vi } from 'vitest';

type HookTap = ReturnType<typeof vi.fn>;

type Hook = {
  tap: HookTap;
};

type Compiler = {
  hooks: {
    afterDone: Hook;
    shutdown: Hook;
    watchClose: Hook;
  };
  options: {
    watch?: boolean;
  };
};

type LoaderContext = {
  _compiler: Compiler;
  async(): (
    error: Error | null,
    code?: string,
    map?: unknown,
    meta?: unknown
  ) => void;
  getOptions(): { sourcemap: true };
  resourcePath: string;
};

function createHook(): Hook {
  return {
    tap: vi.fn(),
  };
}

async function runLoaderWithCompiler(compiler: Compiler) {
  vi.doMock('../src/resolveBinary.js', () => ({
    resolveBinaryPath: vi.fn(() => process.execPath),
  }));

  const closeAllPools = vi.fn();
  const transform = vi.fn(() =>
    Promise.resolve({
      code: 'const answer = 42;',
      map: null,
    })
  );

  vi.doMock('../src/pool.js', () => ({
    closeAllPools,
    getPool: vi.fn(() => ({ transform })),
  }));

  const loader = (await import('../src/index.js')).default;

  await new Promise<void>((resolve, reject) => {
    const context: LoaderContext = {
      _compiler: compiler,
      async() {
        return (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        };
      },
      getOptions: () => ({ sourcemap: true }),
      resourcePath: '/tmp/input.js',
    };

    loader.call(context, 'const answer: number = 42;', null, undefined);
  });

  return { closeAllPools };
}

describe('loader lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('registers compiler hooks that close worker pools after a one-shot build', async () => {
    const compiler: Compiler = {
      hooks: {
        afterDone: createHook(),
        shutdown: createHook(),
        watchClose: createHook(),
      },
      options: {},
    };

    const { closeAllPools } = await runLoaderWithCompiler(compiler);

    expect(compiler.hooks.afterDone.tap).toHaveBeenCalledTimes(1);
    expect(compiler.hooks.shutdown.tap).toHaveBeenCalledTimes(1);
    expect(compiler.hooks.watchClose.tap).toHaveBeenCalledTimes(1);

    const afterDoneHandler = compiler.hooks.afterDone.tap.mock.calls[0]?.[1];
    expect(afterDoneHandler).toBeTypeOf('function');

    afterDoneHandler();

    expect(closeAllPools).toHaveBeenCalledTimes(1);
  });
});
