import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface ManagedFile {
  originalSource: string | null;
  path: string;
}

interface State {
  files: ManagedFile[];
}

interface PackageManifest {
  version: string;
}

const BINDING_ENTRY_PATH = 'binding/bindings.cjs';
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

function readPackageManifest(path: string): PackageManifest {
  return JSON.parse(readText(path)) as PackageManifest;
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

function packageVersion(root: string): string {
  return readPackageManifest(join(root, 'package.json')).version;
}

function rewriteBindingWrapperVersion(source: string, version: string): string {
  return source
    .replaceAll(/(bindingPackageVersion !== )'[^']+'/g, `$1'${version}'`)
    .replaceAll(
      /(expected )[^ ]+( but got \$\{bindingPackageVersion\})/g,
      `$1${version}$2`
    );
}

function syncBindingWrapperVersion(root: string, state: State): void {
  const path = join(root, BINDING_ENTRY_PATH);

  if (!existsSync(path)) {
    return;
  }

  manageFile(
    root,
    state,
    BINDING_ENTRY_PATH,
    rewriteBindingWrapperVersion(readText(path), packageVersion(root))
  );
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

function main(): void {
  const root = packageDir();

  cleanup(root);

  const state: State = { files: [] };

  for (const fileName of SHARED_FILE_NAMES) {
    manageFile(root, state, fileName, rootFileSource(fileName));
  }

  syncBindingWrapperVersion(root, state);

  writeState(root, state);
}

main();
