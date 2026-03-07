import { describe, expect, it } from 'vitest';

import { platformPackageNameFor } from '../src/resolveBinary.js';

describe('platformPackageNameFor', () => {
  it('returns the renamed package for each supported target', () => {
    expect(platformPackageNameFor('darwin', 'arm64')).toBe(
      'fast-flow-transform-darwin-arm64'
    );
    expect(platformPackageNameFor('darwin', 'x64')).toBe(
      'fast-flow-transform-darwin-x64'
    );
    expect(platformPackageNameFor('linux', 'arm64')).toBe(
      'fast-flow-transform-linux-arm64'
    );
    expect(platformPackageNameFor('linux', 'x64')).toBe(
      'fast-flow-transform-linux-x64'
    );
    expect(platformPackageNameFor('win32', 'arm64')).toBe(
      'fast-flow-transform-win32-arm64'
    );
    expect(platformPackageNameFor('win32', 'x64')).toBe(
      'fast-flow-transform-win32-x64'
    );
  });

  it('returns null for unsupported targets', () => {
    expect(platformPackageNameFor('freebsd', 'x64')).toBeNull();
  });
});
