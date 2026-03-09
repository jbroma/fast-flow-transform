import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);

const bindingPackageNames = [
  'fast-flow-transform-darwin-arm64',
  'fast-flow-transform-darwin-x64',
  'fast-flow-transform-linux-arm64',
  'fast-flow-transform-linux-x64',
  'fast-flow-transform-win32-arm64',
  'fast-flow-transform-win32-x64',
] as const;

function expectedBindingFile(
  packageName: (typeof bindingPackageNames)[number]
) {
  return `${packageName.replace('fast-flow-transform-', 'fast-flow-transform.')}.node`;
}

describe('binding packages', () => {
  it('describe native .node artifacts without TypeScript baggage', () => {
    for (const packageName of bindingPackageNames) {
      const packageRoot = path.join(workspaceRoot, 'bindings', packageName);
      const packageJson = JSON.parse(
        readFileSync(path.join(packageRoot, 'package.json'), 'utf8')
      ) as {
        files: string[];
        main: string;
        types?: string;
      };

      expect(existsSync(path.join(packageRoot, 'index.ts'))).toBe(false);
      expect(existsSync(path.join(packageRoot, 'index.js'))).toBe(false);
      expect(existsSync(path.join(packageRoot, 'tsconfig.json'))).toBe(false);
      expect(existsSync(path.join(packageRoot, 'tsconfig.build.json'))).toBe(
        false
      );
      expect(packageJson.files).toEqual([expectedBindingFile(packageName)]);
      expect(packageJson.main).toBe(`./${expectedBindingFile(packageName)}`);
      expect(packageJson.types).toBeUndefined();
    }
  });
});
