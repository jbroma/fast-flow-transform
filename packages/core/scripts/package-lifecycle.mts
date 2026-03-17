import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(packageRoot, '..', '..');

function ensureArtifactsDir(): void {
  mkdirSync(join(repoRoot, 'artifacts'), { recursive: true });
}

function cleanDist(): void {
  rmSync(join(packageRoot, 'dist'), { force: true, recursive: true });
}

function main(): void {
  const action = process.argv.at(2);

  if (action === 'clean-dist') {
    cleanDist();
    return;
  }

  if (action === 'ensure-artifacts-dir') {
    ensureArtifactsDir();
    return;
  }

  throw new Error(`Unknown package lifecycle action: ${action ?? '<none>'}`);
}

main();
