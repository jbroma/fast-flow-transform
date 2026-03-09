import { describe, expect, it } from 'vitest';

import {
  bindingFileNameFor,
  platformPackageNameFor,
  resolveBindingPathForTest,
} from '../src/transform/resolveBinding.js';

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

describe('bindingFileNameFor', () => {
  it('uses platform-aware .node names', () => {
    expect(bindingFileNameFor('darwin', 'arm64')).toBe(
      'fast-flow-transform.darwin-arm64.node'
    );
    expect(bindingFileNameFor('linux', 'x64')).toBe(
      'fast-flow-transform.linux-x64.node'
    );
  });
});

describe('resolveBindingPathForTest', () => {
  it('prefers an explicit FFT_NATIVE_BINDING override', () => {
    const bindingPath = '/tmp/custom.node';

    expect(
      resolveBindingPathForTest({
        arch: 'arm64',
        env: {
          FFT_NATIVE_BINDING: bindingPath,
        },
        exists: (candidatePath) => candidatePath === bindingPath,
        moduleDirectory: '/repo/packages/core/dist/transform',
        platform: 'darwin',
        resolveModule: () => {
          throw new Error('optional package resolution should not run');
        },
      })
    ).toBe(bindingPath);
  });

  it('uses the installed platform package when it resolves to a .node file', () => {
    const bindingPath =
      '/repo/bindings/fast-flow-transform-darwin-arm64/fast-flow-transform.darwin-arm64.node';

    expect(
      resolveBindingPathForTest({
        arch: 'arm64',
        env: {},
        exists: () => false,
        moduleDirectory: '/repo/packages/core/dist/transform',
        platform: 'darwin',
        resolveModule: (packageName) => {
          expect(packageName).toBe('fast-flow-transform-darwin-arm64');
          return bindingPath;
        },
      })
    ).toBe(bindingPath);
  });

  it('falls back to the workspace build artifact', () => {
    const bindingPath =
      '/repo/target/release/fast-flow-transform.darwin-arm64.node';

    expect(
      resolveBindingPathForTest({
        arch: 'arm64',
        env: {},
        exists: (candidatePath) => candidatePath === bindingPath,
        moduleDirectory: '/repo/packages/core/dist/transform',
        platform: 'darwin',
        resolveModule: () => {
          throw new Error('optional package not installed');
        },
      })
    ).toBe(bindingPath);
  });

  it('throws when no binding artifact can be resolved', () => {
    expect(() =>
      resolveBindingPathForTest({
        arch: 'arm64',
        env: {},
        exists: () => false,
        moduleDirectory: '/repo/packages/core/dist/transform',
        platform: 'darwin',
        resolveModule: () => {
          throw new Error('optional package not installed');
        },
      })
    ).toThrow(
      'Unable to resolve fast-flow-transform native binding for darwin-arm64. Install the matching optional package or set FFT_NATIVE_BINDING.'
    );
  });
});
