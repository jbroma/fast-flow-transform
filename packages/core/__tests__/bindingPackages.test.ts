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

describe('binding packages', () => {
  it('use plain root index.js entries without TypeScript baggage', () => {
    for (const packageName of bindingPackageNames) {
      const packageRoot = path.join(workspaceRoot, 'bindings', packageName);
      const packageJson = JSON.parse(
        readFileSync(path.join(packageRoot, 'package.json'), 'utf8')
      ) as {
        exports: Record<string, unknown>;
        files: string[];
        main: string;
        types?: string;
      };

      expect(existsSync(path.join(packageRoot, 'index.js'))).toBe(true);
      expect(existsSync(path.join(packageRoot, 'index.ts'))).toBe(false);
      expect(existsSync(path.join(packageRoot, 'tsconfig.json'))).toBe(false);
      expect(existsSync(path.join(packageRoot, 'tsconfig.build.json'))).toBe(
        false
      );
      expect(packageJson.files).toEqual(['index.js', 'bin']);
      expect(packageJson.main).toBe('./index.js');
      expect(packageJson.types).toBeUndefined();
      expect(packageJson.exports).toEqual({
        '.': {
          default: './index.js',
        },
      });
    }
  });
});
