import { spawnSync } from 'node:child_process';
import {
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function repoRoot(): string {
  return fileURLToPath(new URL('../..', import.meta.url));
}

function benchmarkAsset(path: string): string {
  return resolve(repoRoot(), path);
}

function benchmarkTimestamp(jsonPath: string): string {
  const report = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
    generatedAt?: unknown;
  };

  if (typeof report.generatedAt !== 'string') {
    throw new TypeError('Benchmark report is missing generatedAt');
  }

  return report.generatedAt
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function timestampedSvgPath(svgPath: string, jsonPath: string): string {
  const version = benchmarkTimestamp(jsonPath);
  const dir = dirname(svgPath);
  return resolve(dir, `bench-${version}.svg`);
}

function timestampedJsonPath(jsonPath: string): string {
  const version = benchmarkTimestamp(jsonPath);
  const dir = dirname(jsonPath);
  return resolve(dir, `bench-${version}.json`);
}

function cleanupOldBenchSvgs(svgPath: string, nextSvgPath: string): void {
  const dir = dirname(nextSvgPath);

  for (const entry of readdirSync(dir)) {
    if (
      !/^bench-\d{8}T\d{6}Z\.svg$/.test(entry) &&
      !/^readme-benchmark\.[0-9a-f]{12}\.svg$/.test(entry) &&
      entry !== 'readme-benchmark.svg'
    ) {
      continue;
    }

    const path = resolve(dir, entry);
    if (path === svgPath || path === nextSvgPath) {
      continue;
    }

    rmSync(path, { force: true });
  }
}

function cleanupOldBenchJsons(jsonPath: string, nextJsonPath: string): void {
  const dir = dirname(nextJsonPath);

  for (const entry of readdirSync(dir)) {
    if (
      !/^bench-\d{8}T\d{6}Z\.json$/.test(entry) &&
      entry !== 'readme-benchmark.json'
    ) {
      continue;
    }

    const path = resolve(dir, entry);
    if (path === jsonPath || path === nextJsonPath) {
      continue;
    }

    rmSync(path, { force: true });
  }
}

function finalizeJson(jsonPath: string): string {
  const nextJsonPath = timestampedJsonPath(jsonPath);
  cleanupOldBenchJsons(jsonPath, nextJsonPath);
  rmSync(nextJsonPath, { force: true });
  renameSync(jsonPath, nextJsonPath);
  return nextJsonPath;
}

function finalizeSvg(svgPath: string, jsonPath: string): string {
  const nextSvgPath = timestampedSvgPath(svgPath, jsonPath);
  cleanupOldBenchSvgs(svgPath, nextSvgPath);
  rmSync(nextSvgPath, { force: true });
  renameSync(svgPath, nextSvgPath);
  return nextSvgPath;
}

function updateReadmeBenchmarkLinks(svgPath: string, jsonPath: string): void {
  const readmePath = benchmarkAsset('README.md');
  const readme = readFileSync(readmePath, 'utf8');
  const imageName = basename(svgPath);
  const imageUpdated = readme.replace(
    /!\[fast-flow-transform benchmark summary]\(\.\/assets\/(?:bench-\d{8}T\d{6}Z|readme-benchmark(?:\.[0-9a-f]{12})?|readme-benchmark)\.svg(?:\?v=[^)]+)?\)/,
    `![fast-flow-transform benchmark summary](./assets/${imageName})`
  );
  const jsonName = basename(jsonPath);
  const next = imageUpdated.replace(
    /\[`assets\/(?:bench-\d{8}T\d{6}Z|readme-benchmark)\.json`]\(\.\/assets\/(?:bench-\d{8}T\d{6}Z|readme-benchmark)\.json\)/,
    `[\`assets/${jsonName}\`](./assets/${jsonName})`
  );

  if (next === readme) {
    throw new Error('Could not update README benchmark asset links');
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

  run('pnpm', [
    '--dir',
    'packages/core',
    'exec',
    'napi',
    'build',
    '--platform',
    '--release',
    '--manifest-path',
    '../../crates/fft_node/Cargo.toml',
    '--package-json-path',
    'package.json',
    '--output-dir',
    'binding',
    '--js',
    'bindings.cjs',
    '--dts',
    'bindings.d.cts',
  ]);
  run('pnpm', ['--filter', 'fast-flow-transform', 'build']);
  run('pnpm', ['--filter', '@fft/bench', 'benchmark'], {
    BENCH_ITERATIONS: '1000',
    BENCH_JSON_PATH: jsonPath,
  });
  run('pnpm', ['exec', 'oxfmt', '-c', '.oxfmtrc.json', jsonPath]);
  const finalJsonPath = finalizeJson(jsonPath);
  run('pnpm', ['--filter', '@fft/bench', 'render:readme'], {
    BENCH_JSON_PATH: finalJsonPath,
    BENCH_SVG_PATH: svgPath,
  });
  updateReadmeBenchmarkLinks(
    finalizeSvg(svgPath, finalJsonPath),
    finalJsonPath
  );
}

main();
