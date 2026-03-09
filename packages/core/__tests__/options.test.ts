import { describe, expect, it } from 'vitest';

import { parseOptions } from '../src/transform/options.js';

describe('parseOptions', () => {
  it('normalizes default values for a minimal options object', () => {
    expect(parseOptions({})).toEqual({
      dialect: 'flow-detect',
      enumRuntimeModule: 'flow-enums-runtime',
      format: 'pretty',
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
      reactRuntimeTarget: '18',
      sourcemap: false,
    });
  });
});
