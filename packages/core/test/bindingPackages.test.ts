import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  it('describe native .node artifacts with publish-time license metadata only', () => {
    for (const packageName of bindingPackageNames) {
      const packageRoot = path.join(workspaceRoot, 'bindings', packageName);
      const packageJson = JSON.parse(
        readFileSync(path.join(packageRoot, 'package.json'), 'utf8')
      ) as {
        files: string[];
        main: string;
        types?: string;
      };

      expect({
        files: packageJson.files,
        fsEntriesPresent: {
          indexJs: existsSync(path.join(packageRoot, 'index.js')),
          indexTs: existsSync(path.join(packageRoot, 'index.ts')),
          tsconfig: existsSync(path.join(packageRoot, 'tsconfig.json')),
          tsconfigBuild: existsSync(
            path.join(packageRoot, 'tsconfig.build.json')
          ),
        },
        main: packageJson.main,
        types: packageJson.types,
      }).toStrictEqual({
        files: [
          expectedBindingFile(packageName),
          'LICENSE',
          'THIRD_PARTY_LICENSES',
        ],
        fsEntriesPresent: {
          indexJs: false,
          indexTs: false,
          tsconfig: false,
          tsconfigBuild: false,
        },
        main: `./${expectedBindingFile(packageName)}`,
        types: undefined,
      });
    }
  });
});
