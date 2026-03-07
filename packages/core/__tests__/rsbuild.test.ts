import { describe, expect, it } from 'vitest';

import pluginFastFlowTransformRsbuild, {
  applyFastFlowTransformRsbuild,
} from '../src/rsbuild.js';

function createBundlerChainSpy() {
  const calls: Record<string, unknown> = {};

  const use = {
    after(value: unknown) {
      calls.after = value;
      return use;
    },
    loader(value: unknown) {
      calls.loader = value;
      return use;
    },
    options(value: unknown) {
      calls.options = value;
      return use;
    },
  };

  const rule = {
    use(value: unknown) {
      calls.use = value;
      return use;
    },
  };

  return {
    calls,
    chain: {
      module: {
        rule(value: unknown) {
          calls.rule = value;
          return rule;
        },
      },
    },
  };
}

describe('rsbuild integration', () => {
  it('default export is a plugin factory that registers the loader against the js rule', () => {
    let bundlerChainHook:
      | ((
          chain: ReturnType<typeof createBundlerChainSpy>['chain'],
          utils: {
            CHAIN_ID: {
              RULE: { JS: string };
              USE: { SWC: string };
            };
          }
        ) => void)
      | undefined;

    const plugin = pluginFastFlowTransformRsbuild({
      dialect: 'flow-detect',
      format: 'compact',
    });

    expect(plugin.name).toBe('rsbuild:fast-flow-transform');

    plugin.setup({
      modifyBundlerChain(hook) {
        bundlerChainHook = hook;
      },
    });

    expect(bundlerChainHook).toBeTypeOf('function');

    const { calls, chain } = createBundlerChainSpy();
    bundlerChainHook?.(chain, {
      CHAIN_ID: {
        RULE: { JS: 'js-rule' },
        USE: { SWC: 'swc-loader' },
      },
    });

    expect(calls).toEqual({
      after: 'swc-loader',
      loader: 'fast-flow-transform/rspack',
      options: { dialect: 'flow-detect', format: 'compact' },
      rule: 'js-rule',
      use: 'fast-flow-transform',
    });
  });

  it('named helper stays available for low-level bundlerChain wiring', () => {
    const { calls, chain } = createBundlerChainSpy();

    applyFastFlowTransformRsbuild(
      chain,
      {
        CHAIN_ID: {
          RULE: { JS: 'js-rule' },
          USE: { SWC: 'swc-loader' },
        },
      },
      { dialect: 'flow-detect', format: 'compact' }
    );

    expect(calls).toEqual({
      after: 'swc-loader',
      loader: 'fast-flow-transform/rspack',
      options: { dialect: 'flow-detect', format: 'compact' },
      rule: 'js-rule',
      use: 'fast-flow-transform',
    });
  });
});
