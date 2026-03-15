import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface ManagedFile {
  originalSource: string | null;
  path: string;
}

interface State {
  files: ManagedFile[];
}

const STATE_FILE_NAME = '.publish-assets-state.json';

function packageDir(): string {
  return process.cwd();
}

function statePath(root: string): string {
  return join(root, STATE_FILE_NAME);
}

function readState(root: string): State | null {
  const path = statePath(root);
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, 'utf8')) as State;
}

function restoreManagedFile(root: string, file: ManagedFile): void {
  const path = join(root, file.path);

  if (file.originalSource === null) {
    rmSync(path, { force: true });
    return;
  }

  writeFileSync(path, file.originalSource);
}

function main(): void {
  const root = packageDir();
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

main();
