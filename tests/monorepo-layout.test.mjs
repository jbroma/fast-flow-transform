import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();

function readJson(relativePath) {
  return JSON.parse(
    readFileSync(path.join(repoRoot, relativePath), 'utf8'),
  );
}

test('repo exposes a root pnpm workspace and shared TypeScript config', () => {
  assert.equal(existsSync(path.join(repoRoot, 'package.json')), true);
  assert.equal(existsSync(path.join(repoRoot, 'pnpm-workspace.yaml')), true);
  assert.equal(existsSync(path.join(repoRoot, 'tsconfig.base.json')), true);

  const packageJson = readJson('package.json');
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.packageManager, 'pnpm@10.29.2');
});

test('base tsconfig matches the current NodeNext TypeScript baseline', () => {
  const tsconfigBase = readJson('tsconfig.base.json');
  const options = tsconfigBase.compilerOptions;

  assert.equal(options.module, 'nodenext');
  assert.equal(options.moduleResolution, 'nodenext');
  assert.equal(options.target, 'esnext');
  assert.deepEqual(options.lib, ['esnext']);
  assert.deepEqual(options.types, []);
  assert.equal(options.strict, true);
  assert.equal(options.noEmit, true);
  assert.equal(options.moduleDetection, 'force');
  assert.equal(options.verbatimModuleSyntax, true);
  assert.equal(options.isolatedModules, true);
  assert.equal(options.noUncheckedSideEffectImports, true);
  assert.equal(options.noUncheckedIndexedAccess, true);
  assert.equal(options.exactOptionalPropertyTypes, true);
  assert.equal(options.forceConsistentCasingInFileNames, true);
});

test('node packages live under packages/', () => {
  assert.equal(existsSync(path.join(repoRoot, 'packages', 'fft-loader')), true);
  assert.equal(
    existsSync(path.join(repoRoot, 'packages', 'fft-loader', 'package.json')),
    true,
  );
  assert.equal(
    existsSync(
      path.join(repoRoot, 'packages', 'fft-loader-darwin-arm64', 'package.json'),
    ),
    true,
  );
});

test('workspace tsconfigs exclude generated artifacts and test-only files', () => {
  const rootTsconfig = readJson('tsconfig.json');
  const loaderTsconfig = readJson('packages/fft-loader/tsconfig.json');

  assert.deepEqual(rootTsconfig.exclude, [
    'packages/**/__tests__/**',
    'packages/**/artifacts/**',
    'packages/**/bin/**',
    'packages/**/dist/**',
    'target/**',
    'third_party/**',
  ]);

  assert.deepEqual(loaderTsconfig.exclude, [
    '__tests__/**',
    'artifacts/**',
    'bin/**',
    'dist/**',
  ]);
});
