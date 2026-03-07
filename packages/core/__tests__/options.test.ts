import { describe, expect, it } from 'vitest';

import { parseOptions } from '../src/options.js';

describe('parseOptions', () => {
  it('normalizes default values for a minimal options object', () => {
    expect(parseOptions({ sourcemap: true })).toEqual({
      dialect: 'flow-detect',
      enumRuntimeModule: 'flow-enums-runtime',
      format: 'compact',
      reactRuntimeTarget: '18',
      sourcemap: true,
      threads: undefined,
    });
  });

  it('rejects invalid thread counts', () => {
    expect(() =>
      parseOptions({
        sourcemap: true,
        threads: 0,
      })
    ).toThrow('Invalid fast-flow-transform option `threads`: 0');
  });
});
