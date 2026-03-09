import { describe, expect, it } from 'vitest';

import { parseOptions } from '../src/transform/options.js';

describe('parseOptions', () => {
  it('normalizes default values for a minimal options object', () => {
    expect(parseOptions({})).toEqual({
      dialect: 'flow-detect',
      enumRuntimeModule: 'flow-enums-runtime',
      format: 'pretty',
      preserveComments: false,
      preserveWhitespace: false,
      reactRuntimeTarget: '18',
      sourcemap: true,
    });
  });

  it('accepts sourcemap false', () => {
    expect(
      parseOptions({
        sourcemap: false,
      })
    ).toEqual({
      dialect: 'flow-detect',
      enumRuntimeModule: 'flow-enums-runtime',
      format: 'pretty',
      preserveComments: false,
      preserveWhitespace: false,
      reactRuntimeTarget: '18',
      sourcemap: false,
    });
  });

  it('disables sourcemaps by default when preserveWhitespace is enabled', () => {
    expect(
      parseOptions({
        preserveWhitespace: true,
      } as never)
    ).toEqual({
      dialect: 'flow-detect',
      enumRuntimeModule: 'flow-enums-runtime',
      format: 'pretty',
      preserveComments: false,
      preserveWhitespace: true,
      reactRuntimeTarget: '18',
      sourcemap: false,
    });
  });

  it('accepts preserveComments without preserveWhitespace', () => {
    expect(
      parseOptions({
        preserveComments: true,
      } as never)
    ).toEqual({
      dialect: 'flow-detect',
      enumRuntimeModule: 'flow-enums-runtime',
      format: 'pretty',
      preserveComments: true,
      preserveWhitespace: false,
      reactRuntimeTarget: '18',
      sourcemap: true,
    });
  });
});
