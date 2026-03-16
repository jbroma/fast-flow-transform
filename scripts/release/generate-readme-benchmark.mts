import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function repoRoot(): string {
  return fileURLToPath(new URL('../..', import.meta.url));
}

function benchmarkAsset(path: string): string {
  return resolve(repoRoot(), path);
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
}

main();
