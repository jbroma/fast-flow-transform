import type { TransformOptionsInput } from '../transform/types.js';

const FAST_FLOW_TRANSFORM_LOADER_ID = 'fast-flow-transform';
const FAST_FLOW_TRANSFORM_RSPACK_LOADER = 'fast-flow-transform/rspack';

interface BundlerChainUse {
  after(loaderId: string): BundlerChainUse;
  loader(loader: string): BundlerChainUse;
  options(options: TransformOptionsInput): BundlerChainUse;
}

interface BundlerChainRule {
  use(loaderId: string): BundlerChainUse;
}

interface BundlerChain {
  module: {
    rule(ruleId: string): BundlerChainRule;
  };
}

interface BundlerChainUtils {
  CHAIN_ID: {
    RULE: {
      JS: string;
    };
    USE: {
      SWC: string;
    };
  };
}

interface RsbuildPluginApi {
  modifyBundlerChain(
    callback: (chain: BundlerChain, utils: BundlerChainUtils) => void
  ): void;
}

interface RsbuildPlugin {
  name: string;
  setup(api: RsbuildPluginApi): void;
}

function applyFastFlowTransformRsbuildImpl(
  chain: BundlerChain,
  utils: BundlerChainUtils,
  options: TransformOptionsInput = {}
): void {
  chain.module
    .rule(utils.CHAIN_ID.RULE.JS)
    .use(FAST_FLOW_TRANSFORM_LOADER_ID)
    .after(utils.CHAIN_ID.USE.SWC)
    .loader(FAST_FLOW_TRANSFORM_RSPACK_LOADER)
    .options(options);
}

function createRsbuildPlugin(
  options: TransformOptionsInput = {}
): RsbuildPlugin {
  return {
    name: 'rsbuild:fast-flow-transform',
    setup(api) {
      api.modifyBundlerChain((chain, utils) => {
        applyFastFlowTransformRsbuildImpl(chain, utils, options);
      });
    },
  };
}

const pluginFastFlowTransformRsbuild = Object.assign(createRsbuildPlugin, {
  applyFastFlowTransformRsbuild: applyFastFlowTransformRsbuildImpl,
});

export = pluginFastFlowTransformRsbuild;
