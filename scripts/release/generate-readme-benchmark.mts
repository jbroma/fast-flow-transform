import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function repoRoot(): string {
  return fileURLToPath(new URL('../..', import.meta.url));
}

function benchmarkAsset(path: string): string {
  return resolve(repoRoot(), path);
}

function svgVersion(svgPath: string): string {
  return createHash('sha256')
    .update(readFileSync(svgPath))
    .digest('hex')
    .slice(0, 12);
}

function updateReadmeBenchmarkImage(svgPath: string): void {
  const readmePath = benchmarkAsset('README.md');
  const readme = readFileSync(readmePath, 'utf8');
  const next = readme.replace(
    /!\[fast-flow-transform benchmark summary]\(\.\/assets\/readme-benchmark\.svg(?:\?v=[^)]+)?\)/,
    `![fast-flow-transform benchmark summary](./assets/readme-benchmark.svg?v=${svgVersion(svgPath)})`
  );

  if (next === readme) {
    throw new Error('Could not update README benchmark image URL');
  }

  writeFileSync(readmePath, next);
}

function run(
  command: string,
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {}
): void {
  const result = spawnSync(command, args, {
    cwd: repoRoot(),
    env: { ...process.env, ...envOverrides },
    stdio: 'inherit',
  });

  if (result.status === 0) {
    return;
  }

  throw new Error(
    `Command failed: ${[command, ...args].join(' ')} (${String(result.status)})`
  );
}

function main(): void {
  const jsonPath = benchmarkAsset('assets/readme-benchmark.json');
  const svgPath = benchmarkAsset('assets/readme-benchmark.svg');

  run('pnpm', ['sync-binding']);
  run('pnpm', ['--filter', 'fast-flow-transform', 'build']);
  run('pnpm', ['--filter', '@fft/bench', 'benchmark'], {
    BENCH_ITERATIONS: '1000',
    BENCH_JSON_PATH: jsonPath,
  });
  run('pnpm', ['exec', 'oxfmt', '-c', '.oxfmtrc.json', jsonPath]);
  run('pnpm', ['--filter', '@fft/bench', 'render:readme'], {
    BENCH_JSON_PATH: jsonPath,
    BENCH_SVG_PATH: svgPath,
  });
  updateReadmeBenchmarkImage(svgPath);
}

main();
