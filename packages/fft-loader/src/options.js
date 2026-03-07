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

function validateStringOption(validValues, optionName, value) {
  if (validValues.has(String(value))) {
    return;
  }
  throw new Error(
    `Invalid fft-loader option \`${optionName}\`: ${String(value)}`
  );
}

function validateThreads(threads) {
  if (threads == null) {
    return;
  }
  if (Number.isInteger(threads) && threads > 0) {
    return;
  }
  throw new Error(`Invalid fft-loader option \`threads\`: ${String(threads)}`);
}

function validateOptions(options) {
  if (!DIALECTS.has(options.dialect)) {
    throw new Error(
      `Invalid fft-loader option \`dialect\`: ${String(options.dialect)}`
    );
  }

  validateStringOption(FORMATS, 'format', options.format);
  validateStringOption(
    REACT_TARGETS,
    'reactRuntimeTarget',
    options.reactRuntimeTarget
  );

  if (
    typeof options.enumRuntimeModule !== 'string' ||
    options.enumRuntimeModule.length === 0
  ) {
    throw new Error(
      'Invalid fft-loader option `enumRuntimeModule`: expected non-empty string'
    );
  }

  if (options.sourcemap !== true) {
    throw new Error(
      'fft-loader requires `sourcemap: true`; source maps are always emitted'
    );
  }
  validateThreads(options.threads);
}

function parseOptions(rawOptions) {
  const incoming = rawOptions == null ? {} : rawOptions;
  const options = {
    ...DEFAULT_OPTIONS,
    ...incoming,
  };

  validateOptions(options);
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
