'use strict';

const DEFAULT_OPTIONS = Object.freeze({
  dialect: 'flow-detect',
  format: 'compact',
  reactRuntimeTarget: '18',
  enumRuntimeModule: 'flow-enums-runtime',
  sourcemap: true,
  threads: undefined,
});

const DIALECTS = new Set(['flow', 'flow-detect', 'flow-unambiguous']);
const FORMATS = new Set(['compact', 'pretty']);
const REACT_TARGETS = new Set(['18', '19']);

function parseOptions(rawOptions) {
  const incoming = rawOptions == null ? {} : rawOptions;
  const options = {
    ...DEFAULT_OPTIONS,
    ...incoming,
  };

  if (!DIALECTS.has(options.dialect)) {
    throw new Error(
      `Invalid fft-loader option \`dialect\`: ${String(
        options.dialect,
      )}`,
    );
  }

  if (!FORMATS.has(options.format)) {
    throw new Error(
      `Invalid fft-loader option \`format\`: ${String(options.format)}`,
    );
  }

  if (!REACT_TARGETS.has(String(options.reactRuntimeTarget))) {
    throw new Error(
      `Invalid fft-loader option \`reactRuntimeTarget\`: ${String(
        options.reactRuntimeTarget,
      )}`,
    );
  }

  if (typeof options.enumRuntimeModule !== 'string' || options.enumRuntimeModule.length === 0) {
    throw new Error(
      'Invalid fft-loader option `enumRuntimeModule`: expected non-empty string',
    );
  }

  if (options.sourcemap !== true) {
    throw new Error(
      'fft-loader requires `sourcemap: true`; source maps are always emitted',
    );
  }

  if (options.threads != null) {
    if (!Number.isInteger(options.threads) || options.threads <= 0) {
      throw new Error(
        `Invalid fft-loader option \`threads\`: ${String(options.threads)}`,
      );
    }
  }

  return {
    dialect: options.dialect,
    format: options.format,
    reactRuntimeTarget: String(options.reactRuntimeTarget),
    enumRuntimeModule: options.enumRuntimeModule,
    sourcemap: true,
    threads: options.threads,
  };
}

function stableOptionsKey(options) {
  return JSON.stringify({
    dialect: options.dialect,
    format: options.format,
    reactRuntimeTarget: options.reactRuntimeTarget,
    enumRuntimeModule: options.enumRuntimeModule,
    sourcemap: options.sourcemap,
    threads: options.threads,
  });
}

module.exports = {
  parseOptions,
  stableOptionsKey,
};
