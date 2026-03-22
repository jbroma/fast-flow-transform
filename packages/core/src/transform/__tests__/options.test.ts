import { describe, expect, it } from 'vitest';

import { parseOptions } from '../options.js';

describe('parseOptions', () => {
  it('normalizes default values for a minimal options object', () => {
    expect(parseOptions({})).toEqual({
      dialect: 'flow-detect',
      comments: false,
      format: 'compact',
      removeEmptyImports: true,
      reactRuntimeTarget: '19',
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
      comments: false,
      format: 'compact',
      removeEmptyImports: true,
      reactRuntimeTarget: '19',
      sourcemap: false,
    });
  });

  it('accepts removeEmptyImports false', () => {
    expect(
      parseOptions({
        removeEmptyImports: false,
      })
    ).toEqual({
      dialect: 'flow-detect',
      comments: false,
      format: 'compact',
      removeEmptyImports: false,
      reactRuntimeTarget: '19',
      sourcemap: true,
    });
  });

  it('accepts preserve as a format and keeps sourcemaps enabled by default', () => {
    expect(
      parseOptions({
        comments: true,
        format: 'preserve',
      } as never)
    ).toEqual({
      dialect: 'flow-detect',
      comments: true,
      format: 'preserve',
      removeEmptyImports: true,
      reactRuntimeTarget: '19',
      sourcemap: true,
    });
  });
});
