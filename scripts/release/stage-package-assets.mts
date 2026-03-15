import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface ManagedFile {
  originalSource: string | null;
  path: string;
}

interface PackageManifest {
  name: string;
  publishConfig?: {
    cpu?: string[];
    os?: string[];
  };
}

interface State {
  files: ManagedFile[];
}

const MAIN_PACKAGE_NAME = 'fast-flow-transform';
const SHARED_FILE_NAMES = ['LICENSE', 'THIRD_PARTY_LICENSES'] as const;
const STATE_FILE_NAME = '.publish-assets-state.json';

function packageDir(): string {
  return process.cwd();
}

function workspaceRoot(): string {
  return resolve(fileURLToPath(new URL('../..', import.meta.url)));
}

function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

function statePath(root: string): string {
  return join(root, STATE_FILE_NAME);
}

function readManifest(root: string): PackageManifest {
  return JSON.parse(readText(join(root, 'package.json'))) as PackageManifest;
}

function readState(root: string): State | null {
  const path = statePath(root);
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readText(path)) as State;
}

function writeState(root: string, state: State): void {
  writeFileSync(statePath(root), `${JSON.stringify(state, null, 2)}\n`);
}

function rootFileSource(fileName: (typeof SHARED_FILE_NAMES)[number]): string {
  return readText(join(workspaceRoot(), fileName));
}

function manageFile(
  root: string,
  state: State,
  relativePath: string,
  source: string
): void {
  const path = join(root, relativePath);
  const originalSource = existsSync(path) ? readText(path) : null;

  writeFileSync(path, source);
  state.files.push({ originalSource, path: relativePath });
}

function restoreManagedFile(root: string, file: ManagedFile): void {
  const path = join(root, file.path);

  if (file.originalSource === null) {
    rmSync(path, { force: true });
    return;
  }

  writeFileSync(path, file.originalSource);
}

function cleanup(root: string): void {
  const state = readState(root);

  if (!state) {
    return;
  }

  const files = [...state.files];
  let file = files.pop();

  while (file) {
    restoreManagedFile(root, file);
    file = files.pop();
  }

  rmSync(statePath(root), { force: true });
}

function isBindingPackage(manifest: PackageManifest): boolean {
  return (
    manifest.name !== MAIN_PACKAGE_NAME &&
    manifest.name.startsWith(`${MAIN_PACKAGE_NAME}-`)
  );
}

function bindingTarget(manifest: PackageManifest): string {
  const os = manifest.publishConfig?.os?.[0] ?? 'platform';
  const cpu = manifest.publishConfig?.cpu?.[0] ?? 'arch';
  return `${os}-${cpu}`;
}

function bindingReadme(manifest: PackageManifest): string {
  const target = bindingTarget(manifest);

  return `# ${manifest.name}

Prebuilt native binding for [\`fast-flow-transform\`](https://www.npmjs.com/package/fast-flow-transform).

This package contains the ${target} native addon used by the main package. Most users should install \`fast-flow-transform\` directly instead of depending on this package by name.
`;
}

function main(): void {
  const root = packageDir();

  cleanup(root);

  const manifest = readManifest(root);
  const state: State = { files: [] };

  for (const fileName of SHARED_FILE_NAMES) {
    manageFile(root, state, fileName, rootFileSource(fileName));
  }

  if (isBindingPackage(manifest)) {
    manageFile(root, state, 'README.md', bindingReadme(manifest));
  }

  writeState(root, state);
}

main();
