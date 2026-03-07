import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import babel from '@babel/core';

import { loadBenchmarkRuntime } from './runtime.ts';

interface BenchmarkResult {
  coldTimeMs: number;
  warmAverageMs: number;
  warmRuns: number[];
}

interface BenchmarkInput {
  code: string;
  filename: string;
  iterations: number;
}

type BenchmarkRuntime = Awaited<ReturnType<typeof loadBenchmarkRuntime>>;

function durationMs(startNs: bigint, endNs: bigint): number {
  return Number(endNs - startNs) / 1e6;
}

function keepAliveHandle(): NodeJS.Timeout {
  return setInterval(() => null, 60_000);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function runNativeBenchmark(
  input: BenchmarkInput,
  runtime: BenchmarkRuntime
): Promise<BenchmarkResult> {
  const pool = runtime.getPool(runtime.resolveBinaryPath(), 1);
  const transform = () =>
    pool.transform({
      code: input.code,
      dialect: 'flow-detect',
      enumRuntimeModule: 'flow-enums-runtime',
      filename: input.filename,
      format: 'compact',
      reactRuntimeTarget: '18',
    });

  const coldStart = process.hrtime.bigint();
  await transform();
  const warmRuns: number[] = [];

  for (let index = 0; index < input.iterations; index += 1) {
    const start = process.hrtime.bigint();
    await transform();
    warmRuns.push(durationMs(start, process.hrtime.bigint()));
  }

  return {
    coldTimeMs: durationMs(coldStart, process.hrtime.bigint()),
    warmAverageMs: average(warmRuns),
    warmRuns,
  };
}

function runBabelBenchmark(input: BenchmarkInput): BenchmarkResult {
  const transformOnce = () => {
    babel.transformSync(input.code, {
      babelrc: false,
      configFile: false,
      filename: input.filename,
      plugins: [
        ['@babel/plugin-syntax-flow', { enums: true }],
        [
          '@babel/plugin-transform-flow-strip-types',
          { allowDeclareFields: true },
        ],
        'babel-plugin-transform-flow-enums',
      ],
      sourceMaps: true,
      sourceType: 'unambiguous',
    });
  };

  const coldStart = process.hrtime.bigint();
  transformOnce();
  const warmRuns: number[] = [];

  for (let index = 0; index < input.iterations; index += 1) {
    const start = process.hrtime.bigint();
    transformOnce();
    warmRuns.push(durationMs(start, process.hrtime.bigint()));
  }

  return {
    coldTimeMs: durationMs(coldStart, process.hrtime.bigint()),
    warmAverageMs: average(warmRuns),
    warmRuns,
  };
}

function benchmarkInput(): BenchmarkInput {
  const benchDirectory = fileURLToPath(new URL('.', import.meta.url));
  const fixturePath = resolve(benchDirectory, 'fixtures', 'sample.js');
  return {
    code: readFileSync(fixturePath, 'utf8'),
    filename: fixturePath,
    iterations: Number(process.env.BENCH_ITERATIONS ?? 50),
  };
}

async function runBenchmarks(input: BenchmarkInput, runtime: BenchmarkRuntime) {
  const [nativeResult, babelResult] = await Promise.all([
    runNativeBenchmark(input, runtime),
    Promise.resolve(runBabelBenchmark(input)),
  ]);

  return { babelResult, nativeResult };
}

function writeReport(
  input: BenchmarkInput,
  results: Awaited<ReturnType<typeof runBenchmarks>>
): string {
  const benchDirectory = fileURLToPath(new URL('.', import.meta.url));
  const reportPath = resolve(benchDirectory, 'report.json');
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        babel: results.babelResult,
        delta: {
          coldMs:
            results.nativeResult.coldTimeMs - results.babelResult.coldTimeMs,
          warmAverageMs:
            results.nativeResult.warmAverageMs -
            results.babelResult.warmAverageMs,
        },
        fixturePath: input.filename,
        iterations: input.iterations,
        native: results.nativeResult,
      },
      null,
      2
    )
  );
  return reportPath;
}

function printReport(
  reportPath: string,
  results: Awaited<ReturnType<typeof runBenchmarks>>
): void {
  console.log('Benchmark report written to:', reportPath);
  console.table({
    babel: {
      coldMs: results.babelResult.coldTimeMs.toFixed(2),
      warmAverageMs: results.babelResult.warmAverageMs.toFixed(2),
    },
    native: {
      coldMs: results.nativeResult.coldTimeMs.toFixed(2),
      warmAverageMs: results.nativeResult.warmAverageMs.toFixed(2),
    },
  });
}

async function main(): Promise<void> {
  const input = benchmarkInput();
  const runtime = await loadBenchmarkRuntime();
  const keepAlive = keepAliveHandle();

  try {
    const results = await runBenchmarks(input, runtime);
    const reportPath = writeReport(input, results);
    printReport(reportPath, results);
  } finally {
    clearInterval(keepAlive);
    runtime.closeAllPools();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
